// version base on commit 58686d5d125194d34a1137913b3a64ddcf55872f, time is 2024-11-27 09:26:02 UTC.
// @ts-ignore
import { connect } from 'cloudflare:sockets';

// 如何生成你自己的UUID:
// [Windows] 按 "Win + R", 输入 cmd 并运行: Powershell -NoExit -Command "[guid]::NewGuid()"
let 用户ID = 'd342d11e-d424-4583-b36e-524ab1f0afa4';

let 代理IP地址 = '';

// 用户名和密码不包含特殊字符
// 设置地址将忽略代理IP地址
// 示例: user:pass@host:port 或 host:port
let Socks5服务器地址 = '';

if (!验证UUID有效性(用户ID)) {
	throw new Error('UUID 无效');
}

let 解析后的Socks5地址 = {};
let 启用Socks代理 = false;

// 敏感词处理: 'vless'
const 协议部分1 = 'vl';
const 协议部分2 = 'ess';
const 协议分隔符 = '://';

export default {
	/**
	 * @param {import("@cloudflare/workers-types").Request} 请求
	 * @param {{UUID: string, PROXYIP: string}} 环境配置
	 * @param {import("@cloudflare/workers-types").ExecutionContext} 执行上下文
	 * @returns {Promise<Response>}
	 */
	async fetch(请求, 环境配置, 执行上下文) {
		try {
			用户ID = 环境配置.UUID || 用户ID;
			代理IP地址 = 环境配置.PROXYIP || 代理IP地址;
			Socks5服务器地址 = 环境配置.SOCKS5 || Socks5服务器地址;
			if (Socks5服务器地址) {
				try {
					解析后的Socks5地址 = 解析Socks5地址(Socks5服务器地址);
					启用Socks代理 = true;
				} catch (错误) {
  			/** @type {Error} */ let e = 错误;
					console.log(e.toString());
					启用Socks代理 = false;
				}
			}
			const 升级头 = 请求.headers.get('Upgrade');
			if (!升级头 || 升级头 !== 'websocket') {
				const URL对象 = new URL(请求.url);
				switch (URL对象.pathname) {
					case '/':
						return new Response(JSON.stringify(请求.cf), { status: 200 });
					case `/${用户ID}`: {
						const 配置信息 = 生成Vless配置(用户ID, 请求.headers.get('Host'));
						return new Response(`${配置信息}`, {
							status: 200,
							headers: {
								"Content-Type": "text/plain;charset=utf-8",
							}
						});
					}
					default:
						return new Response('未找到', { status: 404 });
				}
			} else {
				return await 处理Vless通过WebSocket(请求);
			}
		} catch (错误) {
			/** @type {Error} */ let e = 错误;
			return new Response(e.toString());
		}
	},
};




/**
 *
 * @param {import("@cloudflare/workers-types").Request} 请求
 */
