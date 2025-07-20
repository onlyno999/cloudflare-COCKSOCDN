// version base on commit 58686d5d125194d34a1137913b3a64ddcf55872f, time is 2024-11-27 09:26:02 UTC.
// @ts-ignore
import { connect } from 'cloudflare:sockets';

// How to generate your own UUID:
// [Windows] Press "Win + R", input cmd and run:  Powershell -NoExit -Command "[guid]::NewGuid()"\
let 用户ID = 'd342d11e-d424-4583-b36e-524ab1f0afa4';

// The user name and password do not contain special characters
// Setting the address will ignore proxyIP
// Example:  user:pass@host:port  or  host:port
let socks5地址 = ''; // 兼容旧的 env.SOCKS5

// Added variables
let 隐藏订阅 = false; // 开启 true ━ 关闭false
let 嘲讽语 = "哎呀你找到了我，但是我就是不给你看，气不气，嘿嘿嘿"; // 此变量将不再用于隐藏订阅的场景
let 启用SOCKS5反代 = true; // 默认关闭，除非配置了 SOCKS5_ENABLE 或 SOCKS5_ADDRESS
let 启用SOCKS5全局反代 = true; // 默认关闭，除非配置了 SOCKS5_GLOBAL 或 SOCKS5_ADDRESS
let 我的SOCKS5账号 = ''; // 存储 SOCKS5_ADDRESS 的值

if (!验证UUID有效性(用户ID)) {
	throw new Error('uuid is not valid');
}

let 解析后Socks5地址 = {};
let 启用Socks = false; // 默认关闭，在 fetch 中根据配置判断是否启用

export default {
	/**
	 * @param {import("@cloudflare/workers-types").Request} request
	 * @param {{UUID: string, SOCKS5_ENABLE?: string, SOCKS5_GLOBAL?: string, SOCKS5_ADDRESS?: string, SOCKS5?: string, HIDE_SUBSCRIPTION?: string}} env
	 * @param {import("@cloudflare/workers-types").ExecutionContext} ctx
	 * @returns {Promise<Response>}
	 */
	async fetch(request, env, ctx) {
		try {
			用户ID = env.UUID || 用户ID;
			socks5地址 = env.SOCKS5 || socks5地址; // 兼容旧的 env.SOCKS5
			
			// 读取 隐藏订阅 环境变量
			隐藏订阅 = 读取环境变量('HIDE_SUBSCRIPTION', 隐藏订阅, env);

			// 读取SOCKS5相关的环境变量
			// 注意这里的读取顺序，我们先尝试读取 SOCKS5_ADDRESS
			我的SOCKS5账号 = 读取环境变量('SOCKS5_ADDRESS', 我的SOCKS5账号, env);

			// 只有当 SOCKS5_ADDRESS 或 SOCKS5 被设置时，才尝试启用 SOCKS5 相关功能
			if (我的SOCKS5账号 || socks5地址) {
				// 如果有地址，默认启用反代和全局反代，但可以被环境变量显式覆盖
				启用SOCKS5反代 = 读取环境变量('SOCKS5_ENABLE', true, env);
				启用SOCKS5全局反代 = 读取环境变量('SOCKS5_GLOBAL', true, env);

				let currentSocks5Address = 我的SOCKS5账号 || socks5地址; // 优先使用 我的SOCKS5账号

				try {
					解析后Socks5地址 = 解析Socks5地址(currentSocks5Address);
					启用Socks = true; // SOCKS5地址解析成功，启用Socks连接
				} catch (err) {
					/** @type {Error} */ let e = err;
					console.log(`Error parsing SOCKS5 address: ${e.toString()}`);
					启用Socks = false; // 解析失败，禁用Socks
				}
			} else {
				// 如果没有 SOCKS5_ADDRESS 也没有 SOCKS5，则确保所有 SOCKS5 功能都关闭
				启用SOCKS5反代 = false;
				启用SOCKS5全局反代 = false;
				启用Socks = false;
			}


			const 升级头 = request.headers.get('Upgrade');
			if (!升级头 || 升级头 !== 'websocket') {
				const url = new URL(request.url);
				switch (url.pathname) {
					case '/':
						return new Response(JSON.stringify(request.cf), { status: 200 });
					case `/${用户ID}`: {
						if (隐藏订阅) {
							// 不显示嘲讽语，返回 404 Not Found
							return new Response('Not found', { status: 404 });
						}
						const vless配置 = 获取配置(用户ID, request.headers.get('Host'));
						return new Response(`${vless配置}`, {
							status: 200,
							headers: {
								"Content-Type": "text/plain;charset=utf-8",
							}
						});
					}
					default:
						return new Response('Not found', { status: 404 });
				}
			} else {
				return await 处理WebSocket(request);
			}
		} catch (err) {
			/** @type {Error} */ let e = err;
			return new Response(e.toString());
		}
	},
};




