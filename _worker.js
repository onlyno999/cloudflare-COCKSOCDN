// ====================================================================
// Cloudflare Worker: VL over WebSocket + SOCKS5
// --------------------------------------------------------------------
// 环境变量 (Vars) 说明：
//   UUID        必填，VL 用户的 UUID                        
//   ID          可选，订阅路径 (默认 123456)                 
//   SOCKS5_PROXY	必填 user:pass@127.0.0.1:1080 否则就走直连
//   隐藏        可选，true|false，true 时订阅接口只返回嘲讽语
// ====================================================================
import { connect } from 'cloudflare:sockets';

// ------------------------------------------------------ SOCKS5 相关 ------------------------------------------------------

let socks5代理列表 = [];

/**
 * 创建一个SOCKS5代理连接。
 * @param {number} addrType 目标地址类型 (1: IPv4, 2: 域名, 3: IPv6)。
 * @param {string} targetHost 最终目标服务器的地址。
 * @param {number} targetPort 最终目标服务器的端口。
 * @param {string} socks5Config SOCKS5代理配置字符串 (user:pass@host:port)。
 * @returns {Promise<object|null>} 成功则返回Cloudflare Socket对象，失败则返回null。
 */
async function 创建SOCKS5接口(addrType, targetHost, targetPort, socks5Config) {
  const { username, password, hostname, port } = 解析SOCKS5配置(socks5Config);
  const SOCKS5接口 = connect({ hostname, port }); // 连接SOCKS5代理服务器本身

  try {
    await SOCKS5接口.opened; // 等待连接建立
  } catch (e) {
    console.error(`连接SOCKS5代理失败: ${hostname}:${port}, 错误: ${e.message}`);
    return null;
  }

  const writer = SOCKS5接口.writable.getWriter();
  const reader = SOCKS5接口.readable.getReader();
  const encoder = new TextEncoder();

  // SOCKS5 握手阶段1: 客户端问候 (支持无认证和用户名/密码认证)
  await writer.write(new Uint8Array([5, 2, 0, 2]));
  let res = (await reader.read()).value; // 读取代理的响应

  if (!res || res.length < 2) {
    return 关闭接口并退出("SOCKS5问候响应无效");
  }

  // SOCKS5 握手阶段2: 认证 (如果需要)
  if (res[1] === 0x02) { // 代理选择了用户名/密码认证
    if (!username || !password) {
      return 关闭接口并退出("SOCKS5代理需要认证但未提供凭据");
    }
    const auth = new Uint8Array([1, username.length, ...encoder.encode(username), password.length, ...encoder.encode(password)]);
    await writer.write(auth);
    res = (await reader.read()).value; // 读取认证结果

    if (!res || res.length < 2 || res[1] !== 0x00) {
      return 关闭接口并退出("SOCKS5认证失败");
    }
  } else if (res[1] !== 0x00) { // 代理选择了不支持的认证方式或认证失败
    return 关闭接口并退出(`SOCKS5代理选择不支持的认证方式: 0x${res[1].toString(16)}`);
  }

  // SOCKS5 握手阶段3: 连接请求
  let destAddr;
  switch (addrType) {
    case 1: // IPv4
      destAddr = new Uint8Array([1, ...targetHost.split(".").map(Number)]);
      break;
    case 2: // 域名
      destAddr = new Uint8Array([3, targetHost.length, ...encoder.encode(targetHost)]);
      break;
    case 3: // IPv6
      destAddr = new Uint8Array([4, ...解析IPv6地址(targetHost)]);
      break;
    default:
      return 关闭接口并退出("不支持的目标地址类型");
  }

  const req = new Uint8Array([5, 1, 0, ...destAddr, targetPort >> 8, targetPort & 0xff]); // 构建连接请求
  await writer.write(req);
  res = (await reader.read()).value; // 读取连接请求响应

  if (!res || res.length < 2 || res[1] !== 0x00) {
    return 关闭接口并退出("SOCKS5连接目标失败");
  }

  writer.releaseLock();
  reader.releaseLock();
  return SOCKS5接口; // 返回成功建立的SOCKS5连接

  /**
   * 辅助函数：关闭SOCKS5接口并退出。
   * @param {string} reason 关闭原因。
   * @returns {null}
   */
  function 关闭接口并退出(reason = "未知SOCKS5错误") {
    console.error(`SOCKS5连接失败: ${reason}`);
    try { writer.releaseLock(); } catch (e) {}
    try { reader.releaseLock(); } catch (e) {}
    try { SOCKS5接口.close(); } catch (e) {}
    return null;
  }
}