async function 处理Vless通过WebSocket(请求) {

	/** @type {import("@cloudflare/workers-types").WebSocket[]} */
	// @ts-ignore
	const WebSocket配对 = new WebSocketPair();
	const [客户端, WebSocket连接] = Object.values(WebSocket配对);

	WebSocket连接.accept();

	let 目标地址 = '';
	let 端口随机日志 = '';
	const 记录日志 = (/** @type {string} */ 信息, /** @type {string | undefined} */ 事件) => {
		console.log(`[${目标地址}:${端口随机日志}] ${信息}`, 事件 || '');
	};
	const 早期数据头 = 请求.headers.get('sec-websocket-protocol') || '';

	const 可读WebSocket流 = 创建可读WebSocket流(WebSocket连接, 早期数据头, 记录日志);

	/** @type {{ value: import("@cloudflare/workers-types").Socket | null}}*/
	let 远程Socket封装 = {
		value: null,
	};
	let 是否DNS查询 = false;

	// ws --> remote
	可读WebSocket流.pipeTo(new WritableStream({
		async write(数据块, 控制器) {
			if (是否DNS查询) {
				return await 处理DNS查询(数据块, WebSocket连接, null, 记录日志);
			}
			if (远程Socket封装.value) {
				const 写入器 = 远程Socket封装.value.writable.getWriter()
				await 写入器.write(数据块);
				写入器.releaseLock();
				return;
			}

			const {
				hasError,
				message,
				地址类型,
				远程端口 = 443,
				远程地址 = '',
				原始数据索引,
				Vless协议版本 = new Uint8Array([0, 0]),
				是否UDP,
			} = 解析Vless头部(数据块, 用户ID);
			目标地址 = 远程地址;
			端口随机日志 = `${远程端口}--${Math.random()} ${是否UDP ? 'udp ' : 'tcp '
				} `;
			if (hasError) {
				// 控制器.error(message);
				throw new Error(message); // cf 似乎有bug, 控制器.error 不会结束流
				// WebSocket连接.close(1000, message);
				return;
			}
			// 如果是UDP但端口不是DNS端口, 则关闭
			if (是否UDP) {
				if (远程端口 === 53) {
					是否DNS查询 = true;
				} else {
					// 控制器.error('UDP代理只支持DNS端口53');
					throw new Error('UDP代理只支持DNS端口53'); // cf 似乎有bug, 控制器.error 不会结束流
					return;
				}
			}
			// ["版本", "附加信息长度 N"]
			const Vless响应头 = new Uint8Array([Vless协议版本[0], 0]);
			const 原始客户端数据 = 数据块.slice(原始数据索引);

			if (是否DNS查询) {
				return 处理DNS查询(原始客户端数据, WebSocket连接, Vless响应头, 记录日志);
			}
			建立TCP出站连接(远程Socket封装, 地址类型, 远程地址, 远程端口, 原始客户端数据, WebSocket连接, Vless响应头, 记录日志);
		},
		close() {
			记录日志(`可读WebSocket流已关闭`);
		},
		abort(原因) {
			记录日志(`可读WebSocket流中止`, JSON.stringify(原因));
		},
	})).catch((错误) => {
		记录日志('可读WebSocket流管道传输错误', 错误);
	});

	return new Response(null, {
		status: 101,
		// @ts-ignore
		webSocket: 客户端,
	});
}

/**
 * 处理出站TCP连接.
 *
 * @param {any} 远程Socket封装
 * @param {number} 地址类型 要连接的远程地址类型.
 * @param {string} 远程地址 要连接的远程地址.
 * @param {number} 远程端口 要连接的远程端口.
 * @param {Uint8Array} 原始客户端数据 要写入的原始客户端数据.
 * @param {import("@cloudflare/workers-types").WebSocket} WebSocket连接 将远程Socket传递给的WebSocket.
 * @param {Uint8Array} Vless响应头 VLESS响应头.
 * @param {function} 记录日志 日志记录函数.
 * @returns {Promise<void>} 远程Socket.
 */
async function 建立TCP出站连接(远程Socket封装, 地址类型, 远程地址, 远程端口, 原始客户端数据, WebSocket连接, Vless响应头, 记录日志,) {
	async function 连接并写入数据(地址, 端口, 使用Socks = false) {
		/** @type {import("@cloudflare/workers-types").Socket} */
		const TCPSocket = 使用Socks ? await Socks5连接(地址类型, 地址, 端口, 记录日志)
			: connect({
				hostname: 地址,
				port: 端口,
			});
		远程Socket封装.value = TCPSocket;
		记录日志(`已连接到 ${地址}:${端口}`);
		const 写入器 = TCPSocket.writable.getWriter();
		await 写入器.write(原始客户端数据); // 首次写入，通常是tls客户端hello
		写入器.releaseLock();
		return TCPSocket;
	}

	// 如果cf连接的tcp socket没有传入数据，则尝试重定向ip
	async function 重试连接() {
		if (启用Socks代理) {
			TCPSocket = await 连接并写入数据(远程地址, 远程端口, true);
		} else {
			TCPSocket = await 连接并写入数据(代理IP地址 || 远程地址, 远程端口);
		}
		// 无论重试成功与否，都关闭websocket
		TCPSocket.closed.catch(错误 => {
			console.log('重试TCPSocket关闭错误', 错误);
		}).finally(() => {
			安全关闭WebSocket(WebSocket连接);
		})
		管道远程Socket到WebSocket(TCPSocket, WebSocket连接, Vless响应头, null, 记录日志);
	}

	let TCPSocket = await 连接并写入数据(远程地址, 远程端口);

	// 当远程Socket准备就绪时，传递给websocket
	// 远程--> ws
	管道远程Socket到WebSocket(TCPSocket, WebSocket连接, Vless响应头, 重试连接, 记录日志);
}