/**
 *
 * @param {import("@cloudflare/workers-types").Request} request
 */
async function 处理WebSocket(request) {

	/** @type {import("@cloudflare/workers-types").WebSocket[]} */
	// @ts-ignore
	const webSocket对 = new WebSocketPair();
	const [客户端, webSocket] = Object.values(webSocket对);

	webSocket.accept();

	let 地址 = '';
	let 端口带随机日志 = '';
	const 日志记录 = (/** @type {string} */ 信息, /** @type {string | undefined} */ 事件) => {
		console.log(`[${地址}:${端口带随机日志}] ${信息}`, 事件 || '');
	};
	const 早期数据头 = request.headers.get('sec-websocket-protocol') || '';

	const 可读WebSocket流 = 创建可读WebSocket流(webSocket, 早期数据头, 日志记录);

	/** @type {{ value: import("@cloudflare/workers-types").Socket | null}}*/
	let 远程套接字封装 = {
		value: null,
	};
	let 是DNS查询 = false;

	// ws --> remote
	可读WebSocket流.pipeTo(new WritableStream({
		async write(chunk, controller) {
			if (是DNS查询) {
				return await 处理DNS查询(chunk, webSocket, null, 日志记录);
			}
			if (远程套接字封装.value) {
				const 写入器 = 远程套接字封装.value.writable.getWriter()
				await 写入器.write(chunk);
				写入器.releaseLock();
				return;
			}

			const {
				hasError: 有错误,
				message: 消息,
				addressType: 地址类型,
				portRemote: 远程端口 = 443,
				addressRemote: 远程地址 = '',
				rawDataIndex: 原始数据索引,
				vlessVersion: 传输版本 = new Uint8Array([0, 0]),
				isUDP: 是UDP协议,
			} = 处理传输头部(chunk, 用户ID);
			地址 = 远程地址;
			端口带随机日志 = `${远程端口}--${Math.random()} ${是UDP协议 ? 'udp ' : 'tcp '
				} `;
			if (有错误) {
				// controller.error(message);
				throw new Error(消息); // cf seems has bug, controller.error will not end stream
				// webSocket.close(1000, message);
				return;
			}
			// if UDP but port not DNS port, close it
			if (是UDP协议) {
				if (远程端口 === 53) {
					是DNS查询 = true;
				} else {
					// controller.error('UDP proxy only enable for DNS which is port 53');
					throw new Error('UDP proxy only enable for DNS which is port 53'); // cf seems has bug, controller.error will not end stream
					return;
				}
			}
			// ["version", "附加信息长度 N"]
			const 传输响应头部 = new Uint8Array([传输版本[0], 0]);
			const 原始客户端数据 = chunk.slice(原始数据索引);

			if (是DNS查询) {
				return 处理DNS查询(原始客户端数据, webSocket, 传输响应头部, 日志记录);
			}
			处理TCP出站(远程套接字封装, 地址类型, 远程地址, 远程端口, 原始客户端数据, webSocket, 传输响应头部, 日志记录);
		},
		close() {
			日志记录(`readableWebSocketStream is close`);
		},
		abort(reason) {
			日志记录(`readableWebSocketStream is abort`, JSON.stringify(reason));
		},
	})).catch((err) => {
		日志记录('readableWebSocketStream pipeTo error', err);
	});

	return new Response(null, {
		status: 101,
		// @ts-ignore
		webSocket: 客户端,
	});
}

/**
 * Handles outbound TCP connections.
 *
 * @param {any} remoteSocket
 * @param {number} addressType The remote address type to connect to.
 * @param {string} addressRemote The remote address to connect to.
 * @param {number} portRemote The remote port to connect to.
 * @param {Uint8Array} rawClientData The raw client data to write.
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket The WebSocket to pass the remote socket to.
 * @param {Uint8Array} vlessResponseHeader The VLESS response header.
 * @param {function} log The logging function.
 * @returns {Promise<void>} The remote socket.
 */