/**
 * 解析SOCKS5代理配置字符串。
 * @param {string} str SOCKS5配置字符串。
 * @returns {object} 包含username, password, hostname, port的对象。
 */
function 解析SOCKS5配置(str) {
  const [latter, former] = str.split("@").reverse();
  let username, password;
  if (former) {
    [username, password] = former.split(":");
  }
  const parts = latter.split(":");
  const port = Number(parts.pop());
  const hostname = parts.join(":");
  return { username, password, hostname, port };
}

/**
 * 解析IPv6地址字符串为字节数组。
 * @param {string} ipv6 IPv6地址字符串。
 * @returns {number[]} 字节数组。
 */
function 解析IPv6地址(ipv6) {
  const segments = ipv6.split(":").map(seg => seg.padStart(4, '0'));
  const bytes = [];
  for (let seg of segments) {
    const high = parseInt(seg.slice(0, 2), 16);
    const low = parseInt(seg.slice(2, 4), 16);
    bytes.push(high, low);
  }
  return bytes;
}

/**
 * 初始化SOCKS5代理列表。
 * @param {object} env 环境变量对象。
 */
function 初始化Socks5代理(env) {
  // 读取SOCKS5_PROXY环境变量，支持多行配置
  const raw = 读取环境变量('SOCKS5_PROXY', [], env);
  if (typeof raw === 'string') {
    socks5代理列表 = raw.split('\n').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(raw)) {
    socks5代理列表 = raw;
  }
  console.log(`已加载 ${socks5代理列表.length} 个SOCKS5代理。`);
}

// ------------------------------------------------------ 主逻辑开始 ------------------------------------------------------

// 全局配置变量，可由环境变量覆盖
let 转码 = 'vl', 转码2 = 'ess', 符号 = '://';
let 哎呀呀这是我的ID啊 = "123456"; // 订阅路径ID
let 哎呀呀这是我的VL密钥 = "188eb8bd-7154-4e20-91ec-dfadaf1f632b"; // VLess UUID
let 私钥开关 = false; // 是否启用订阅私钥验证
let 咦这是我的私钥哎 = ""; // 订阅私钥
let 隐藏订阅 = false; // 是否隐藏订阅内容
let 嘲讽语 = "哎呀你找到了我，但是我就是不给你看，气不气，嘿嘿嘿"; // 订阅隐藏时的提示语
let 我的优选 = []; // 优选IP列表
let 我的优选TXT = ['']; // 优选IP TXT文件URL
let 我的节点名字 = '天书-SOCKS5'; // 订阅节点名称

/**
 * 读取环境变量的辅助函数。
 * @param {string} name 环境变量名称。
 * @param {*} fallback 默认值。
 * @param {object} env 环境变量对象。
 * @returns {*} 读取到的环境变量值或默认值。
 */
const 读取环境变量 = (name, fallback, env) => {
  const raw = import.meta?.env?.[name] ?? env?.[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed.includes('\n')) return trimmed.split('\n').map(i => i.trim()).filter(Boolean);
    if (!isNaN(trimmed) && trimmed !== '') return Number(trimmed);
    return trimmed;
  }
  return raw;
};

