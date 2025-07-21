// ====================================================================
// Cloudflare Worker: VL over WebSocket + SOCKS5
// --------------------------------------------------------------------
// 环境变量 (Vars) 说明：
//   UUID        必填，VL 用户的 UUID                        
//   ID          可选，订阅路径 (默认 123456)                 
//   SOCKS5_ADDRESS	必填 user:pass@127.0.0.1:1080 否则就走直连
//   隐藏        可选，true|false，true 时订阅接口只返回嘲讽语.
// ====================================================================

import { connect } from 'cloudflare:sockets';

let 转码 = 'vl', 转码2 = 'ess', 符号 = '://';

//////////////////////////////////////////////////////////////////////////配置区块////////////////////////////////////////////////////////////////////////  
let 哎呀呀这是我的ID啊 = "123456"; // 订阅路径
let 哎呀呀这是我的VL密钥 = "188eb8bd-7154-4e20-91ec-dfadaf1f632b"; // UUID

let 私钥开关 = true;
let 咦这是我的私钥哎 = "";

let 隐藏订阅 = false; // 开启 true ━ 关闭false
let 嘲讽语 = "哎呀你找到了我，但是我就是不给你看，气不气，嘿嘿嘿";

let 我的优选 = [];
let 我的优选TXT = [''];

let 我的节点名字 = 'SOCKS5版';

// 新增SOCKS5相关配置
let 启用SOCKS5反代 = true; // 选择是否启用SOCKS5反代功能，true启用，false不启用，可以通过环境变量SOCKS5_ENABLE控制
let 启用SOCKS5全局反代 = true; // 选择是否启用SOCKS5全局反代，启用后所有访问都是S5的落地，可以通过环境变量SOCKS5_GLOBAL控制
let 我的SOCKS5账号 = ''; // 格式'账号:密码@地址:端口'，可以通过环境变量SOCKS5_ADDRESS控制

let DOH服务器列表 = [ //DOH地址，基本上已经涵盖市面上所有通用地址了，一般无需修改
  "https://dns.google/dns-query",
  "https://cloudflare-dns.com/dns-query",
  "https://1.1.1.1/dns-query",
  "https://dns.quad9.net/dns-query",
];

const 读取环境变量 = (name, fallback, env) => {
  const raw = import.meta?.env?.[name] ?? env?.[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed.includes('\n')) {
      return trimmed.split('\n').map(item => item.trim()).filter(Boolean);
    }
    if (!isNaN(trimmed) && trimmed !== '') return Number(trimmed);
    return trimmed;
  }
  return raw;
};