/**
 *
 * @param {import("@cloudflare/workers-types").WebSocket} WebSocket服务器
 * @param {string} 早期数据头 用于ws 0rtt
 * @param {(信息: string)=> void} 记录日志 用于ws 0rtt
 */
function 创建可读WebSocket流(WebSocket服务器, 早期数据头, 记录日志) {
	let 可读流已取消 = false;
	const 流 = new ReadableStream({
		start(控制器) {
			WebSocket服务器.addEventListener('message', (事件) => {
				if (可读流已取消) {
					return;
				}
				const 消息 = 事件.data;
				控制器.enqueue(消息);
			});

			// 此事件表示客户端关闭了客户端 -> 服务器流。
			// 但是，服务器 -> 客户端流仍然打开，直到您在服务器端调用close()。
			// WebSocket协议规定，必须在每个方向发送单独的关闭消息才能完全关闭套接字。
			WebSocket服务器.addEventListener('close', () => {
				// 客户端发送关闭，需要关闭服务器
				// 如果流已取消，跳过控制器.close
				安全关闭WebSocket(WebSocket服务器);
				if (可读流已取消) {
					return;
				}
				控制器.close();
			}
			);
			WebSocket服务器.addEventListener('error', (错误) => {
				记录日志('WebSocket服务器出错');
				控制器.error(错误);
			}
			);
			// 用于ws 0rtt
			const { 早期数据, 错误 } = 解码Base64到ArrayBuffer(早期数据头);
			if (错误) {
				控制器.error(错误);
			} else if (早期数据) {
				控制器.enqueue(早期数据);
			}
		},

		pull(控制器) {
			// 如果ws可以停止读取，如果流已满，我们可以实现背压
			// https://streams.spec.whatwg.org/#example-rs-push-backpressure
		},
		cancel(原因) {
			// 1. 管道写入流出错，此取消将被调用，因此ws在此处处理服务器关闭
			// 2. 如果可读流已取消，所有控制器.close/enqueue 都需要跳过，
			// 3. 但从测试来看，即使可读流已取消，控制器.error 仍然有效
			if (可读流已取消) {
				return;
			}
			记录日志(`可读流因 ${原因} 被取消`)
			可读流已取消 = true;
			安全关闭WebSocket(WebSocket服务器);
		}
	});

	return 流;

}

// https://xtls.github.io/development/protocols/vless.html
// https://github.com/zizifn/excalidraw-backup/blob/main/v2ray-protocol.excalidraw

/**
 *
 * @param { ArrayBuffer} Vless数据块
 * @param {string} 用户ID
 * @returns
 */