// Worker的入口点
export default {
  async fetch(访问请求, env) {
    // 每次请求都重新初始化配置，以便环境变量更新后立即生效
    哎呀呀这是我的ID啊 = 读取环境变量('ID', 哎呀呀这是我的ID啊, env);
    哎呀呀这是我的VL密钥 = 读取环境变量('UUID', 哎呀呀这是我的VL密钥, env);
    我的优选 = 读取环境变量('IP', 我的优选, env);
    我的优选TXT = 读取环境变量('TXT', 我的优选TXT, env);
    咦这是我的私钥哎 = 读取环境变量('私钥', 咦这是我的私钥哎, env);
    隐藏订阅 = 读取环境变量('隐藏', 隐藏订阅, env);
    私钥开关 = 读取环境变量('私钥开关', 私钥开关, env);
    嘲讽语 = 读取环境变量('嘲讽语', 嘲讽语, env);
    我的节点名字 = 读取环境变量('我的节点名字', 我的节点名字, env);
    初始化Socks5代理(env); // 初始化SOCKS5代理列表

    const 升级标头 = 访问请求.headers.get('Upgrade');
    const url = new URL(访问请求.url);

    // 处理非WebSocket请求 (订阅和普通HTTP访问)
    if (!升级标头 || 升级标头 !== 'websocket') {
      // 尝试从TXT URL获取优选IP列表
      if (我的优选TXT && 我的优选TXT.length > 0 && 我的优选TXT[0] !== '') {
        const 链接数组 = Array.isArray(我的优选TXT) ? 我的优选TXT : [我的优选TXT];
        const 所有节点 = [];
        for (const 链接 of 链接数组) {
          try {
            const 响应 = await fetch(链接);
            if (响应.ok) {
              const 文本 = await 响应.text();
              所有节点.push(...文本.split('\n').map(x => x.trim()).filter(Boolean));
            } else {
              console.warn(`无法从 ${链接} 获取优选列表: 状态 ${响应.status}`);
            }
          } catch (e) {
            console.error(`获取优选列表时出错 (${链接}): ${e.message}`);
          }
        }
        if (所有节点.length > 0) {
          我的优选 = 所有节点;
          console.log(`成功从TXT URL加载 ${我的优选.length} 个优选节点。`);
        }
      }

      switch (url.pathname) {
        case `/${哎呀呀这是我的ID啊}`: // 提示订阅页
          return new Response(给我订阅页面(哎呀呀这是我的ID啊, 访问请求.headers.get('Host')), {
            status: 200,
            headers: { "Content-Type": "text/plain;charset=utf-8" }
          });
        case `/${哎呀呀这是我的ID啊}/${转码}${转码2}`: // VLess订阅链接
          // 根据私钥开关和隐藏订阅判断返回内容
          if (私钥开关) {
            return new Response("私钥功能已开启，此订阅方式不可用。请使用支持私钥的客户端或关闭私钥功能。", { status: 400 });
          }
          return new Response(隐藏订阅 ? 嘲讽语 : 给我通用配置文件(访问请求.headers.get('Host')), {
            status: 200,
            headers: { "Content-Type": "text/plain;charset=utf-8" }
          });
        default:
          return new Response('Hello World! 访问路径未匹配。', { status: 200 }); // 默认返回，避免404
      }
    } else { // 处理WebSocket请求 (VLess流量)
      // 私钥验证
      if (私钥开关 && 访问请求.headers.get('my-key') !== 咦这是我的私钥哎) {
        return new Response('私钥验证失败', { status: 403 });
      }

      const enc = 访问请求.headers.get('sec-websocket-protocol');
      const data = 使用64位加解密(enc); // 解密VLess数据

      // VLess UUID验证
      if (验证VL的密钥(new Uint8Array(data.slice(1, 17))) !== 哎呀呀这是我的VL密钥) {
        return new Response('无效的UUID', { status: 403 });
      }

      // 解析VLess头部并建立TCP连接 (可能通过SOCKS5代理)
      let tcpSocket, initialData;
      try {
        ({ tcpSocket, initialData } = await 解析VL标头(data));
      } catch (error) {
        console.error(`解析VL头部或建立连接失败: ${error.message}`);
        return new Response(`连接目标失败: ${error.message}`, { status: 500 });
      }
      
      // 升级WebSocket连接并开始数据传输
      return await 升级WS请求(访问请求, tcpSocket, initialData);
    }
  }
};

/**
 * 升级WebSocket请求，并开始数据传输。
 * @param {Request} 访问请求 原始请求。
 * @param {object} tcpSocket 已建立的TCP连接。
 * @param {ArrayBuffer} initialData 初始数据。
 * @returns {Response} WebSocket升级响应。
 */
async function 升级WS请求(访问请求, tcpSocket, initialData) {
  const [客户端, WS接口] = new WebSocketPair(); // 创建WebSocketPair
  WS接口.accept(); // 接受WebSocket连接
  建立传输管道(WS接口, tcpSocket, initialData); // 建立数据传输管道
  return new Response(null, { status: 101, webSocket: 客户端 }); // 返回101状态码表示WebSocket升级成功
}

/**
 * 使用Base64解码字符串。
 * @param {string} str 待解码字符串。
 * @returns {ArrayBuffer} 解码后的ArrayBuffer。
 */
function 使用64位加解密(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/'); // 替换URL安全的Base64字符
  // 使用atob解码，并转换为Uint8Array的Buffer
  return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
}