async function 处理TCP出站(远程套接字, 地址类型, 远程地址, 远程端口, 原始客户端数据, webSocket, 传输响应头部, 日志记录,) {
	async function 连接并写入(地址, 端口, socks = false) {
		/** @type {import("@cloudflare/workers-types").Socket} */
		const tcp套接字 = socks ? await socks5连接(地址类型, 地址, 端口, 日志记录)
			: connect({
				hostname: 地址,
				port: 端口,
			});
		远程套接字.value = tcp套接字;
		日志记录(`connected to ${地址}:${端口}`);
		const 写入器 = tcp套接字.writable.getWriter()
		await 写入器.write(原始客户端数据); // first write, normal is tls client hello
		写入器.releaseLock();
		return tcp套接켓;
	}

	// if the cf connect tcp socket have no incoming data, we retry to redirect ip
	async function 重试连接() {
		// 这里重试逻辑也应该遵循 SOCKS5 配置
		if (启用Socks && (启用SOCKS5全局反代 || 启用SOCKS5反代)) {
			tcp套接字 = await 连接并写入(远程地址, 远程端口, true);
		} else {
			// 移除 代理IP 的逻辑，直接连接到远程地址
			tcp套接字 = await 连接并写入(远程地址, 远程端口);
		}
		// no matter retry success or not, close websocket
		tcp套接字.closed.catch(error => {
			console.log('retry tcpSocket closed error', error);
		}).finally(() => {
			安全关闭WebSocket(webSocket);
		})
		远程套接字到WS(tcp套接字, webSocket, 传输响应头部, null, 日志记录);
	}

	let tcp套接字;
	// 调整这里的判断，确保只有在 `启用Socks` 为 true 且相关 SOCKS5 标志也为 true 时才尝试 SOCKS5 连接
	if (启用Socks && (启用SOCKS5反代 && 启用SOCKS5全局反代)) {
		tcp套接字 = await 连接并写入(远程地址, 远程端口, true);
	} else if (启用Socks && 启用SOCKS5反代) { // 如果只启用了反代但不是全局
		tcp套接字 = await 连接并写入(远程地址, 远程端口, true);
	} else {
		// 移除 代理IP 的逻辑，直接连接到远程地址
		tcp套接字 = await 连接并写入(远程地址, 远程端口);
	}

	// when remoteSocket is ready, pass to websocket
	// remote--> ws
	远程套接字到WS(tcp套接字, webSocket, 传输响应头部, 重试连接, 日志记录);
}

/**
 *
 * @param {import("@cloudflare/workers-types").WebSocket} webSocketServer
 * @param {string} earlyDataHeader for ws 0rtt
 * @param {(info: string)=> void} log for ws 0rtt
 */
function 创建可读WebSocket流(webSocket服务器, 早期数据头, 日志记录) {
	let 可读流取消 = false;
	const 流 = new ReadableStream({
		start(controller) {
			webSocket服务器.addEventListener('message', (event) => {
				if (可读流取消) {
					return;
				}
				const 消息 = event.data;
				controller.enqueue(消息);
			});

			// The event means that the client closed the client -> server stream.
			// However, the server -> client stream is still open until you call close() on the server side.
			// The WebSocket protocol says that a separate close message must be sent in each direction to fully close the socket.
			webSocket服务器.addEventListener('close', () => {
				// client send close, need close server
				// if stream is cancel, skip controller.close
				安全关闭WebSocket(webSocket服务器);
				if (可读流取消) {
					return;
				}
				controller.close();
			}
			);
			webSocket服务器.addEventListener('error', (err) => {
				日志记录('webSocketServer has error');
				controller.error(err);
			}
			);
			// for ws 0rtt
			const { earlyData, error } = base64转数组缓冲(早期数据头);
			if (error) {
				controller.error(error);
			} else if (earlyData) {
				controller.enqueue(earlyData);
			}
		},

		pull(controller) {
			// if ws can stop read if stream is full, we can implement backpressure
			// https://streams.spec.whatwg.org/#example-rs-push-backpressure
		},
		cancel(reason) {
			// 1. pipe WritableStream has error, this cancel will called, so ws handle server close into here
			// 2. if readableStream is cancel, all controller.close/enqueue need skip,
			// 3. but from testing controller.error still work even if readableStream is cancel
			if (可读流取消) {
				return;
			}
			日志记录(`ReadableStream was canceled, due to ${reason}`)
			可读流取消 = true;
			安全关闭WebSocket(webSocket服务器);
		}
	});

	return 流;

}

