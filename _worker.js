// ====================================================================
// 云山大寨土匪规矩：VL秘道 + SOCKS5暗桩 (带并发SOCKS5暗桩选择)，外加一些鬼画符
// --------------------------------------------------------------------

// 寨规 (Vars) 说明：
//   大当家密钥        必填，进出秘道的UUID凭证，这可是咱们的命根子！
//   山寨号          可选，秘道订阅路径 (默认 123456)，别走岔了道！
//   备用暗桩SOCKS5	可选 掌柜:暗号@127.0.0.1:1080 作为 暗桩名单URL 加载失败时的备用。万一主力歇菜了，咱还有替补！
//   暗桩接头时限 = 5000; // 暗桩接头超时 (毫秒) 可选，SOCKS5 地址列表 TXT 文件的 URL，例如：https://example.com/socks5_list.txt。这时间可得拿捏准了！
//   启用SOCKS5暗桩 可选，true|false，true启用SOCKS5反代，false不启用 (默认 true)。开不开，大当家您说了算！
//   全寨SOCKS5暗桩 可选，true|false，true启用SOCKS5全局反代，false仅在直连失败时尝试 (默认 true)。是全面出击还是见机行事？
//   藏匿        可选，true|false，true 时订阅接口只返回嘲讽语。咱就爱看他们抓耳挠腮的样子！
//   私密信物        可选，用于WS连接认证的私钥。没这玩意儿，甭想进门！
//   信物开关    可选，true|false，是否启用私密信物认证。防人之心不可无啊！
//   骂街语      可选，藏匿订阅时返回的嘲讽语。气死他们不偿命！
//   我的地盘名字  可选，订阅中秘道的默认名称。咱这地盘，得有个响亮的名号！
//                    《 注意事项 》
//    寨规 选填 暗桩名单URL 需要提供远程.txt格式文件。
//      备用暗桩SOCKS5  无掌柜无暗号:123456:1234直接填写IP加端口。简单粗暴！
//       备用暗桩SOCKS5   有掌柜的，严格按照掌柜暗号。掌柜:暗号@127.0.0.1:1080。规矩就是规矩！
//    可以设置单个帐号，多帐号请用txt远程，每一行一个帐号。一个萝卜一个坑！

// ====================================================================

import { connect } from 'cloudflare:sockets';

let 暗号 = 'vl', 狗皮膏药 = 'ess', 接头标志 = '://'; // 这些个黑话，外人听不懂！

//////////////////////////////////////////////////////////////////////////寨规核心，不传外人////////////////////////////////////////////////////////////////////////
let 山寨号 = "123456"; // 秘道订阅路径，通往聚义厅的小路
let 大当家密钥 = "25dce6e6-1c37-4e8c-806b-5ef8affd9f55"; // UUID，大当家的私人令牌，谁敢仿冒？

let 信物开关 = false; // 这开关，得是咱们自己人才能碰！
let 私密信物 = ""; // 随身携带，小心保管！

let 藏匿订阅 = false; // 开启 true ━ 关闭false。是显露山形还是深藏不露？
let 骂街语 = "哎呀你找到了我，但是我就是不给你看，气不气，嘿嘿嘿，小肥羊！白费力气了吧，哈哈！"; // 专治各种不服！

let 优先秘道 = []; // 可通过寨规 IP 配置，也可以通过 TXT 配置。咱们的秘密通道！
let 优先秘道清单 = ['']; // 可通过寨规 TXT 配置，用于从远程文件加载优选 IP。这是咱们的活点地图！

let 我的地盘名字 = 'SOCKS5暗桩版，闲人免进！'; // 这名字，得有点霸气！

// 新增SOCKS5暗桩相关寨规
let 启用SOCKS5暗桩 = true; // 选择是否启用SOCKS5暗桩功能，true启用，false不启用，可以通过寨规SOCKS5_ENABLE控制。这可是咱的秘密武器！
let 全寨SOCKS5暗桩 = true; // 选择是否启用SOCKS5全局暗桩，启用后所有访问都是S5的落地，可以通过寨规SOCKS5_GLOBAL控制。是要全员出击还是局部骚扰？
let 我的SOCKS5暗桩 = ''; // 格式'掌柜:暗号@地址:端口'，可以通过寨规SOCKS5_ADDRESS控制。这可是咱们的地下交通员！

