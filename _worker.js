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

async function 创建SOCKS5接口(addrType, targetHost, targetPort, socks5Config) {
  const { username, password, hostname, port } = await 解析SOCKS5配置(socks5Config);
  const SOCKS5接口 = connect({ hostname, port });
  try {
    await SOCKS5接口.opened;
  } catch {
    return null;
  }

  const writer = SOCKS5接口.writable.getWriter();
  const reader = SOCKS5接口.readable.getReader();
  const encoder = new TextEncoder();

  await writer.write(new Uint8Array([5, 2, 0, 2]));
  let res = (await reader.read()).value;

  if (res[1] === 0x02) {
    if (!username || !password) return 关闭接口并退出();
    const auth = new Uint8Array([1, username.length, ...encoder.encode(username), password.length, ...encoder.encode(password)]);
    await writer.write(auth);
    res = (await reader.read()).value;
    if (res[1] !== 0x00) return 关闭接口并退出();
  }

  let destAddr;
  switch (addrType) {
    case 1:
      destAddr = new Uint8Array([1, ...targetHost.split(".").map(Number)]);
      break;
    case 2:
      destAddr = new Uint8Array([3, targetHost.length, ...encoder.encode(targetHost)]);
      break;
    case 3:
      destAddr = new Uint8Array([4, ...解析IPv6地址(targetHost)]);
      break;
    default:
      return 关闭接口并退出();
  }

  const req = new Uint8Array([5, 1, 0, ...destAddr, targetPort >> 8, targetPort & 0xff]);
  await writer.write(req);
  res = (await reader.read()).value;

  if (res[1] !== 0x00) return 关闭接口并退出();

  writer.releaseLock();
  reader.releaseLock();
  return SOCKS5接口;

  function 关闭接口并退出() {
    writer.releaseLock();
    reader.releaseLock();
    SOCKS5接口.close();
    return null;
  }
}

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

function 初始化Socks5代理(env) {
  const raw = 读取环境变量('SOCKS5_PROXY', [], env);
  if (typeof raw === 'string') {
    socks5代理列表 = raw.split('\n').map(s => s.trim()).filter(Boolean);
  } else if (Array.isArray(raw)) {
    socks5代理列表 = raw;
  }
}

// ------------------------------------------------------ 主逻辑开始 ------------------------------------------------------

let 转码 = 'vl', 转码2 = 'ess', 符号 = '://';
let 哎呀呀这是我的ID啊 = "123456";
let 哎呀呀这是我的VL密钥 = "188eb8bd-7154-4e20-91ec-dfadaf1f632b";
let 私钥开关 = false;
let 咦这是我的私钥哎 = "";
let 隐藏订阅 = false;
let 嘲讽语 = "哎呀你找到了我，但是我就是不给你看，气不气，嘿嘿嘿";
let 我的优选 = [];
let 我的优选TXT = [''];
let 我的节点名字 = '天书-SOCKS5';

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

export default {
  async fetch(访问请求, env) {
    哎呀呀这是我的ID啊 = 读取环境变量('ID', 哎呀呀这是我的ID啊, env);
    哎呀呀这是我的VL密钥 = 读取环境变量('UUID', 哎呀呀这是我的VL密钥, env);
    我的优选 = 读取环境变量('IP', 我的优选, env);
    我的优选TXT = 读取环境变量('TXT', 我的优选TXT, env);
    咦这是我的私钥哎 = 读取环境变量('私钥', 咦这是我的私钥哎, env);
    隐藏订阅 = 读取环境变量('隐藏', 隐藏订阅, env);
    私钥开关 = 读取环境变量('私钥开关', 私钥开关, env);
    嘲讽语 = 读取环境变量('嘲讽语', 嘲讽语, env);
    我的节点名字 = 读取环境变量('我的节点名字', 我的节点名字, env);
    初始化Socks5代理(env);

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
            所有节点.push(...文本.split('\n').map(x => x.trim()).filter(Boolean));
          } catch (e) {}
        }
        if (所有节点.length > 0) 我的优选 = 所有节点;
      }
      switch (url.pathname) {
        case `/${哎呀呀这是我的ID啊}`:
          return new Response(给我订阅页面(哎呀呀这是我的ID啊, 访问请求.headers.get('Host')), {
            status: 200,
            headers: { "Content-Type": "text/plain;charset=utf-8" }
          });
        case `/${哎呀呀这是我的ID啊}/${转码}${转码2}`:
          return new Response(隐藏订阅 ? 嘲讽语 : 给我通用配置文件(访问请求.headers.get('Host')), {
            status: 200,
            headers: { "Content-Type": "text/plain;charset=utf-8" }
          });
        default:
          return new Response('Hello World!', { status: 200 });
      }
    } else {
      if (私钥开关 && 访问请求.headers.get('my-key') !== 咦这是我的私钥哎) {
        return new Response('私钥验证失败', { status: 403 });
      }
      const enc = 访问请求.headers.get('sec-websocket-protocol');
      const data = 使用64位加解密(enc);
      if (验证VL的密钥(new Uint8Array(data.slice(1, 17))) !== 哎呀呀这是我的VL密钥) {
        return new Response('无效的UUID', { status: 403 });
      }
      const { tcpSocket, initialData } = await 解析VL标头(data);
      return await 升级WS请求(访问请求, tcpSocket, initialData);
    }
  }
};

async function 升级WS请求(访问请求, tcpSocket, initialData) {
  const [客户端, WS接口] = new WebSocketPair();
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
  const addrTypeIndex = c[17];
  const port = b.getUint16(18 + addrTypeIndex + 1);
  let offset = 18 + addrTypeIndex + 4;
  let host;
  if (c[offset - 1] === 1) {
    host = Array.from(c.slice(offset, offset + 4)).join('.'); offset += 4;
  } else if (c[offset - 1] === 2) {
    const len = c[offset];
    host = new TextDecoder().decode(c.slice(offset + 1, offset + 1 + len)); offset += len + 1;
  } else {
    host = Array(8).fill().map((_, i) => b.getUint16(offset + 2 * i).toString(16)).join(':'); offset += 16;
  }
  const initialData = buf.slice(offset);
  const addrType = c[offset - 1];

  if (socks5代理列表.length > 0) {
    for (const 代理 of [...socks5代理列表].sort(() => Math.random() - 0.5)) {
      const tcpSocket = await 创建SOCKS5接口(addrType, host, port, 代理);
      if (tcpSocket) return { tcpSocket, initialData };
    }
    throw new Error('所有 SOCKS5 连接失败');
  }

  const tcpSocket = await connect({ hostname: host, port });
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

function 给我订阅页面(ID, host) {
  return `1、本worker的私钥功能只支持通用订阅\n2、其他需求自行研究\n通用的：https${符号}${host}/${ID}/${转码}${转码2}`;
}

function 给我通用配置文件(host) {
  我的优选.push(`${host}:443#备用节点`);
  if (私钥开关) return `请先关闭私钥功能`;
  return 我的优选.map(item => {
    const [main, tls] = item.split("@");
    const [addrPort, name = 我的节点名字] = main.split("#");
    const parts = addrPort.split(":"), port = Number(parts.pop()), addr = parts.join(":");
    const tlsOpt = tls === 'notls' ? 'security=none' : 'security=tls';
    return `${转码}${转码2}${符号}${哎呀呀这是我的VL密钥}@${addr}:${port}?encryption=none&${tlsOpt}&sni=${host}&type=ws&host=${host}&path=%2F%3Fed%3D2560#${name}`;
  }).join("\n");
}