// https://xtls.github.io/development/protocols/vless.html
// https://github.com/zizifn/excalidraw-backup/blob/main/v2ray-protocol.excalidraw

/**
 *
 * @param { ArrayBuffer} vlessBuffer
 * @param {string} userID
 * @returns
 */
function 处理传输头部(
	传输缓冲,
	用户ID
) {
	if (传输缓冲.byteLength < 24) {
		return {
			hasError: true,
			message: 'invalid data',
		};
	}
	const 版本 = new Uint8Array(传输缓冲.slice(0, 1));
	let 是有效用户 = false;
	let 是UDP协议 = false;
	if (字符串化(new Uint8Array(传输缓冲.slice(1, 17))) === 用户ID) {
		是有效用户 = true;
	}
	if (!是有效用户) {
		return {
			hasError: true,
			message: 'invalid user',
		};
	}

	const 选项长度 = new Uint8Array(传输缓冲.slice(17, 18))[0];
	//skip opt for now

	const 命令 = new Uint8Array(
		传输缓冲.slice(18 + 选项长度, 18 + 选项长度 + 1)
	)[0];

	// 0x01 TCP
	// 0x02 UDP
	// 0x03 MUX
	if (命令 === 1) {
	} else if (命令 === 2) {
		是UDP协议 = true;
	} else {
		return {
			hasError: true,
			message: `command ${命令} is not support, command 01-tcp,02-udp,03-mux`,
		};
	}
	const 端口索引 = 18 + 选项长度 + 1;
	const 端口缓冲 = 传输缓冲.slice(端口索引, 端口索引 + 2);
	// port is big-Endian in raw data etc 80 == 0x005d
	const 远程端口 = new DataView(端口缓冲).getUint16(0);

	let 地址索引 = 端口索引 + 2;
	const 地址缓冲 = new Uint8Array(
		传输缓冲.slice(地址索引, 地址索引 + 1)
	);

	// 1--> ipv4  addressLength =4
	// 2--> domain name addressLength=addressBuffer[1]
	// 3--> ipv6  addressLength =16
	const 地址类型 = 地址缓冲[0];
	let 地址长度 = 0;
	let 地址值索引 = 地址索引 + 1;
	let 地址值 = '';
	switch (地址类型) {
		case 1:
			地址长度 = 4;
			地址值 = new Uint8Array(
				传输缓冲.slice(地址值索引, 地址值索引 + 地址长度)
			).join('.');
			break;
		case 2:
			地址长度 = new Uint8Array(
				传输缓冲.slice(地址值索引, 地址值索引 + 1)
			)[0];
			地址值索引 += 1;
			地址值 = new TextDecoder().decode(
				传输缓冲.slice(地址值索引, 地址值索引 + 地址长度)
			);
			break;
		case 3:
			地址长度 = 16;
			const 数据视图 = new DataView(
				传输缓冲.slice(地址值索引, 地址值索引 + 地址长度)
			);
			// 2001:0db8:85a3:0000:0000:8a2e:0370:7334
			const ipv6 = [];
			for (let i = 0; i < 8; i++) {
				ipv6.push(数据视图.getUint16(i * 2).toString(16));
			}
			地址值 = ipv6.join(':');
			// seems no need add [] for ipv6
			break;
		default:
			return {
				hasError: true,
				message: `invild  addressType is ${地址类型}`,
			};
	}
	if (!地址值) {
		return {
			hasError: true,
			message: `addressValue is empty, addressType is ${地址类型}`,
		};
	}

	return {
		hasError: false,
		addressRemote: 地址值,
		addressType: 地址类型,
		portRemote: 远程端口,
		rawDataIndex: 地址值索引 + 地址长度,
		vlessVersion: 版本,
		isUDP: 是UDP协议,
	};
}


/**
 *
 * @param {import("@cloudflare/workers-types").Socket} remoteSocket
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket
 * @param {ArrayBuffer} vlessResponseHeader
 * @param {(() => Promise<void>) | null} retry
 * @param {*} log
 */