export default {
  async fetch(访问请求, env) {
    // 读取配置区块中的环境变量
    哎呀呀这是我的ID啊 = 读取环境变量('ID', 哎呀呀这是我的ID啊, env);
    哎呀呀这是我的VL密钥 = 读取环境变量('UUID', 哎呀呀这是我的VL密钥, env);
    我的优选 = 读取环境变量('IP', 我的优选, env);
    我的优选TXT = 读取环境变量('TXT', 我的优选TXT, env);
    咦这是我的私钥哎 = 读取环境变量('私钥', 咦这是我的私钥哎, env);
    隐藏订阅 = 读取环境变量('隐藏', 隐藏订阅, env);
    私钥开关 = 读取环境变量('私钥开关', 私钥开关, env);
    嘲讽语 = 读取环境变量('嘲讽语', 嘲讽语, env);
    我的节点名字 = 读取环境变量('我的节点名字', 我的节点名字, env);

    // 读取SOCKS5相关的环境变量
    启用SOCKS5反代 = 读取环境变量('SOCKS5_ENABLE', 启用SOCKS5反代, env);
    启用SOCKS5全局反代 = 读取环境变量('SOCKS5_GLOBAL', 启用SOCKS5全局反代, env);
    我的SOCKS5账号 = 读取环境变量('SOCKS5_ADDRESS', 我的SOCKS5账号, env);

    const 升级标头 = 访问请求.headers.get('Upgrade');
    const url = new URL(访问请求.url);

    if (!升级标头 || 升级标头 !== 'websocket') {
      if (我的优选TXT) {
        const 链接数组 = Array.isArray(我的优选TXT) ? 我的优选TXT : [我的优选TXT];
        const 所有节点 = [];
        for (const 链接 of 链接数组) {
          try {
            const 响应 = await fetch(链接);
            const 文本 = await 响应.text();
            const 节点 = 文本.split('\n').map(line => line.trim()).filter(line => line);
            所有节点.push(...节点);
          } catch (e) {
            console.warn(`无法获取或解析链接: ${链接}`, e);
          }
        }
        if (所有节点.length > 0) 我的优选 = 所有节点;
      }
      switch (url.pathname) {
        case `/${哎呀呀这是我的ID啊}`: {
          const sub = 给我订阅页面(哎呀呀这是我的ID啊, 访问请求.headers.get('Host'));
          return new Response(sub, {
            status: 200,
            headers: { "Content-Type": "text/plain;charset=utf-8" }
          });
        }
        case `/${哎呀呀这是我的ID啊}/${转码}${转码2}`: {
          if (隐藏订阅) {
            return new Response(嘲讽语, {
              status: 200,
              headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
          } else {
            const cfg = 给我通用配置文件(访问请求.headers.get('Host'));
            return new Response(cfg, {
              status: 200,
              headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
          }
        }
        default:
          return new Response('Hello World!', { status: 200 });
      }
    } else {
      if (私钥开关) {
        const k = 访问请求.headers.get('my-key');
        if (k !== 咦这是我的私钥哎) return new Response('私钥验证失败', { status: 403 });
      }
      const enc = 访问请求.headers.get('sec-websocket-protocol');
      const data = 使用64位加解密(enc);
      if (!私钥开关 && 验证VL的密钥(new Uint8Array(data.slice(1, 17))) !== 哎呀呀这是我的VL密钥) {
        return new Response('无效的UUID', { status: 403 });
      }
      const { tcpSocket, initialData } = await 解析VL标头(data);
      return await 升级WS请求(访问请求, tcpSocket, initialData);
    }
  }
};

async function 升级WS请求(访问请求, tcpSocket, initialData) {
  const { 0: 客户端, 1: WS接口 } = new WebSocketPair();
  WS接口.accept();
  建立传输管道(WS接口, tcpSocket, initialData);
  return new Response(null, { status: 101, webSocket: 客户端 });
}

function 使用64位加解密(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
}

async function 解析VL标头(buf) {
  const b = new DataView(buf), c = new Uint8Array(buf);
  const 获取数据定位 = c[17];
  const 提取端口索引 = 18 + 获取数据定位 + 1;
  const 访问端口 = b.getUint16(提取端口索引);
  if (访问端口 === 53) throw new Error('拒绝DNS连接') // 避免直接DNS连接
  const 提取地址索引 = 提取端口索引 + 2;
  let 识别地址类型 = c[提取地址索引];
  let 地址信息索引 = 提取地址索引 + 1;
  let 访问地址;
  let 地址长度;

  switch (识别地址类型) {
    case 1: // IPv4
      地址长度 = 4;
      访问地址 = Array.from(c.slice(地址信息索引, 地址信息索引 + 地址长度)).join('.');
      break;
    case 2: // 域名
      地址长度 = c[地址信息索引];
      地址信息索引 += 1;
      const 访问域名 = new TextDecoder().decode(c.slice(地址信息索引, 地址信息索引 + 地址长度));
      访问地址 = await 查询最快IP(访问域名); // 使用DOH查询IP
      if (访问地址 !== 访问域名) 识别地址类型 = 访问地址.includes(':') ? 3 : 1; // 更新地址类型
      break;
    case 3: // IPv6
      地址长度 = 16;
      const ipv6 = [];
      const 读取IPV6地址 = new DataView(buf, 地址信息索引, 16);
      for (let i = 0; i < 8; i++) ipv6.push(读取IPV6地址.getUint16(i * 2).toString(16));
      访问地址 = ipv6.join(':');
      break;
    default:
      throw new Error ('无效的访问地址');
  }

  const initialData = buf.slice(地址信息索引 + 地址长度);
  let tcpSocket;

  // SOCKS5 逻辑集成
  if (启用SOCKS5反代 && 我的SOCKS5账号) {
    if (启用SOCKS5全局反代) { // 全局SOCKS5反代
      tcpSocket = await 创建SOCKS5接口(识别地址类型, 访问地址, 访问端口);
    } else { // 非全局SOCKS5反代，仅当直接连接失败时尝试SOCKS5
      try {
        tcpSocket = connect({ hostname: 访问地址, port: 访问端口 });
        await tcpSocket.opened;
      } catch (e) {
        console.warn(`直接连接失败，尝试通过SOCKS5代理: ${e}`);
        tcpSocket = await 创建SOCKS5接口(识别地址类型, 访问地址, 访问端口);
      }
    }
  } else { // 不启用SOCKS5反代，直接连接
    tcpSocket = connect({ hostname: 访问地址, port: 访问端口 });
  }

  await tcpSocket.opened;
  return { tcpSocket, initialData };
}

async function 建立传输管道(ws, tcp, init) {
  ws.send(new Uint8Array([0, 0]));
  const writer = tcp.writable.getWriter();
  const reader = tcp.readable.getReader();
  if (init) await writer.write(init);
  ws.addEventListener('message', e => writer.write(e.data));
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) ws.send(value);
    }
  } finally {
    try { ws.close(); } catch {}
    try { reader.cancel(); } catch {}
    try { writer.releaseLock(); } catch {}
    tcp.close();
  }
}

function 验证VL的密钥(a) {
  const hex = Array.from(a, v => v.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function 创建SOCKS5接口(识别地址类型, 访问地址, 访问端口) {
  const { 账号, 密码, 地址, 端口 } = await 获取SOCKS5账号(我的SOCKS5账号);
  const SOCKS5接口 = connect({ hostname: 地址, port: 端口 });
  let 传输数据, 读取数据;
  try {
    await SOCKS5接口.opened;
    传输数据 = SOCKS5接口.writable.getWriter();
    读取数据 = SOCKS5接口.readable.getReader();
    const 转换数组 = new TextEncoder();

    // SOCKS5 认证协商
    const 构建S5认证 = new Uint8Array([5, 2, 0, 2]); // 支持无认证和用户名/密码认证
    await 传输数据.write(构建S5认证);
    const 读取认证要求 = (await 读取数据.read()).value;

    if (读取认证要求[1] === 0x02) { // 检查是否需要用户名/密码认证
      if (!账号 || !密码) {
        throw new Error (`未配置SOCKS5账号密码`);
      }
      const 构建账号密码包 = new Uint8Array([ 1, 账号.length, ...转换数组.encode(账号), 密码.length, ...转换数组.encode(密码) ]);
      await 传输数据.write(构建账号密码包);
      const 读取账号密码认证结果 = (await 读取数据.read()).value;
      if (读取账号密码认证结果[0] !== 0x01 || 读取账号密码认证结果[1] !== 0x00) {
        throw new Error (`SOCKS5账号密码错误`);
      }
    }

    // SOCKS5 连接目标
    let 转换访问地址;
    switch (识别地址类型) {
      case 1: // IPv4
        转换访问地址 = new Uint8Array( [1, ...访问地址.split('.').map(Number)] );
        break;
      case 2: // 域名
        转换访问地址 = new Uint8Array( [3, 访问地址.length, ...转换数组.encode(访问地址)] );
        break;
      case 3: // IPv6
        转换访问地址 = new Uint8Array( [4, ...访问地址.split(':').flatMap(x => {
          if (x.length === 0) return [0,0]; // 处理 :: 的情况
          if (x.length === 1) return [0, parseInt(x, 16)];
          return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2), 16)];
        })] );
        break;
      default:
        throw new Error ('无效的SOCKS5目标地址类型');
    }
    const 构建转换后的访问地址 = new Uint8Array([ 5, 1, 0, ...转换访问地址, 访问端口 >> 8, 访问端口 & 0xff ]);
    await 传输数据.write(构建转换后的访问地址);
    const 检查返回响应 = (await 读取数据.read()).value;
    if (检查返回响应[0] !== 0x05 || 检查返回响应[1] !== 0x00) {
      throw new Error (`SOCKS5目标地址连接失败，访问地址: ${访问地址}`);
    }

    传输数据.releaseLock();
    读取数据.releaseLock();
    return SOCKS5接口;
  } catch (e) {
    if (传输数据) 传输数据.releaseLock();
    if (读取数据) 读取数据.releaseLock();
    if (SOCKS5接口) SOCKS5接口.close();
    throw new Error (`SOCKS5握手失败: ${e}`);
  }
}