function 解析Vless头部(
	Vless数据块,
	用户ID
) {
	if (Vless数据块.byteLength < 24) {
		return {
			hasError: true,
			message: '无效数据',
		};
	}
	const 版本 = new Uint8Array(Vless数据块.slice(0, 1));
	let 用户有效 = false;
	let 是UDP = false;
	if (UUID转字符串(new Uint8Array(Vless数据块.slice(1, 17))) === 用户ID) {
		用户有效 = true;
	}
	if (!用户有效) {
		return {
			hasError: true,
			message: '无效用户',
		};
	}

	const 选项长度 = new Uint8Array(Vless数据块.slice(17, 18))[0];
	// 暂时跳过选项

	const 命令 = new Uint8Array(
		Vless数据块.slice(18 + 选项长度, 18 + 选项长度 + 1)
	)[0];

	// 0x01 TCP
	// 0x02 UDP
	// 0x03 MUX
	if (命令 === 1) {
	} else if (命令 === 2) {
		是UDP = true;
	} else {
		return {
			hasError: true,
			message: `命令 ${命令} 不支持, 命令 01-tcp,02-udp,03-mux`,
		};
	}
	const 端口索引 = 18 + 选项长度 + 1;
	const 端口缓冲 = Vless数据块.slice(端口索引, 端口索引 + 2);
	// 端口在原始数据中是大端序，例如 80 == 0x005d
	const 远程端口 = new DataView(端口缓冲).getUint16(0);

	let 地址索引 = 端口索引 + 2;
	const 地址缓冲 = new Uint8Array(
		Vless数据块.slice(地址索引, 地址索引 + 1)
	);

	// 1--> ipv4 地址长度 =4
	// 2--> 域名 地址长度=地址缓冲[1]
	// 3--> ipv6 地址长度 =16
	const 地址类型 = 地址缓冲[0];
	let 地址长度 = 0;
	let 地址值索引 = 地址索引 + 1;
	let 远程地址值 = '';
	switch (地址类型) {
		case 1:
			地址长度 = 4;
			远程地址值 = new Uint8Array(
				Vless数据块.slice(地址值索引, 地址值索引 + 地址长度)
			).join('.');
			break;
		case 2:
			地址长度 = new Uint8Array(
				Vless数据块.slice(地址值索引, 地址值索引 + 1)
			)[0];
			地址值索引 += 1;
			远程地址值 = new TextDecoder().decode(
				Vless数据块.slice(地址值索引, 地址值索引 + 地址长度)
			);
			break;
		case 3:
			地址长度 = 16;
			const 数据视图 = new DataView(
				Vless数据块.slice(地址值索引, 地址值索引 + 地址长度)
			);
			// 2001:0db8:85a3:0000:0000:8a2e:0370:7334
			const ipv6地址 = [];
			for (let i = 0; i < 8; i++) {
				ipv6地址.push(数据视图.getUint16(i * 2).toString(16));
			}
			远程地址值 = ipv6地址.join(':');
			// 似乎不需要为ipv6添加 []
			break;
		default:
			return {
				hasError: true,
				message: `无效的 地址类型 是 ${地址类型}`,
			};
	}
	if (!远程地址值) {
		return {
			hasError: true,
			message: `地址值为空, 地址类型是 ${地址类型}`,
		};
	}

	return {
		hasError: false,
		远程地址: 远程地址值,
		地址类型,
		远程端口,
		原始数据索引: 地址值索引 + 地址长度,
		Vless协议版本: 版本,
		是否UDP,
	};
}


/**
 *
 * @param {import("@cloudflare/workers-types").Socket} 远程Socket
 * @param {import("@cloudflare/workers-types").WebSocket} WebSocket连接
 * @param {ArrayBuffer} Vless响应头
 * @param {(() => Promise<void>) | null} 重试
 * @param {*} 记录日志
 */
async function 管道远程Socket到WebSocket(远程Socket, WebSocket连接, Vless响应头, 重试, 记录日志) {
	// 远程--> ws
	let 有传入数据 = false; // 检查远程Socket是否有传入数据
	/** @type {ArrayBuffer | null} */
	let 当前Vless头 = Vless响应头;
	await 远程Socket.readable
		.pipeTo(
			new WritableStream({
				start() {
				},
				/**
				 *
				 * @param {Uint8Array} 数据块
				 * @param {*} 控制器
				 */
				async write(数据块, 控制器) {
					有传入数据 = true;
					if (WebSocket连接.readyState !== WS_就绪状态_开启) {
						控制器.error(
							'WebSocket连接就绪状态未开启, 可能已关闭'
						);
					}
					if (当前Vless头) {
						WebSocket连接.send(await new Blob([当前Vless头, 数据块]).arrayBuffer());
						当前Vless头 = null;
					} else {
						WebSocket连接.send(数据块);
					}
				},
				close() {
					记录日志(`远程连接!.readable 已关闭, 有传入数据为 ${有传入数据}`);
				},
				abort(原因) {
					console.error(`远程连接!.readable 中止`, 原因);
				},
			})
		)
		.catch((错误) => {
			console.error(
				`管道远程Socket到WebSocket发生异常 `,
				错误.stack || 错误
			);
			安全关闭WebSocket(WebSocket连接);
		});

	// 似乎是cf连接socket出错，
	// 1. Socket.closed 将有错误
	// 2. Socket.readable 将关闭而没有任何数据传入
	if (有传入数据 === false && 重试) {
		记录日志(`重试`)
		重试();
	}
}