async function 远程套接字到WS(远程套接字, webSocket, 传输响应头部, 重试, 日志记录) {
	// remote--> ws
	let 远程块计数 = 0;
	let 块列表 = [];
	/** @type {ArrayBuffer | null} */
	let 传输头部 = 传输响应头部;
	let 有传入数据 = false; // check if remoteSocket has incoming data
	await 远程套接字.readable
		.pipeTo(
			new WritableStream({
				start() {
				},
				/**
				 *
				 * @param {Uint8Array} chunk
				 * @param {*} controller
				 */
				async write(chunk, controller) {
					有传入数据 = true;
					// remoteChunkCount++;
					if (webSocket.readyState !== WS_就绪状态_打开) {
						controller.error(
							'webSocket.readyState is not open, maybe close'
						);
					}
					if (传输头部) {
						webSocket.send(await new Blob([传输头部, chunk]).arrayBuffer());
						传输头部 = null;
					} else {
						// seems no need rate limit this, CF seems fix this??..
						// if (remoteChunkCount > 20000) {
						// 	// cf one package is 4096 byte(4kb),  4096 * 20000 = 80M
						// 	await delay(1);
						// }
						webSocket.send(chunk);
					}
				},
				close() {
					日志记录(`remoteConnection!.readable is close with hasIncomingData is ${有传入数据}`);
					// safeCloseWebSocket(webSocket); // no need server close websocket frist for some case will casue HTTP ERR_CONTENT_LENGTH_MISMATCH issue, client will send close event anyway.
				},
				abort(reason) {
					console.error(`remoteConnection!.readable abort`, reason);
				},
			})
		)
		.catch((error) => {
			console.error(
				`远程套接字到WS has exception `,
				error.stack || error
			);
			安全关闭WebSocket(webSocket);
		});

	// seems is cf connect socket have error,
	// 1. Socket.closed will have error
	// 2. Socket.readable will be close without any data coming
	if (有传入数据 === false && 重试) {
		日志记录(`retry`)
		重试();
	}
}

/**
 *
 * @param {string} base64Str
 * @returns
 */
function base64转数组缓冲(base64Str) {
	if (!base64Str) {
		return { error: null };
	}
	try {
		// go use modified Base64 for URL rfc4648 which js atob not support
		base64Str = base64Str.replace(/-/g, '+').replace(/_/g, '/');
		const decode = atob(base64Str);
		const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
		return { earlyData: arryBuffer.buffer, error: null };
	} catch (error) {
		return { error };
	}
}

/**
 * This is not real UUID validation
 * @param {string} uuid
 */
function 验证UUID有效性(uuid) {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(uuid);
}

const WS_就绪状态_打开 = 1;
const WS_就绪状态_关闭中 = 2;
/**
 * Normally, WebSocket will not has exceptions when close.
 * @param {import("@cloudflare/workers-types").WebSocket} socket
 */
function 安全关闭WebSocket(socket) {
	try {
		if (socket.readyState === WS_就绪状态_打开 || socket.readyState === WS_就绪状态_关闭中) {
			socket.close();
		}
	} catch (error) {
		console.error('safeCloseWebSocket error', error);
	}
}

const 字节到十六进制 = [];
for (let i = 0; i < 256; ++i) {
	字节到十六进制.push((i + 256).toString(16).slice(1));
}
function 不安全字符串化(arr, offset = 0) {
	return (字节到十六进制[arr[offset + 0]] + 字节到十六进制[arr[offset + 1]] + 字节到十六进制[arr[offset + 2]] + 字节到十六进制[arr[offset + 3]] + "-" + 字节到十六进制[arr[offset + 4]] + 字节到十六进制[arr[offset + 5]] + "-" + 字节到十六进制[arr[offset + 6]] + 字节到十六进制[arr[offset + 7]] + "-" + 字节到十六进制[arr[offset + 8]] + 字节到十六进制[arr[offset + 9]] + "-" + 字节到十六进制[arr[offset + 10]] + 字节到十六进制[arr[offset + 11]] + 字节到十六进制[arr[offset + 12]] + 字节到十六进制[arr[offset + 13]] + 字节到十六进制[arr[offset + 14]] + 字节到十六进制[arr[offset + 15]]).toLowerCase();
}
function 字符串化(arr, offset = 0) {
	const uuid = 不安全字符串化(arr, offset);
	if (!验证UUID有效性(uuid)) {
		throw TypeError("Stringified UUID is invalid");
	}
	return uuid;
}

/**
 *
 * @param {ArrayBuffer} udpChunk
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket
 * @param {ArrayBuffer} vlessResponseHeader
 * @param {(string)=> void} log
 */