async function 获取SOCKS5账号(SOCKS5) {
  const 分隔账号 = SOCKS5.lastIndexOf("@");
  if (分隔账号 === -1) { // 如果没有账号密码，则直接是地址:端口
    const [地址, 端口] = 解析地址端口(SOCKS5);
    return { 账号: '', 密码: '', 地址, 端口 };
  }
  const 账号段 = SOCKS5.slice(0, 分隔账号);
  const 地址段 = SOCKS5.slice(分隔账号 + 1);
  const [账号, 密码] = [账号段.slice(0, 账号段.lastIndexOf(":")), 账号段.slice(账号段.lastIndexOf(":") + 1)];
  const [地址, 端口] = 解析地址端口(地址段);
  return { 账号, 密码, 地址, 端口 };
}

function 解析地址端口(地址段) {
  let 地址, 端口;
  if (地址段.startsWith('[')) { // IPv6地址
    const endBracket = 地址段.indexOf(']');
    地址 = 地址段.slice(1, endBracket);
    端口 = 地址段.includes(']:') ? Number(地址段.slice(endBracket + 2)) : 443;
  } else { // IPv4或域名
    const lastColon = 地址段.lastIndexOf(':');
    if (lastColon > -1 && !isNaN(Number(地址段.slice(lastColon + 1)))) {
      地址 = 地址段.slice(0, lastColon);
      端口 = Number(地址段.slice(lastColon + 1));
    } else {
      地址 = 地址段;
      端口 = 443;
    }
  }
  return [地址, 端口];
}