/**
 *
 * @param {string} base64字符串
 * @returns
 */
function 解码Base64到ArrayBuffer(base64字符串) {
	if (!base64字符串) {
		return { error: null };
	}
	try {
		// go 使用修改的Base64 for URL rfc4648，js atob 不支持
		base64字符串 = base64字符串.replace(/-/g, '+').replace(/_/g, '/');
		const 解码结果 = atob(base64字符串);
		const 字节数组缓冲 = Uint8Array.from(解码结果, (c) => c.charCodeAt(0));
		return { 早期数据: 字节数组缓冲.buffer, error: null };
	} catch (错误) {
		return { error: 错误 };
	}
}

/**
 * 这不是真正的UUID验证
 * @param {string} uuid
 */
function 验证UUID有效性(uuid) {
	const uuid正则表达式 = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuid正则表达式.test(uuid);
}

const WS_就绪状态_开启 = 1;
const WS_就绪状态_关闭中 = 2;
/**
 * 通常，WebSocket关闭时不会有异常。
 * @param {import("@cloudflare/workers-types").WebSocket} 套接字
 */
function 安全关闭WebSocket(套接字) {
	try {
		if (套接字.readyState === WS_就绪状态_开启 || 套接字.readyState === WS_就绪状态_关闭中) {
			套接字.close();
		}
	} catch (错误) {
		console.error('安全关闭WebSocket错误', 错误);
	}
}

const 字节到十六进制映射 = [];
for (let i = 0; i < 256; ++i) {
	字节到十六进制映射.push((i + 256).toString(16).slice(1));
}
function 不安全UUID转字符串(数组, 偏移量 = 0) {
	return (字节到十六进制映射[数组[偏移量 + 0]] + 字节到十六进制映射[数组[偏移量 + 1]] + 字节到十六进制映射[数组[偏移量 + 2]] + 字节到十六进制映射[数组[偏移量 + 3]] + "-" + 字节到十六进制映射[数组[偏移量 + 4]] + 字节到十六进制映射[数组[偏移量 + 5]] + "-" + 字节到十六进制映射[数组[偏移量 + 6]] + 字节到十六进制映射[数组[偏移量 + 7]] + "-" + 字节到十六进制映射[数组[偏移量 + 8]] + 字节到十六进制映射[数组[偏移量 + 9]] + "-" + 字节到十六进制映射[数组[偏移量 + 10]] + 字节到十六进制映射[数组[偏移量 + 11]] + 字节到十六进制映射[数组[偏移量 + 12]] + 字节到十六进制映射[数组[偏移量 + 13]] + 字节到十六进制映射[数组[偏移量 + 14]] + 字节到十六进制映射[数组[偏移量 + 15]]).toLowerCase();
}
function UUID转字符串(数组, 偏移量 = 0) {
	const uuid = 不安全UUID转字符串(数组, 偏移量);
	if (!验证UUID有效性(uuid)) {
		throw TypeError("字符串化的UUID无效");
	}
	return uuid;
}

/**
 *
 * @param {ArrayBuffer} UDP数据块
 * @param {import("@cloudflare/workers-types").WebSocket} WebSocket连接
 * @param {ArrayBuffer} Vless响应头
 * @param {(string)=> void} 记录日志
 */