async function 处理DNS查询(udpChunk, webSocket, 传输响应头部, 日志记录) {
	// no matter which DNS server client send, we alwasy use hard code one.
	// beacsue someof DNS server is not support DNS over TCP
	try {
		const dns服务器 = '8.8.4.4'; // change to 1.1.1.1 after cf fix connect own ip bug
		const dns端口 = 53;
		/** @type {ArrayBuffer | null} */
		let 传输头部 = 传输响应头部;
		/** @type {import("@cloudflare/workers-types").Socket} */
		const tcp套接字 = connect({
			hostname: dns服务器,
			port: dns端口,
		});

		日志记录(`connected to ${dns服务器}:${dns端口}`);
		const 写入器 = tcp套接字.writable.getWriter();
		await 写入器.write(udpChunk);
		写入器.releaseLock();
		await tcp套接字.readable.pipeTo(new WritableStream({
			async write(chunk) {
				if (webSocket.readyState === WS_就绪状态_打开) {
					if (传输头部) {
						webSocket.send(await new Blob([传输头部, chunk]).arrayBuffer());
						传输头部 = null;
					} else {
						webSocket.send(chunk);
					}
				}
			},
			close() {
				日志记录(`dns server(${dns服务器}) tcp is close`);
			},
			abort(reason) {
				console.error(`dns server(${dns服务器}) tcp is abort`, reason);
			},
		}));
	} catch (error) {
		console.error(
			`处理DNS查询 have exception, error: ${error.message}`
		);
	}
}

/**
 *
 * @param {number} addressType
 * @param {string} addressRemote
 * @param {number} portRemote
 * @param {function} log The logging function.
 */
async function socks5连接(地址类型, 远程地址, 远程端口, 日志记录) {
	let username, password, hostname, port;
	if (我的SOCKS5账号) {
		try {
			const parsed = 解析Socks5地址(我的SOCKS5账号);
			username = parsed.username;
			password = parsed.password;
			hostname = parsed.hostname;
			port = parsed.port;
		} catch (err) {
			日志记录(`Error parsing SOCKS5_ADDRESS: ${err.toString()}`);
			return;
		}
	} else {
		// Fallback to existing socks5地址 if 我的SOCKS5账号 is not set
		({ username, password, hostname, port } = 解析后Socks5地址);
	}


	// Connect to the SOCKS server
	const socket = connect({
		hostname,
		port,
	});

	// Request head format (Worker -> Socks Server):
	// +----+----------+----------+
	// |VER | NMETHODS | METHODS  |
	// +----+----------+----------+
	// | 1  |    1     | 1 to 255 |
	// +----+----------+----------+

	// https://en.wikipedia.org/wiki/SOCKS#SOCKS5
	// For METHODS:
	// 0x00 NO AUTHENTICATION REQUIRED
	// 0x02 USERNAME/PASSWORD https://datatracker.ietf.org/doc/html/rfc1929
	const socks问候 = new Uint8Array([5, 2, 0, 2]);

	const 写入器 = socket.writable.getWriter();

	await 写入器.write(socks问候);
	日志记录('sent socks greeting');

	const 读取器 = socket.readable.getReader();
	const 编码器 = new TextEncoder();
	let res = (await 读取器.read()).value;
	// Response format (Socks Server -> Worker):
	// +----+--------+
	// |VER | METHOD |
	// +----+--------+
	// | 1  |   1    |
	// +----+--------+
	if (res[0] !== 0x05) {
		日志记录(`socks server version error: ${res[0]} expected: 5`);
		return;
	}
	if (res[1] === 0xff) {
		日志记录("no acceptable methods");
		return;
	}

	// if return 0x0502
	if (res[1] === 0x02) {
		日志记录("socks server needs auth");
		if (!username || !password) {
			日志记录("please provide username/password");
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
		res = (await 读取器.read()).value;
		// expected 0x0100
		if (res[0] !== 0x01 || res[1] !== 0x00) {
			日志记录("fail to auth socks server");
			return;
		}
	}

	// Request data format (Worker -> Socks Server):
	// +----+-----+-------+------+----------+----------+
	// |VER | CMD |  RSV  | ATYP | DST.ADDR | DST.PORT |
	// +----+-----+-------+------+----------+----------+
	// | 1  |  1  | X'00' |  1   | Variable |    2     |
	// +----+-----+-------+------+----------+----------+
	// ATYP: address type of following address
	// 0x01: IPv4 address
	// 0x03: Domain name
	// 0x04: IPv6 address
	// DST.ADDR: desired destination address
	// DST.PORT: desired destination port in network octet order

	// addressType
	// 1--> ipv4  addressLength =4
	// 2--> domain name
	// 3--> ipv6  addressLength =16
	let 目标地址;	// DSTADDR = ATYP + DST.ADDR
	switch (地址类型) {
		case 1:
			目标地址 = new Uint8Array(
				[1, ...远程地址.split('.').map(Number)]
			);
			break;
		case 2:
			目标地址 = new Uint8Array(
				[3, 远程地址.length, ...编码器.encode(远程地址)]
			);
			break;
		case 3:
			目标地址 = new Uint8Array(
				[4, ...远程地址.split(':').flatMap(x => [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2), 16)])]
			);
			break;
		default:
			日志记录(`invild  addressType is ${地址类型}`);
			return;
	}
	const socks请求 = new Uint8Array([5, 1, 0, ...目标地址, 远程端口 >> 8, 远程端口 & 0xff]);
	await 写入器.write(socks请求);
	日志记录('sent socks request');

	res = (await 读取器.read()).value;
	// Response format (Socks Server -> Worker):
	//  +----+-----+-------+------+----------+----------+
	// |VER | REP |  RSV  | ATYP | BND.ADDR | BND.PORT |
	// +----+-----+-------+------+----------+----------+
	// | 1  |  1  | X'00' |  1   | Variable |    2     |
	// +----+-----+-------+------+----------+----------+
	if (res[1] === 0x00) {
		日志记录("socks connection opened");
	} else {
		日志记录("fail to open socks connection");
		return;
	}
	写入器.releaseLock();
	读取器.releaseLock();
	return socket;
}