/**
 * 解析VLess头部，获取目标地址信息并尝试建立TCP连接。
 * @param {ArrayBuffer} buf VLess头部数据。
 * @returns {Promise<{tcpSocket: object, initialData: ArrayBuffer}>} 包含TCP Socket和初始数据的对象。
 */
async function 解析VL标头(buf) {
  const b = new DataView(buf), c = new Uint8Array(buf);
  // 获取地址类型和长度信息
  const addrTypeIndex = c[17];
  const port = b.getUint16(18 + addrTypeIndex + 1); // 目标端口

  let offset = 18 + addrTypeIndex + 4; // 数据偏移量
  let host;
  const targetAddrType = c[offset - 1]; // 实际的目标地址类型 (IPv4/域名/IPv6)

  // 解析目标地址
  if (targetAddrType === 1) { // IPv4
    host = Array.from(c.slice(offset, offset + 4)).join('.');
    offset += 4;
  } else if (targetAddrType === 2) { // 域名
    const len = c[offset];
    host = new TextDecoder().decode(c.slice(offset + 1, offset + 1 + len));
    offset += len + 1;
  } else if (targetAddrType === 3) { // IPv6
    host = Array(8).fill().map((_, i) => b.getUint16(offset + 2 * i).toString(16)).join(':');
    offset += 16;
  } else {
    throw new Error('不支持的地址类型');
  }

  const initialData = buf.slice(offset); // VLess头部后的初始数据

  let tcpSocket = null;

  // 优先尝试SOCKS5代理连接 (如果配置了SOCKS5代理)
  if (socks5代理列表.length > 0) {
    console.log(`尝试通过SOCKS5代理连接 ${host}:${port}`);
    // 随机打乱SOCKS5代理列表，增加健壮性
    for (const 代理 of [...socks5代理列表].sort(() => Math.random() - 0.5)) {
      console.log(`尝试使用SOCKS5代理: ${代理}`);
      tcpSocket = await 创建SOCKS5接口(targetAddrType, host, port, 代理);
      if (tcpSocket) {
        console.log(`成功通过SOCKS5代理 ${代理} 连接到 ${host}:${port}`);
        return { tcpSocket, initialData };
      }
    }
    console.error('所有SOCKS5代理连接尝试失败，将尝试直连。'); // 所有SOCKS5都失败时打印日志
  }

  // 如果没有配置SOCKS5代理，或所有SOCKS5代理都失败，则尝试直连
  console.log(`尝试直连 ${host}:${port}`);
  try {
    tcpSocket = await connect({ hostname: host, port });
    await tcpSocket.opened;
    console.log(`成功直连到 ${host}:${port}`);
  } catch (e) {
    console.error(`直连 ${host}:${port} 失败: ${e.message}`);
    throw new Error(`无法连接到目标 ${host}:${port} (直连失败)`);
  }

  return { tcpSocket, initialData };
}

/**
 * 建立WebSocket和TCP之间的双向数据传输管道。
 * @param {WebSocket} ws 客户端WebSocket接口。
 * @param {object} tcp 目标TCP Socket接口。
 * @param {ArrayBuffer} init 初始数据（可选）。
 */
async function 建立传输管道(ws, tcp, init) {
  // 向客户端发送VLess握手成功的响应
  ws.send(new Uint8Array([0, 0]));

  const writer = tcp.writable.getWriter();
  const reader = tcp.readable.getReader();

  // 如果有初始数据，先写入TCP连接
  if (init) {
    await writer.write(init);
  }

  // 监听WebSocket消息，并写入TCP
  ws.addEventListener('message', async e => {
    try {
      await writer.write(e.data);
    } catch (error) {
      console.error("写入TCP失败:", error);
      try { ws.close(); } catch {}
    }
  });

  // 从TCP读取数据，并发送到WebSocket
  (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break; // TCP连接关闭
        if (value) {
          try {
            await ws.send(value);
          } catch (error) {
            console.error("发送WebSocket失败:", error);
            break; // WebSocket可能已关闭
          }
        }
      }
    } catch (error) {
      console.error("从TCP读取数据失败:", error);
    } finally {
      // 确保在一方关闭时，另一方也关闭
      try { ws.close(); } catch {}
      try { reader.cancel(); } catch {}
      try { writer.releaseLock(); } catch {}
      try { tcp.close(); } catch {}
    }
  })();
}

/**
 * 验证VLess协议中的UUID。
 * @param {Uint8Array} a UUID的字节数组。
 * @returns {string} 格式化的UUID字符串。
 */