async function 处理DNS查询(UDP数据块, WebSocket连接, Vless响应头, 记录日志) {
	// 无论客户端发送哪个DNS服务器，我们总是使用硬编码的服务器。
	// 因为某些DNS服务器不支持DNS over TCP
	try {
		const dns服务器 = '8.8.4.4'; // cf修复连接自身ip bug后改为1.1.1.1
		const dns端口 = 53;
		/** @type {ArrayBuffer | null} */
		let 当前Vless头 = Vless响应头;
		/** @type {import("@cloudflare/workers-types").Socket} */
		const TCPSocket = connect({
			hostname: dns服务器,
			port: dns端口,
		});

		记录日志(`已连接到 ${dns服务器}:${dns端口}`);
		const 写入器 = TCPSocket.writable.getWriter();
		await 写入器.write(UDP数据块);
		写入器.releaseLock();
		await TCPSocket.readable.pipeTo(new WritableStream({
			async write(数据块) {
				if (WebSocket连接.readyState === WS_就绪状态_开启) {
					if (当前Vless头) {
						WebSocket连接.send(await new Blob([当前Vless头, 数据块]).arrayBuffer());
						当前Vless头 = null;
					} else {
						WebSocket连接.send(数据块);
					}
				}
			},
			close() {
				记录日志(`dns服务器(${dns服务器}) tcp已关闭`);
			},
			abort(原因) {
				console.error(`dns服务器(${dns服务器}) tcp中止`, 原因);
			},
		}));
	} catch (错误) {
		console.error(
			`处理DNS查询发生异常, 错误: ${错误.message}`
		);
	}
}

/**
 *
 * @param {number} 地址类型
 * @param {string} 远程地址
 * @param {number} 远程端口
 * @param {function} 记录日志 日志记录函数.
 */
async function Socks5连接(地址类型, 远程地址, 远程端口, 记录日志) {
	const { username, password, hostname, port } = 解析后的Socks5地址;
	// 连接到SOCKS服务器
	const 套接字 = connect({
		hostname,
		port,
	});

	// 请求头格式 (Worker -> Socks服务器):
	// +----+----------+----------+
	// |VER | NMETHODS | METHODS  |
	// +----+----------+----------+
	// | 1  |    1     | 1 to 255 |
	// +----+----------+----------+

	// https://en.wikipedia.org/wiki/SOCKS#SOCKS5
	// 对于 METHODS:
	// 0x00 无需认证
	// 0x02 用户名/密码 https://datatracker.ietf.org/doc/html/rfc1929
	const socks问候语 = new Uint8Array([5, 2, 0, 2]);

	const 写入器 = 套接字.writable.getWriter();

	await 写入器.write(socks问候语);
	记录日志('已发送socks问候语');

	const 读取器 = 套接字.readable.getReader();
	const 编码器 = new TextEncoder();
	let 响应 = (await 读取器.read()).value;
	// 响应格式 (Socks服务器 -> Worker):
	// +----+--------+
	// |VER | METHOD |
	// +----+--------+
	// | 1  |   1    |
	// +----+--------+
	if (响应[0] !== 0x05) {
		记录日志(`socks服务器版本错误: ${响应[0]} 预期: 5`);
		return;
	}
	if (响应[1] === 0xff) {
		记录日志("没有可接受的方法");
		return;
	}

	// 如果返回 0x0502
	if (响应[1] === 0x02) {
		记录日志("socks服务器需要认证");
		if (!username || !password) {
			记录日志("请提供用户名/密码");
			return;
		}
		// +----+------+----------+------+----------+
		// |VER | ULEN |  UNAME   | PLEN |  PASSWD  |
		// +----+------+----------+------+----------+
		// | 1  |  1   | 1 to 255 |  1   | 1 to 255 |
		// +----+------+----------+------+----------+
		const 认证请求 = new Uint8Array([
			1,
			username.length,
			...编码器.encode(username),
			password.length,
			...编码器.encode(password)
		]);
		await 写入器.write(认证请求);
		响应 = (await 读取器.read()).value;
		// 预期 0x0100
		if (响应[0] !== 0x01 || 响应[1] !== 0x00) {
			记录日志("认证socks服务器失败");
			return;
		}
	}

	// 请求数据格式 (Worker -> Socks服务器):
	// +----+-----+-------+------+----------+----------+
	// |VER | CMD |  RSV  | ATYP | DST.ADDR | DST.PORT |
	// +----+-----+-------+------+----------+----------+
	// | 1  |  1  | X'00' |  1   | Variable |    2     |
	// +----+-----+-------+------+----------+----------+
	// ATYP: 后续地址的地址类型
	// 0x01: IPv4地址
	// 0x03: 域名
	// 0x04: IPv6地址
	// DST.ADDR: 期望的目标地址
	// DST.PORT: 期望的目标端口，网络字节序

	// 地址类型
	// 1--> ipv4 地址长度 =4
	// 2--> 域名
	// 3--> ipv6 地址长度 =16
	let 目标地址缓冲;	// 目标地址缓冲 = ATYP + DST.ADDR
	switch (地址类型) {
		case 1:
			目标地址缓冲 = new Uint8Array(
				[1, ...远程地址.split('.').map(Number)]
			);
			break;
		case 2:
			目标地址缓冲 = new Uint8Array(
				[3, 远程地址.length, ...编码器.encode(远程地址)]
			);
			break;
		case 3:
			目标地址缓冲 = new Uint8Array(
				[4, ...远程地址.split(':').flatMap(x => [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2), 16)])]
			);
			break;
		default:
			记录日志(`无效的 地址类型 是 ${地址类型}`);
			return;
	}
	const socks请求 = new Uint8Array([5, 1, 0, ...目标地址缓冲, 远程端口 >> 8, 远程端口 & 0xff]);
	await 写入器.write(socks请求);
	记录日志('已发送socks请求');

	响应 = (await 读取器.read()).value;
	// 响应格式 (Socks服务器 -> Worker):
	//  +----+-----+-------+------+----------+----------+
	// |VER | REP |  RSV  | ATYP | BND.ADDR | BND.PORT |
	// +----+-----+-------+------+----------+----------+
	// | 1  |  1  | X'00' |  1   | Variable |    2     |
	// +----+-----+-------+------+----------+----------+
	if (响应[1] === 0x00) {
		记录日志("socks连接已开启");
	} else {
		记录日志("开启socks连接失败");
		return;
	}
	写入器.releaseLock();
	读取器.releaseLock();
	return 套接字;
}