// 新增：SOCKS5 暗桩名单URL
let 暗桩名单URL = ''; // 可以通过寨规 SOCKS5_TXT_URL 控制。这是咱们的兄弟名录！

// SOCKS5 暗桩池和当前索引 (在并发模式下，索引更多用于初始加载后的顺序，实际连接由 Promise.any 管理)
let SOCKS5暗桩池 = []; // 咱的暗桩大军！
let 暗桩名单上次更新时间 = 0; // 上次点兵是什么时候？
const 暗桩名单刷新间隔 = 5 * 60 * 1000; // 5分钟刷新一次 (毫秒)。常点兵，常练武！
const 暗桩接头时限 = 5000; // SOCKS5 连接超时 (毫秒)。过了这村就没这店了！

let 寻路神仙列表 = [ //DOH地址，基本上已经涵盖市面上所有通用地址了，一般无需修改。这些神仙，指路准着呢！
  "https://dns.google/dns-query",
  "https://cloudflare-dns.com/dns-query",
  "https://1.1.1.1/dns-query",
  "https://dns.quad9.net/dns-query",
];

const 扒拉寨规 = (name, fallback, env) => {
  const raw = import.meta?.env?.[name] ?? env?.[name]; // 在这堆烂七八糟的玩意儿里扒拉出咱们的规矩！
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

// 新增：加载 SOCKS5 暗桩名单的函数
async function 呼唤暗桩名单() { // 大吼一声，弟兄们集合了！
  if (!暗桩名单URL) {
    console.log('暗桩名单URL 未配置，不呼唤暗桩名单。就地解散吧，省得麻烦。');
    return;
  }

  const currentTime = Date.now();
  if (currentTime - 暗桩名单上次更新时间 < 暗桩名单刷新间隔 && SOCKS5暗桩池.length > 0) {
    // 还没到刷新时间，且暗桩池不为空，则不刷新。弟兄们歇着吧，别瞎折腾。
    return;
  }

  console.log('正在呼唤SOCKS5暗桩名单...都给我听好了！');
  try {
    const response = await fetch(暗桩名单URL);
    if (!response.ok) {
      throw new Error(`无法呼唤SOCKS5暗桩名单: ${response.statusText} (状态: ${response.status})。可能是条子来了！`);
    }
    const text = await response.text();
    // 过滤空行、只含空格的行和以 # 开头的注释行
    const addresses = text.split('\n')
                           .map(line => line.trim())
                           .filter(line => line && !line.startsWith('#')); // 把那些废话和标记都给老子扔了！

    if (addresses.length > 0) {
      SOCKS5暗桩池 = addresses;
      暗桩名单上次更新时间 = currentTime;
      console.log(`成功呼唤 ${SOCKS5暗桩池.length} 个SOCKS5暗桩。人手足够，可以干票大的了！`);
    } else {
      console.warn('SOCKS5暗桩名单文件为空或不含有效暗桩。将保留上次成功的名单（如果存在）。空城计？不至于吧！');
      // 如果文件内容为空，不清空当前的 SOCKS5暗桩池，保留上次成功的
    }
  } catch (e) {
    console.error(`呼唤SOCKS5暗桩名单失败: ${e.message}。将使用备用暗桩 (如果已配置) 或上次成功呼唤的名单。看来今天不宜出门！`);
    // 即使加载失败，也保留旧的暗桩池，或者在暗桩池为空时，尝试 fallback 到 我的SOCKS5暗桩
  }
}

export default {
  async fetch(过路肥羊请求, env) {
    // 扒拉寨规，一个字都不能错！
    山寨号 = 扒拉寨规('ID', 山寨号, env);
    大当家密钥 = 扒拉寨规('UUID', 大当家密钥, env);
    优先秘道 = 扒拉寨规('IP', 优先秘道, env);
    优先秘道清单 = 扒拉寨规('TXT', 优先秘道清单, env);
    私密信物 = 扒拉寨规('私钥', 私密信物, env);
    藏匿订阅 = 扒拉寨规('隐藏', 藏匿订阅, env);
    信物开关 = 扒拉寨规('私钥开关', 信物开关, env);
    骂街语 = 扒拉寨规('嘲讽语', 骂街语, env);
    我的地盘名字 = 扒拉寨规('我的节点名字', 我的地盘名字, env);

    // 扒拉SOCKS5相关的寨规
    启用SOCKS5暗桩 = 扒拉寨规('SOCKS5_ENABLE', 启用SOCKS5暗桩, env);
    全寨SOCKS5暗桩 = 扒拉寨规('SOCKS5_GLOBAL', 全寨SOCKS5暗桩, env);
    我的SOCKS5暗桩 = 扒拉寨规('SOCKS5_ADDRESS', 我的SOCKS5暗桩, env);
    暗桩名单URL = 扒拉寨规('SOCKS5_TXT_URL', 暗桩名单URL, env); // 读取新的环境变量，这是个新玩意儿！

    // 尝试呼唤 SOCKS5 暗桩名单
    await 呼唤暗桩名单(); // 喊话了，都过来集合！

    const 升级旗号 = 过路肥羊请求.headers.get('Upgrade'); // 看看是哪路神仙的旗号！
    const url = new URL(过路肥羊请求.url); // 这是要去哪儿啊？

    if (!升级旗号 || 升级旗号 !== 'websocket') {
      // 非 WebSocket 请求处理 (订阅、Hello World)。不是自己人，就按土匪规矩来！
      if (优先秘道清单) {
        const 秘道名单 = Array.isArray(优先秘道清单) ? 优先秘道清单 : [优先秘道清单];
        const 所有秘道 = [];
        for (const 秘道链接 of 秘道名单) {
          try {
            const 响应 = await fetch(秘道链接);
            const 文本 = await 响应.text();
            const 节点 = 文本.split('\n').map(line => line.trim()).filter(line => line);
            所有秘道.push(...节点);
          } catch (e) {
            console.warn(`无法获取或解析优先秘道链接: ${秘道链接}，是不是迷路了？`, e);
          }
        }
        if (所有秘道.length > 0) 优先秘道 = 所有秘道;
      }
      switch (url.pathname) {
        case `/${山寨号}`: {
          const sub = 给小肥羊看规矩(山寨号, 过路肥羊请求.headers.get('Host'));
          return new Response(sub, {
            status: 200,
            headers: { "Content-Type": "text/plain;charset=utf-8" }
          });
        }
        case `/${山寨号}/${暗号}${狗皮膏药}`: {
          if (藏匿订阅) {
            return new Response(骂街语, {
              status: 200,
              headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
          } else {
            const cfg = 给小肥羊秘道指引(过路肥羊请求.headers.get('Host'));
            return new Response(cfg, {
              status: 200,
              headers: { "Content-Type": "text/plain;charset=utf-8" }
            });
          }
        }
        default:
          return new Response('“此山是我开，此树是我栽，要想从此过，留下买路财！”呸，搞错了，是Hello World！滚一边去！', { status: 200 });
      }
    } else {
      // WebSocket 升级请求处理。看来是个懂行的！
      if (信物开关) {
        const k = 过路肥羊请求.headers.get('my-key');
        if (k !== 私密信物) return new Response('私密信物验证失败，滚粗！别怪我刀下无情！', { status: 403 });
      }
      const enc = 过路肥羊请求.headers.get('sec-websocket-protocol');
      const data = 用六十四路神仙解密(enc); // 这是什么天书？
      if (!信物开关 && 验明大当家密钥(new Uint8Array(data.slice(1, 17))) !== 大当家密钥) {
        return new Response('无效的大当家密钥，来者不善！看枪！', { status: 403 });
      }
      try {
        const { tcpSocket, initialData } = await 拆解VL密信(data);
        return await 扯起WS大旗(过路肥羊请求, tcpSocket, initialData);
      } catch (e) {
        console.error("VL密信解析或TCP接头失败:", e);
        return new Response(`二当家报告：此路不通，有诈！赶紧撤！: ${e.message}`, { status: 502 });
      }
    }
  }
};

async function 扯起WS大旗(过路肥羊请求, tcpSocket, initialData) { // 咱们的响箭已发出！
  const { 0: 肥羊, 1: 寨门 } = new WebSocketPair();
  寨门.accept();
  拉拢勾结(寨门, tcpSocket, initialData); // 忽悠，接着忽悠！
  return new Response(null, { status: 101, webSocket: 肥羊 });
}

function 用六十四路神仙解密(str) { // 找来各路神仙，给咱们把这符咒解了！
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer;
}

async function 拆解VL密信(buf) { // 这密信，得小心翼翼地拆！
  const b = new DataView(buf), c = new Uint8Array(buf);
  const 寻得数据落脚点 = c[17]; // 摸清它的底细！
  const 摸清端口索引 = 18 + 寻得数据落脚点 + 1;
  const 敲门端口 = b.getUint16(摸清端口索引); // 门牌号是多少？
  if (敲门端口 === 53) throw new Error('拒绝DNS敲门，滚！别在我这耍小聪明！') // 避免直接DNS连接
  const 摸清地址索引 = 摸清端口索引 + 2;
  let 辨别地址类型 = c[摸清地址索引]; // 到底是哪路货色？
  let 地址信息起始点 = 摸清地址索引 + 1;
  let 目标地址; // 要去哪儿？
  let 地址长度; // 多远的路程？

  switch (辨别地址类型) {
    case 1: // IPv4
      地址长度 = 4;
      目标地址 = Array.from(c.slice(地址信息起始点, 地址信息起始点 + 地址长度)).join('.'); // 四个数字连起来，就是它了！
      break;
    case 2: // 域名
      地址长度 = c[地址信息起始点];
      地址信息起始点 += 1;
      const 敲门域名 = new TextDecoder().decode(c.slice(地址信息起始点, 地址信息起始点 + 地址长度)); // 这是它的名号！
      目标地址 = await 寻最快活路(敲门域名); // 使用寻路神仙查询IP。问问神仙，哪条路最近！
      if (目标地址 !== 敲门域名) {
        // 更新地址类型，因为寻路神仙可能将域名解析为IPv6
        辨别地址类型 = 目标地址.includes(':') ? 3 : 1;
      }
      break;
    case 3: // IPv6
      地址长度 = 16;
      const ipv6 = [];
      const 察看IPV6地址 = new DataView(buf, 地址信息起始点, 16);
      for (let i = 0; i < 8; i++) ipv6.push(察看IPV6地址.getUint16(i * 2).toString(16));
      目标地址 = ipv6.join(':'); // 一长串数字，花里胡哨的！
      break;
    default:
      throw new Error ('无效的敲门地址类型，找茬吗？给我拿下！');
  }

  const initialData = buf.slice(地址信息起始点 + 地址长度);
  let tcpSocket;

  // SOCKS5暗桩逻辑集成
  if (启用SOCKS5暗桩) { // 检查是否启用 SOCKS5 暗桩。兄弟们，是时候行动了！
    if (全寨SOCKS5暗桩) { // 全局SOCKS5暗桩
      tcpSocket = await 摸金校尉探暗桩(辨别地址类型, 目标地址, 敲门端口); // 派出摸金校尉，探探虚实！
    } else { // 非全局SOCKS5暗桩，仅当直接连接失败时尝试SOCKS5
      try {
        tcpSocket = connect({ hostname: 目标地址, port: 敲门端口 });
        await tcpSocket.opened;
      } catch (e) {
        console.warn(`直接敲门 ${目标地址}:${敲门端口} 失败，尝试通过SOCKS5暗桩: ${e.message}。看来得走偏门了！`);
        tcpSocket = await 摸金校尉探暗桩(辨别地址类型, 目标地址, 敲门端口);
      }
    }
  } else { // 不启用SOCKS5暗桩，直接敲门
    tcpSocket = connect({ hostname: 目标地址, port: 敲门端口 }); // 直接上，别废话！
  }

  // 确保socket已打开，否则会抛出错误
  await tcpSocket.opened; // 门开了，进去！
  return { tcpSocket, initialData };
}

// 改进：摸金校尉探暗桩（并发模式，哪个快用哪个，自动跳过失败）
async function 摸金校尉探暗桩(辨别地址类型, 目标地址, 敲门端口) { // 兵分几路，谁先得手谁立功！
  let 要试探的暗桩 = [];

  // 首先，尝试从 SOCKS5暗桩池 获取代理
  if (SOCKS5暗桩池.length > 0) {
    要试探的暗桩 = [...SOCKS5暗桩池]; // 复制一份，避免修改原数组。咱们的家底，不能全押上！
  }

  // 如果 SOCKS5暗桩池 为空，但 我的SOCKS5暗桩 配置了，则将其作为备用
  if (要试探的暗桩.length === 0 && 我的SOCKS5暗桩) {
    要试探的暗桩.push(我的SOCKS5暗桩); // 没人了，只能指望这个老伙计了！
  }

  if (要试探的暗桩.length === 0) {
    throw new Error('未配置任何 SOCKS5 暗桩地址 (暗桩名单URL 或 备用暗桩SOCKS5)。一个都没有，还怎么混江湖？！');
  }

  const connectionPromises = 要试探的暗桩.map(async (proxyConfig, index) => {
    let tcpSocket = null;
    try {
      const { 掌柜, 暗号, 地址, 端口 } = await 探听SOCKS5暗号(proxyConfig); // 问问黑市上的规矩！
      console.log(`正在并发尝试接头SOCKS5暗桩: ${掌柜 ? '带暗号' : '无暗号'} ${地址}:${端口} (暗桩 ${index + 1}/${要试探的暗桩.length})。瞅准了，别认错人了！`);

      // 创建一个带超时的Promise
      const timeoutPromise = new Promise((resolve, reject) => {
        const id = setTimeout(() => {
          reject(new Error(`接头超时: ${地址}:${端口}，黄花菜都凉了！`));
        }, 暗桩接头时限); // 使用配置的超时时间
      });

      // 竞速连接尝试和超时
      tcpSocket = await Promise.race([
        修建SOCKS5暗桩通道(掌柜, 暗号, 地址, 端口, 辨别地址类型, 目标地址, 敲门端口),
        timeoutPromise
      ]);

      console.log(`成功接头SOCKS5暗桩: ${地址}:${端口}。干得漂亮，弟兄们！`);
      return { socket: tcpSocket, config: proxyConfig }; // 返回成功连接的 socket
    } catch (e) {
      console.warn(`SOCKS5暗桩接头失败或超时 (${proxyConfig}): ${e.message}。这孙子跑得真快！`);
      if (tcpSocket) {
        try { tcpSocket.close(); } catch (closeErr) { console.warn("关闭失败接头时出错:", closeErr); }
      }
      return Promise.reject(new Error(`暗桩有诈: ${proxyConfig} - ${e.message}。赶紧撤！`)); // 标记为拒绝，让 Promise.any 处理
    }
  });

  try {
    const { socket, config } = await Promise.any(connectionPromises);
    // 当 Promise.any 成功时，意味着至少一个暗桩连接成功
    // 此时，Promise.any 会自动处理其他仍在进行的 Promise，不成功的会被抛弃
    return socket;
  } catch (aggregateError) {
    // Promise.any 抛出 AggregateError，如果所有 Promise 都失败了
    console.error(`所有SOCKS5暗桩尝试均失败:`, aggregateError.errors.map(e => e.message).join('; ') + '，全军覆没！');
    throw new Error('所有SOCKS5暗桩尝试均失败，散伙！下次再战！');
  }
}

// 提取创建SOCKS5接口的核心逻辑到单独函数，方便复用
async function 修建SOCKS5暗桩通道(掌柜, 暗号, S5地址, S5端口, 辨别地址类型, 目标地址, 敲门端口) { // 咱们的秘密通道，得修得严严实实！
  const SOCKS5暗桩 = connect({ hostname: S5地址, port: S5端口 });
  let 传输军情, 接收军情;
  try {
    await SOCKS5暗桩.opened;
    传输军情 = SOCKS5暗桩.writable.getWriter();
    接收军情 = SOCKS5暗桩.readable.getReader();
    const 翻译官 = new TextEncoder(); // 找个懂行的来翻译！

    // SOCKS5 认证协商
    // Support no authentication (0x00) and username/password (0x02)
    const 密谋S5认证 = new Uint8Array([5, 2, 0, 2]); // 先跟对方套套近乎！
    await 传输军情.write(密谋S5认证);
    const 听取认证要求 = (await 接收军情.read()).value;

    if (!听取认证要求 || 听取认证要求.length < 2) {
      throw new Error('SOCKS5认证协商回应无效，有内奸！是哪个王八蛋出卖了我们？！');
    }

    if (听取认证要求[1] === 0x02) { // Username/Password authentication required
      if (!掌柜 || !暗号) {
        throw new Error (`SOCKS5暗桩需要暗号，但未配置掌柜和暗号。没规矩，不成方圆！`);
      }
      const 编织掌柜暗号包 = new Uint8Array([ 1, 掌柜.length, ...翻译官.encode(掌柜), 暗号.length, ...翻译官.encode(暗号) ]);
      await 传输军情.write(编织掌柜暗号包);
      const 读取掌柜暗号认证结果 = (await 接收军情.read()).value;
      if (!读取掌柜暗号认证结果 || 读取掌柜暗号认证结果.length < 2 || 读取掌柜暗号认证结果[0] !== 0x01 || 读取掌柜暗号认证结果[1] !== 0x00) {
        throw new Error (`SOCKS5掌柜暗号错误或认证失败，被发现了！赶紧跑！`);
      }
    } else if (听取认证要求[1] === 0x00) { // No authentication required
        // Do nothing, proceed to connection
    } else {
        throw new Error (`SOCKS5认证方式不支持: ${听取认证要求[1]}，别装神弄鬼！快说你是哪路神仙！`);
    }

    // SOCKS5 连接目标
    let 转换目标地址; // 把这地址给老子翻译过来！
    switch (辨别地址类型) {
      case 1: // IPv4
        转换目标地址 = new Uint8Array( [1, ...目标地址.split('.').map(Number)] );
        break;
      case 2: // 域名
        转换目标地址 = new Uint8Array( [3, 目标地址.length, ...翻译官.encode(目标地址)] );
        break;
      case 3: // IPv6
        const ipv6Parts = 目标地址.split(':');
        const ipv6Bytes = [];
        let doubleColonHandled = false;
        for (let i = 0; i < ipv6Parts.length; i++) {
          let part = ipv6Parts[i];
          if (part === '') { // Handle ::
            if (!doubleColonHandled) {
              let numMissingParts = 8 - (ipv6Parts.length - 1);
              if (ipv6Parts[0] === '' && i === 0) numMissingParts++; // e.g. ::1
              if (ipv6Parts[ipv6Parts.length - 1] === '' && i === ipv6Parts.length - 1) numMissingParts++; // e.g. 1::

              for (let j = 0; j < numMissingParts; j++) {
                ipv6Bytes.push(0x00, 0x00);
              }
              doubleColonHandled = true;
            }
          } else {
            let val = parseInt(part, 16);
            ipv6Bytes.push((val >> 8) & 0xFF, val & 0xFF);
          }
        }
        // If :: was at the end and no explicit parts followed, ensure 8 parts
        while (ipv6Bytes.length < 16) {
            ipv6Bytes.push(0x00, 0x00);
        }
        转换目标地址 = new Uint8Array( [4, ...ipv6Bytes] );
        break;
      default:
        throw new Error ('无效的SOCKS5目标地址类型，鬼鬼祟祟！不像好人！');
    }

    const 构建转换后的目标地址 = new Uint8Array([ 5, 1, 0, ...转换目标地址, 敲门端口 >> 8, 敲门端口 & 0xff ]);
    await 传输军情.write(构建转换后的目标地址);
    const 检查回执 = (await 接收军情.read()).value;

    if (!检查回执 || 检查回执.length < 2 || 检查回执[0] !== 0x05 || 检查回执[1] !== 0x00) {
      throw new Error (`SOCKS5目标地址接头失败，目标: ${目标地址}:${敲门端口}, SOCKS5回应码: ${检查回执 ? 检查回执[1] : '无回应'}，有埋伏！赶紧撤！`);
    }

    传输军情.releaseLock(); // 撒手！
    接收军情.releaseLock(); // 放手！
    return SOCKS5暗桩;
  } catch (e) {
    if (传输军情) 传输军情.releaseLock();
    if (接收军情) 接收军情.releaseLock();
    if (SOCKS5暗桩) SOCKS5暗桩.close();
    // 抛出错误以便上层 (摸金校尉探暗桩) 捕获并跳过
    throw e;
  }
}

async function 拉拢勾结(ws, tcp, init) { // 咱们得把这群肥羊拉拢过来，给咱们送钱！
  // 发送 VL 握手成功的响应
  ws.send(new Uint8Array([0, 0])); // 示意一下，咱们是自己人！

  const writer = tcp.writable.getWriter();
  const reader = tcp.readable.getReader();

  // 写入 VL 客户端的初始数据
  if (init && init.byteLength > 0) {
    await writer.write(init).catch(err => console.error("写入初始数据到TCP失败:", err)); // 赶紧把情报塞过去！
  }

  // WebSocket 到 TCP 的数据传输 (肥羊到暗桩)
  ws.addEventListener('message', async e => {
    if (e.data instanceof ArrayBuffer) {
      try {
        await writer.write(e.data);
      } catch (err) {
        console.error("从WebSocket写入TCP失败:", err); // 这情报怎么送不过去？！
        // 如果写入失败，可以考虑关闭 WS，但这里更倾向于让 TCP 的错误处理来结束连接
      }
    } else {
      console.warn("收到非ArrayBuffer类型数据 (WebSocket):", e.data); // 搞什么鬼？！
    }
  });

  // TCP 到 WebSocket 的数据传输 (暗桩到肥羊)
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break; // TCP连接关闭。断线了！
      if (value) {
        try {
          ws.send(value);
        } catch (sendErr) {
          console.error("从TCP发送数据到WebSocket失败:", sendErr); // 情报发不出去！
          break; // 如果WebSocket发送失败，停止读取TCP
        }
      }
    }
  } catch (readErr) {
    console.error("从TCP读取数据失败:", readErr); // 读不到情报了！
  } finally {
    // 确保所有资源被关闭
    try { ws.close(); } catch (e) { console.warn("关闭WebSocket失败:", e); } // 关门放狗！
    try { reader.cancel(); } catch (e) { console.warn("取消TCP读取器失败:", e); } // 掐断它的念想！
    try { writer.releaseLock(); } catch (e) { console.warn("释放TCP写入器锁失败:", e); } // 松手！
    try { tcp.close(); } catch (e) { console.warn("关闭TCP连接失败:", e); } // 彻底断了联系！
    console.log("传输军情通道已关闭。今天的买卖到此为止！");
  }
}

function 验明大当家密钥(a) { // 假的密钥，一眼就能看穿！
  const hex = Array.from(a, v => v.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

async function 探听SOCKS5暗号(SOCKS5) { // 探听黑市上的规矩，别露馅了！
  const 拆分暗号 = SOCKS5.lastIndexOf("@");
  if (拆分暗号 === -1) { // 如果没有掌柜和暗号，则直接是地址:端口。光杆司令一个！
    const [地址, 端口] = 破解地址端口(SOCKS5);
    return { 掌柜: '', 暗号: '', 地址, 端口 };
  }
  const 掌柜段 = SOCKS5.slice(0, 拆分暗号);
  const 地址段 = SOCKS5.slice(拆分暗号 + 1);
  const lastColonInAccount = 掌柜段.lastIndexOf(":");
  const 掌柜 = lastColonInAccount > -1 ? 掌柜段.slice(0, lastColonInAccount) : '';
  const 暗号 = lastColonInAccount > -1 ? 掌柜段.slice(lastColonInAccount + 1) : '';
  const [地址, 端口] = 破解地址端口(地址段);
  return { 掌柜, 暗号, 地址, 端口 };
}

function 破解地址端口(地址段) { // 这地址和端口，得给老子掰开了揉碎了！
  let 地址, 端口;
  if (地址段.startsWith('[')) { // IPv6地址
    const endBracket = 地址段.indexOf(']');
    if (endBracket === -1) throw new Error('无效的IPv6地址格式，藏头露尾！给我揪出来！');
    地址 = 地址段.slice(1, endBracket);
    // 检查是否有端口，例如 [::1]:8080
    const portString = 地址段.slice(endBracket + 1);
    端口 = portString.startsWith(':') ? Number(portString.slice(1)) : 443;
    if (isNaN(端口) || 端口 <= 0 || 端口 > 65535) 端口 = 443; // 默认端口，别想蒙混过关！
  } else { // IPv4或域名
    const lastColon = 地址段.lastIndexOf(':');
    if (lastColon > -1 && !isNaN(Number(地址段.slice(lastColon + 1)))) {
      地址 = 地址段.slice(0, lastColon);
      端口 = Number(地址段.slice(lastColon + 1));
    } else {
      地址 = 地址段;
      端口 = 443; // 默认端口，别想跑！
    }
  }
  return [地址, 端口];
}

async function 寻最快活路(敲门域名) { // 哪个活路最近，就走哪条！
  const 构造请求 = (type) =>
    寻路神仙列表.map(寻路神仙 =>
      fetch(`${寻路神仙}?name=${敲门域名}&type=${type}`, {
        headers: { 'Accept': 'application/dns-json' }
      }).then(res => res.json())
        .then(json => {
          // A 记录 type 1, AAAA 记录 type 28
          const ip = json.Answer?.find(r => r.type === (type === 'A' ? 1 : 28))?.data;
          if (ip) return ip;
          return Promise.reject(`无 ${type} 记录，此路不通，换一条！`);
        })
        .catch(err => Promise.reject(`${寻路神仙} ${type} 请求失败: ${err}，这神仙不灵了！`))
    );
  try {
    // 优先尝试获取 A 记录 (IPv4)
    return await Promise.any(构造请求('A'));
  } catch (e) {
    // 如果 IPv4 失败，尝试获取 AAAA 记录 (IPv6)
    try {
      return await Promise.any(构造请求('AAAA'));
    } catch (e2) {
      console.warn(`寻路神仙查询 ${敲门域名} 失败 (IPv4 和 IPv6): ${e2.message}，看来神仙也束手无策了！`);
      return 敲门域名; // 所有寻路神仙查询失败，返回原始域名
    }
  }
}

function 给小肥羊看规矩(ID, host) { // 规矩都写在纸上了，别说我没告诉你们！
  return `
1、本寨规的私密信物功能只支持通用指引，其他请关闭信物功能。少给我玩花样！
2、其他需求自行研究，否则打断腿！后果自负！
通用的秘道指引：https${接头标志}${host}/${ID}/${暗号}${狗皮膏药}
`;
}

function 给小肥羊秘道指引(host) { // 指引给他们，让他们自己跳坑！
  // 确保优先秘道至少有一个值，并且是可用的 host
  const effectiveMyPreferred = 优先秘道.length > 0 ? 优先秘道 : [`${host}:443#备用小路，崎岖难行！`]; // 备用小路，一般人可走不了！

  if (信物开关) {
    return `请先关闭私密信物功能，否则不给看！别想蒙混过关！`;
  } else {
    return effectiveMyPreferred.map(item => {
      // 检查 item 是否包含 @ (tls 配置)
      const parts = item.split("@");
      let mainPart = parts[0];
      let tlsOption = 'security=tls'; // 默认启用TLS加密。加密了才安全！

      if (parts.length > 1) {
          // 如果有 @ 符号，则后面的部分可能是 tls 配置
          const tlsConfig = parts[1];
          if (tlsConfig.toLowerCase() === 'notls') {
              tlsOption = 'security=none';
          }
          // 如果还有其他 tls 配置，可以在这里扩展解析
      }

      const [addrPort, name = 我的地盘名字] = mainPart.split("#");
      const addrParts = addrPort.split(":");
      const port = addrParts.length > 1 && !isNaN(Number(addrParts[addrParts.length - 1])) ? Number(addrParts.pop()) : 443;
      const addr = addrParts.join(":"); // 重新组合地址，处理 IPv6 带冒号的情况。地址可不能错了！

      return `${暗号}${狗皮膏药}${接头标志}${大当家密钥}@${addr}:${port}?encryption=none&${tlsOption}&sni=${host}&type=ws&host=${host}&path=%2F%3Fed%3D2560#${name}，这就是咱们的地盘，谁敢不服！`;
    }).join("\n");
  }
      }