/**
 *
 * @param {string} address
 */
function 解析Socks5地址(address) {
	let [latter, former] = address.split("@").reverse();
	let username, password, hostname, port;
	if (former) {
		const formers = former.split(":");
		if (formers.length !== 2) {
			throw new Error('Invalid SOCKS address format');
		}
		[username, password] = formers;
	}
	const latters = latter.split(":");
	port = Number(latters.pop());
	if (isNaN(port)) {
		throw new Error('Invalid SOCKS address format');
	}
	hostname = latters.join(":");
	const regex = /^\[.*\]$/;
	if (hostname.includes(":") && !regex.test(hostname)) {
		throw new Error('Invalid SOCKS address format');
	}
	return {
		username,
		password,
		hostname,
		port,
	}
}

/**
 * Helper function to read environment variables with default values.
 * @param {string} varName The name of the environment variable.
 * @param {any} defaultValue The default value if the environment variable is not set.
 * @param {any} env The environment object.
 * @returns {any} The value of the environment variable or the default value.
 */
function 读取环境变量(varName, defaultValue, env) {
    if (env && typeof env[varName] !== 'undefined' && env[varName] !== '') { // Added env[varName] !== '' check
        // Attempt to parse boolean strings
        if (typeof defaultValue === 'boolean') {
            const envValue = String(env[varName]).toLowerCase();
            if (envValue === 'true') {
                return true;
            } else if (envValue === 'false') {
                return false;
            }
        }
        return env[varName];
    }
    return defaultValue;
}


/**
 *
 * @param {string} userID
 * @param {string | null} hostName
 * @returns {string}
 */
function 获取配置(userID, hostName) {
	let 转码 = 'vl', 转码2 = 'ess', 符号 = '://';
	const 协议 = 转码 + 转码2;
	const vlessMain =
	`${协议}` +
	`${符号}${userID}@${hostName}:443`+
	`?encryption=none&security=tls&sni=${hostName}&fp=randomized&type=ws&host=${hostName}&path=%2F%3Fed%3D2048#${hostName}`;

	return `
################################################################
v2ray
---------------------------------------------------------------
${vlessMain}
---------------------------------------------------------------
################################################################
clash-meta
---------------------------------------------------------------
- type: ${协议}
  name: ${hostName}
  server: ${hostName}
  port: 443
  uuid: ${userID}
  network: ws
  tls: true
  udp: false
  sni: ${hostName}
  client-fingerprint: chrome
  ws-opts:
    path: "/?ed=2048"
    headers:
      host: ${hostName}
---------------------------------------------------------------
################################################################
`;
}