/**
 *
 * @param {string} 地址
 */
function 解析Socks5地址(地址) {
	let [后半部分, 前半部分] = 地址.split("@").reverse();
	let username, password, hostname, port;
	if (前半部分) {
		const 前半部分数组 = 前半部分.split(":");
		if (前半部分数组.length !== 2) {
			throw new Error('SOCKS地址格式无效');
		}
		[username, password] = 前半部分数组;
	}
	const 后半部分数组 = 后半部分.split(":");
	port = Number(后半部分数组.pop());
	if (isNaN(port)) {
		throw new Error('SOCKS地址格式无效');
	}
	hostname = 后半部分数组.join(":");
	const 正则表达式 = /^\[.*\]$/;
	if (hostname.includes(":") && !正则表达式.test(hostname)) {
		throw new Error('SOCKS地址格式无效');
	}
	return {
		username,
		password,
		hostname,
		port,
	}
}

/**
 *
 * @param {string} 用户ID
 * @param {string | null} 主机名
 * @returns {string}
 */
function 生成Vless配置(用户ID, 主机名) {
	const 协议 = `${协议部分1}${协议部分2}`; // 重构 "vless"
	const Vless主配置 =
	`${协议}${协议分隔符}${用户ID}@${主机名}:443`+
	`?encryption=none&security=tls&sni=${主机名}&fp=randomized&type=ws&host=${主机名}&path=%2F%3Fed%3D2048#${主机名}`;

	return `
################################################################
v2ray
---------------------------------------------------------------
${Vless主配置}
---------------------------------------------------------------
################################################################
clash-meta
---------------------------------------------------------------
- type: ${协议部分1}${协议部分2}
  name: ${主机名}
  server: ${主机名}
  port: 443
  uuid: ${用户ID}
  network: ws
  tls: true
  udp: false
  sni: ${主机名}
  client-fingerprint: chrome
  ws-opts:
    path: "/?ed=2048"
    headers:
      host: ${主机名}
---------------------------------------------------------------
################################################################
`;
	}