function 验证VL的密钥(a) {
  const hex = Array.from(a, v => v.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 生成订阅提示页面内容。
 * @param {string} ID 订阅路径ID。
 * @param {string} host Worker的域名。
 * @returns {string} HTML页面内容。
 */
function 给我订阅页面(ID, host) {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>订阅信息</title>
<style>
  body { font-family: sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 2rem auto; padding: 1rem; background-color: #f4f4f4; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  h1 { color: #0056b3; text-align: center; margin-bottom: 1.5rem; }
  p { margin-bottom: 1rem; }
  strong { color: #007bff; }
  .code-block { background-color: #e9e9e9; padding: 0.8rem; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 0.9em; margin-top: 0.5rem; }
  .note { background-color: #fff3cd; color: #664d03; padding: 0.8rem; border-left: 5px solid #ffc107; border-radius: 4px; margin-top: 1.5rem; }
  .subscribe-link { display: block; text-align: center; margin-top: 2rem; }
  .subscribe-link a { background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; transition: background-color 0.3s ease; }
  .subscribe-link a:hover { background-color: #218838; }
</style>
</head>
<body>
  <h1>VLess Worker 订阅服务</h1>
  <p>欢迎使用 VLess Worker 服务。请根据您的客户端类型导入以下订阅链接：</p>

  <p><strong>通用订阅链接 (支持V2Ray、Clash等客户端):</strong></p>
  <div class="code-block">
    <pre>https${符号}${host}/${ID}/${转码}${转码2}</pre>
  </div>

  <p class="note">
    <strong>注意:</strong>
    <ul>
      <li>如果您的Worker配置了“私钥开关”，此通用订阅可能无法直接使用，请根据实际情况调整或关闭私钥功能。</li>
      <li>建议使用支持VLESS和WebSocket的最新版本客户端。</li>
      <li>如遇连接问题，请检查Worker配置的环境变量是否正确。</li>
    </ul>
  </p>
  
  <div class="subscribe-link">
    <a href="https${符号}${host}/${ID}/${转码}${转码2}" target="_blank">点击获取订阅链接</a>
  </div>

  <p style="text-align: center; margin-top: 3rem; font-size: 0.8em; color: #666;">
    由 Cloudflare Workers 提供支持
  </p>
</body>
</html>
`;
}

/**
 * 生成通用的VLess订阅配置文件内容。
 * @param {string} host Worker的域名。
 * @returns {string} 订阅配置文件字符串。
 */
function 给我通用配置文件(host) {
  // 如果没有优选IP，或者我的优选数组为空，则添加一个默认节点
  if (!我的优选 || 我的优选.length === 0 || 我的优选.every(item => item === '')) {
    我的优选 = [`${host}:443#${我的节点名字 || '默认节点'}`]; // 使用默认节点名
    console.log("优选IP列表为空，已添加默认节点。");
  } else {
    // 确保优选IP列表包含主Worker地址，并优先
    const hasHostEntry = 我的优选.some(item => item.startsWith(`${host}:`) || item.startsWith(`${host}#`));
    if (!hasHostEntry) {
      我的优选.unshift(`${host}:443#${我的节点名字 || '原生节点'}`);
    }
  }

  // 检查私钥开关，如果开启则不生成通用订阅
  if (私钥开关) {
    return `请先关闭私钥功能，通用订阅不支持私钥。`;
  }

  // 映射优选IP列表生成VLess订阅链接
  const 配置内容 = 我的优选
    .map(item => {
      const [main, tlsInfo] = item.split("@"); // tlsInfo可能包含如"notls"等标记
      const [addrPort, name = 我的节点名字] = main.split("#"); // 提取地址端口和节点名
      const parts = addrPort.split(":");
      const port = Number(parts.length > 1 ? parts.pop() : 443); // 默认端口443
      const addr = parts.join(":"); // 地址

      const tlsOpt = (tlsInfo === 'notls' || port === 80) ? 'security=none' : 'security=tls'; // 根据tlsInfo或端口判断是否启用TLS

      // 构建VLess链接
      return `${转码}${转码2}${符号}${哎呀呀这是我的VL密钥}@${addr}:${port}?encryption=none&${tlsOpt}&sni=${host}&type=ws&host=${host}&path=${encodeURIComponent("/?ed=2560")}#${name}`;
    })
    .join("\n"); // 每个链接之间用换行符分隔

  return 配置内容;
}