async function 查询最快IP(访问域名) {
  const 构造请求 = (type) =>
    DOH服务器列表.map(DOH =>
      fetch(`${DOH}?name=${访问域名}&type=${type}`, {
        headers: { 'Accept': 'application/dns-json' }
      }).then(res => res.json())
        .then(json => {
          const ip = json.Answer?.find(r => r.type === (type === 'A' ? 1 : 28))?.data;
          if (ip) return ip;
          return Promise.reject(`无 ${type} 记录`);
        })
        .catch(err => Promise.reject(`${DOH} ${type} 请求失败: ${err}`))
    );
  try {
    return await Promise.any(构造请求('A'));
  } catch {
    return 访问域名;
  }
}

function 给我订阅页面(ID, host) {
  return `
1、本worker的私钥功能只支持通用订阅，其他请关闭私钥功能  
2、其他需求自行研究  
通用的：https${符号}${host}/${ID}/${转码}${转码2}
`;
}

function 给我通用配置文件(host) {
  我的优选.push(`${host}:443#备用节点`);
  if (私钥开关) {
    return `请先关闭私钥功能`;
  } else {
    return 我的优选.map(item => {
      const [main, tls] = item.split("@");
      const [addrPort, name = 我的节点名字] = main.split("#");
      const parts = addrPort.split(":");
      const port = parts.length > 1 ? Number(parts.pop()) : 443;
      const addr = parts.join(":");
      const tlsOpt = tls === 'notls' ? 'security=none' : 'security=tls';
      return `${转码}${转码2}${符号}${哎呀呀这是我的VL密钥}@${addr}:${port}?encryption=none&${tlsOpt}&sni=${host}&type=ws&host=${host}&path=%2F%3Fed%3D2560#${name}`;
    }).join("\n");
  }
}
