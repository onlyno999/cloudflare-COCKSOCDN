// version base on commit 58686d5d125194d34a1137913b3a64ddcf55872f, time is 2024-11-27 09:26:02 UTC.
// @ts-ignore
import { connect } from 'cloudflare:sockets';

// How to generate your own UUID:
// [Windows] Press "Win + R", input cmd and run:  Powershell -NoExit -Command "[guid]::NewGuid()"
let userID = 'd342d11e-d424-4583-b36e-524ab1f0afa4'; // 用户ID

let proxyIP = ''; // 代理IP

// The user name and password do not contain special characters
// Setting the address will ignore proxyIP
// Example:  user:pass@host:port  or  host:port
let socks5Address = ''; // SOCKS5地址

// 新增SOCKS5相关配置
let enableSocks5Proxy = true; // 选择是否启用SOCKS5反代功能，true启用，false不启用，可以通过环境变量SOCKS5_ENABLE控制
let enableSocks5GlobalProxy = true; // 选择是否启用SOCKS5全局反代，启用后所有访问都是S5的落地，可以通过环境变量SOCKS5_GLOBAL控制
let mySocks5Account = ''; // 格式'账号:密码@地址:端口'，可以通过环境变量SOCKS5_ADDRESS控制

// 新增订阅隐藏配置
let hideSubscription = false; // 开启 true ━ 关闭false
let tauntMessage = "哎呀你找到了我，但是我就是不给你看，气不气，嘿嘿嘿"; // 嘲讽消息

if (!isValidUUID(userID)) {
	throw new Error('uuid is not valid'); // UUID无效
}

let parsedSocks5Address = {}; // 解析后的SOCKS5地址
let enableSocks = false; // 启用SOCKS

export default {
	/**
	 * @param {import("@cloudflare/workers-types").Request} request
	 * @param {{UUID: string, PROXYIP: string, SOCKS5: string, SOCKS5_ENABLE: string, SOCKS5_GLOBAL: string, HIDE_SUB: string}} env
	 * @param {import("@cloudflare/workers-types").ExecutionContext} ctx
	 * @returns {Promise<Response>}
	 */
	async fetch(request, env, ctx) {
		try {
			userID = env.UUID || userID; // 用户ID
			proxyIP = env.PROXYIP || proxyIP; // 代理IP

			// 从环境变量获取SOCKS5配置
			mySocks5Account = env.SOCKS5_ADDRESS || mySocks5Account; // 我的SOCKS5账号
			enableSocks5Proxy = env.SOCKS5_ENABLE ? (env.SOCKS5_ENABLE.toLowerCase() === 'true') : enableSocks5Proxy; // 启用SOCKS5代理
			enableSocks5GlobalProxy = env.SOCKS5_GLOBAL ? (env.SOCKS5_GLOBAL.toLowerCase() === 'true') : enableSocks5GlobalProxy; // 启用SOCKS5全局代理

			// 如果启用了SOCKS5反代，则使用我的SOCKS5账号
			socks5Address = enableSocks5Proxy ? mySocks5Account : ''; // SOCKS5地址

			if (socks5Address) {
				try {
					parsedSocks5Address = socks5AddressParser(socks5Address); // 解析SOCKS5地址
					enableSocks = true; // 启用SOCKS
				} catch (err) {
  			/** @type {Error} */ let e = err;
					console.log(e.toString());
					enableSocks = false; // 启用SOCKS
				}
			}

			// 从环境变量获取订阅隐藏配置
			hideSubscription = env.HIDE_SUB ? (env.HIDE_SUB.toLowerCase() === 'true') : hideSubscription; // 隐藏订阅


			const upgradeHeader = request.headers.get('Upgrade'); // 升级头
			if (!upgradeHeader || upgradeHeader !== 'websocket') {
				const url = new URL(request.url); // 请求URL
				switch (url.pathname) {
					case '/':
						return new Response(JSON.stringify(request.cf), { status: 200 });
					case `/${userID}`: {
						if (hideSubscription) {
							return new Response(tauntMessage, {
								status: 200,
								headers: {
									"Content-Type": "text/plain;charset=utf-8",
								}
							});
						}
						const vlessConfig = getVLESSConfig(userID, request.headers.get('Host')); // VLESS配置
						return new Response(`${vlessConfig}`, {
							status: 200,
							headers: {
								"Content-Type": "text/plain;charset=utf-8",
							}
						});
					}
					default:
						return new Response('Not found', { status: 404 }); // 未找到
				}
			} else {
				return await vlessOverWSHandler(request); // 处理VLESS over WebSocket
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
async function vlessOverWSHandler(request) {

	/** @type {import("@cloudflare/workers-types").WebSocket[]} */
	// @ts-ignore
	const webSocketPair = new WebSocketPair(); // WebSocket对
	const [client, webSocket] = Object.values(webSocketPair); // 客户端和WebSocket

	webSocket.accept();

	let address = ''; // 地址
	let portWithRandomLog = ''; // 带随机日志的端口
	const log = (/** @type {string} */ info, /** @type {string | undefined} */ event) => {
		console.log(`[${address}:${portWithRandomLog}] ${info}`, event || '');
	};
	const earlyDataHeader = request.headers.get('sec-websocket-protocol') || ''; // 早期数据头

	const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log); // 可读WebSocket流

	/** @type {{ value: import("@cloudflare/workers-types").Socket | null}}*/
	let remoteSocketWapper = {
		value: null,
	}; // 远程Socket包装器
	let isDns = false; // 是DNS

	// ws --> remote
	readableWebSocketStream.pipeTo(new WritableStream({
		async write(chunk, controller) {
			if (isDns) {
				return await handleDNSQuery(chunk, webSocket, null, log); // 处理DNS查询
			}
			if (remoteSocketWapper.value) {
				const writer = remoteSocketWapper.value.writable.getWriter()
				await writer.write(chunk);
				writer.releaseLock();
				return;
			}

			const {
				hasError, // 是否有错误
				message, // 消息
				addressType, // 地址类型
				portRemote = 443, // 远程端口
				addressRemote = '', // 远程地址
				rawDataIndex, // 原始数据索引
				vlessVersion = new Uint8Array([0, 0]), // VLESS版本
				isUDP, // 是UDP
			} = processVlessHeader(chunk, userID); // 处理VLESS头部
			address = addressRemote; // 地址
			portWithRandomLog = `${portRemote}--${Math.random()} ${isUDP ? 'udp ' : 'tcp '
				} `; // 带随机日志的端口
			if (hasError) {
				// controller.error(message);
				throw new Error(message); // cf seems has bug, controller.error will not end stream
				// webSocket.close(1000, message);
				return;
			}
			// if UDP but port not DNS port, close it
			if (isUDP) {
				if (portRemote === 53) {
					isDns = true;
				} else {
					// controller.error('UDP proxy only enable for DNS which is port 53');
					throw new Error('UDP proxy only enable for DNS which is port 53'); // cf seems has bug, controller.error will not end stream
					return;
				}
			}
			// ["version", "附加信息长度 N"]
			const vlessResponseHeader = new Uint8Array([vlessVersion[0], 0]); // VLESS响应头部
			const rawClientData = chunk.slice(rawDataIndex); // 原始客户端数据

			if (isDns) {
				return handleDNSQuery(rawClientData, webSocket, vlessResponseHeader, log); // 处理DNS查询
			}
			handleTCPOutBound(remoteSocketWapper, addressType, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader, log); // 处理TCP出站
		},
		close() {
			log(`readableWebSocketStream is close`); // 可读WebSocket流关闭
		},
		abort(reason) {
			log(`readableWebSocketStream is abort`, JSON.stringify(reason)); // 可读WebSocket流中止
		},
	})).catch((err) => {
		log('readableWebSocketStream pipeTo error', err); // 可读WebSocket流管道错误
	});

	return new Response(null, {
		status: 101,
		// @ts-ignore
		webSocket: client,
	});
}

/**
 * Handles outbound TCP connections.
 *
 * @param {any} remoteSocket // 远程Socket
 * @param {number} addressType The remote address type to connect to. // 远程地址类型
 * @param {string} addressRemote The remote address to connect to. // 远程地址
 * @param {number} portRemote The remote port to connect to. // 远程端口
 * @param {Uint8Array} rawClientData The raw client data to write. // 原始客户端数据
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket The WebSocket to pass the remote socket to. // WebSocket
 * @param {Uint8Array} vlessResponseHeader The VLESS response header. // VLESS响应头部
 * @param {function} log The logging function. // 日志函数
 * @returns {Promise<void>} The remote socket.
 */
async function handleTCPOutBound(remoteSocket, addressType, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader, log,) {
	async function connectAndWrite(address, port, socks = false) {
		/** @type {import("@cloudflare/workers-types").Socket} */
		const tcpSocket = socks ? await socks5Connect(addressType, address, port, log) // SOCKS5连接
			: connect({
				hostname: address,
				port: port,
			});
		remoteSocket.value = tcpSocket; // 远程Socket值
		log(`connected to ${address}:${port}`); // 连接到
		const writer = tcpSocket.writable.getWriter(); // 写入器
		await writer.write(rawClientData); // first write, normal is tls client hello
		writer.releaseLock();
		return tcpSocket;
	}

	// if the cf connect tcp socket have no incoming data, we retry to redirect ip
	async function retry() {
		if (enableSocks) {
			tcpSocket = await connectAndWrite(addressRemote, portRemote, true);
		} else {
			tcpSocket = await connectAndWrite(proxyIP || addressRemote, portRemote);
		}
		// no matter retry success or not, close websocket
		tcpSocket.closed.catch(error => {
			console.log('retry tcpSocket closed error', error); // 重试tcpSocket关闭错误
		}).finally(() => {
			safeCloseWebSocket(webSocket); // 安全关闭WebSocket
		})
		remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, null, log); // 远程Socket到WS
	}

	let tcpSocket; // TCP Socket
	if (enableSocks5GlobalProxy && enableSocks) { // 如果启用了SOCKS5全局反代，且SOCKS5配置有效
		tcpSocket = await connectAndWrite(addressRemote, portRemote, true);
	} else {
		tcpSocket = await connectAndWrite(addressRemote, portRemote);
	}


	// when remoteSocket is ready, pass to websocket
	// remote--> ws
	remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, retry, log); // 远程Socket到WS
}

/**
 *
 * @param {import("@cloudflare/workers-types").WebSocket} webSocketServer // WebSocket服务器
 * @param {string} earlyDataHeader for ws 0rtt // 早期数据头部
 * @param {(info: string)=> void} log for ws 0rtt // 日志
 */
function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
	let readableStreamCancel = false; // 可读流取消
	const stream = new ReadableStream({
		start(controller) {
			webSocketServer.addEventListener('message', (event) => {
				if (readableStreamCancel) {
					return;
				}
				const message = event.data; // 消息
				controller.enqueue(message);
			});

			// The event means that the client closed the client -> server stream.
			// However, the server -> client stream is still open until you call close() on the server side.
			// The WebSocket protocol says that a separate close message must be sent in each direction to fully close the socket.
			webSocketServer.addEventListener('close', () => {
				// client send close, need close server
				// if stream is cancel, skip controller.close
				safeCloseWebSocket(webSocketServer); // 安全关闭WebSocket
				if (readableStreamCancel) {
					return;
				}
				controller.close();
			}
			);
			webSocketServer.addEventListener('error', (err) => {
				log('webSocketServer has error'); // WebSocket服务器有错误
				controller.error(err);
			}
			);
			// for ws 0rtt
			const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader); // 早期数据，错误
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
			if (readableStreamCancel) {
				return;
			}
			log(`ReadableStream was canceled, due to ${reason}`) // 可读流已取消
			readableStreamCancel = true; // 可读流取消
			safeCloseWebSocket(webSocketServer); // 安全关闭WebSocket
		}
	});

	return stream;

}

// https://xtls.github.io/development/protocols/vless.html
// https://github.com/zizifn/excalidraw-backup/blob/main/v2ray-protocol.excalidraw

/**
 *
 * @param { ArrayBuffer} vlessBuffer // VLESS缓冲区
 * @param {string} userID // 用户ID
 * @returns
 */
function processVlessHeader(
	vlessBuffer,
	userID
) {
	if (vlessBuffer.byteLength < 24) {
		return {
			hasError: true, // 是否有错误
			message: 'invalid data', // 无效数据
		};
	}
	const version = new Uint8Array(vlessBuffer.slice(0, 1)); // 版本
	let isValidUser = false; // 是否是有效用户
	let isUDP = false; // 是UDP
	if (stringify(new Uint8Array(vlessBuffer.slice(1, 17))) === userID) {
		isValidUser = true;
	}
	if (!isValidUser) {
		return {
			hasError: true, // 是否有错误
			message: 'invalid user', // 无效用户
		};
	}

	const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0]; // 选项长度
	//skip opt for now

	const command = new Uint8Array(
		vlessBuffer.slice(18 + optLength, 18 + optLength + 1)
	)[0]; // 命令

	// 0x01 TCP
	// 0x02 UDP
	// 0x03 MUX
	if (command === 1) {
	} else if (command === 2) {
		isUDP = true;
	} else {
		return {
			hasError: true, // 是否有错误
			message: `command ${command} is not support, command 01-tcp,02-udp,03-mux`, // 不支持的命令
		};
	}
	const portIndex = 18 + optLength + 1; // 端口索引
	const portBuffer = vlessBuffer.slice(portIndex, portIndex + 2); // 端口缓冲区
	// port is big-Endian in raw data etc 80 == 0x005d
	const portRemote = new DataView(portBuffer).getUint16(0); // 远程端口

	let addressIndex = portIndex + 2; // 地址索引
	const addressBuffer = new Uint8Array(
		vlessBuffer.slice(addressIndex, addressIndex + 1)
	); // 地址缓冲区

	// 1--> ipv4  addressLength =4
	// 2--> domain name addressLength=addressBuffer[1]
	// 3--> ipv6  addressLength =16
	const addressType = addressBuffer[0]; // 地址类型
	let addressLength = 0; // 地址长度
	let addressValueIndex = addressIndex + 1; // 地址值索引
	let addressValue = ''; // 地址值
	switch (addressType) {
		case 1:
			addressLength = 4;
			addressValue = new Uint8Array(
				vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
			).join('.');
			break;
		case 2:
			addressLength = new Uint8Array(
				vlessBuffer.slice(addressValueIndex, addressValueIndex + 1)
			)[0];
			addressValueIndex += 1;
			addressValue = new TextDecoder().decode(
				vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
			);
			break;
		case 3:
			addressLength = 16;
			const dataView = new DataView(
				vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
			);
			// 2001:0db8:85a3:0000:0000:8a2e:0370:7334
			const ipv6 = []; // IPv6
			for (let i = 0; i < 8; i++) {
				ipv6.push(dataView.getUint16(i * 2).toString(16));
			}
			addressValue = ipv6.join(':');
			// seems no need add [] for ipv6
			break;
		default:
			return {
				hasError: true, // 是否有错误
				message: `invild  addressType is ${addressType}`, // 无效的地址类型
			};
	}
	if (!addressValue) {
		return {
			hasError: true, // 是否有错误
			message: `addressValue is empty, addressType is ${addressType}`, // 地址值为空
		};
	}

	return {
		hasError: false, // 是否有错误
		addressRemote: addressValue, // 远程地址
		addressType, // 地址类型
		portRemote, // 远程端口
		rawDataIndex: addressValueIndex + addressLength, // 原始数据索引
		vlessVersion: version, // VLESS版本
		isUDP, // 是UDP
	};
}


/**
 *
 * @param {import("@cloudflare/workers-types").Socket} remoteSocket // 远程Socket
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket // WebSocket
 * @param {ArrayBuffer} vlessResponseHeader // VLESS响应头部
 * @param {(() => Promise<void>) | null} retry // 重试
 * @param {*} log // 日志
 */
async function remoteSocketToWS(remoteSocket, webSocket, vlessResponseHeader, retry, log) {
	// remote--> ws
	let remoteChunkCount = 0; // 远程块计数
	let chunks = []; // 块
	/** @type {ArrayBuffer | null} */
	let vlessHeader = vlessResponseHeader; // VLESS头部
	let hasIncomingData = false; // check if remoteSocket has incoming data // 是否有传入数据
	await remoteSocket.readable
		.pipeTo(
			new WritableStream({
				start() {
				},
				/**
				 *
				 * @param {Uint8Array} chunk // 块
				 * @param {*} controller // 控制器
				 */
				async write(chunk, controller) {
					hasIncomingData = true; // 是否有传入数据
					// remoteChunkCount++;
					if (webSocket.readyState !== WS_READY_STATE_OPEN) {
						controller.error(
							'webSocket.readyState is not open, maybe close' // WebSocket状态未打开
						);
					}
					if (vlessHeader) {
						webSocket.send(await new Blob([vlessHeader, chunk]).arrayBuffer());
						vlessHeader = null;
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
					log(`remoteConnection!.readable is close with hasIncomingData is ${hasIncomingData}`); // 远程连接可读流关闭
					// safeCloseWebSocket(webSocket); // no need server close websocket frist for some case will casue HTTP ERR_CONTENT_LENGTH_MISMATCH issue, client will send close event anyway.
				},
				abort(reason) {
					console.error(`remoteConnection!.readable abort`, reason); // 远程连接可读流中止
				},
			})
		)
		.catch((error) => {
			console.error(
				`remoteSocketToWS has exception `,
				error.stack || error
			); // remoteSocketToWS有异常
			safeCloseWebSocket(webSocket); // 安全关闭WebSocket
		});

	// seems is cf connect socket have error,
	// 1. Socket.closed will have error
	// 2. Socket.readable will be close without any data coming
	if (hasIncomingData === false && retry) {
		log(`retry`) // 重试
		retry();
	}
}

/**
 *
 * @param {string} base64Str // Base64字符串
 * @returns
 */
function base64ToArrayBuffer(base64Str) {
	if (!base64Str) {
		return { error: null };
	}
	try {
		// go use modified Base64 for URL rfc4648 which js atob not support
		base64Str = base64Str.replace(/-/g, '+').replace(/_/g, '/');
		const decode = atob(base64Str); // 解码
		const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0)); // 数组缓冲区
		return { earlyData: arryBuffer.buffer, error: null }; // 早期数据，错误
	} catch (error) {
		return { error };
	}
}

/**
 * This is not real UUID validation
 * @param {string} uuid // UUID
 */
function isValidUUID(uuid) {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i; // UUID正则表达式
	return uuidRegex.test(uuid);
}

const WS_READY_STATE_OPEN = 1; // WebSocket打开状态
const WS_READY_STATE_CLOSING = 2; // WebSocket关闭中状态
/**
 * Normally, WebSocket will not has exceptions when close.
 * @param {import("@cloudflare/workers-types").WebSocket} socket // Socket
 */
function safeCloseWebSocket(socket) {
	try {
		if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
			socket.close();
		}
	} catch (error) {
		console.error('safeCloseWebSocket error', error); // 安全关闭WebSocket错误
	}
}

const byteToHex = []; // 字节到十六进制
for (let i = 0; i < 256; ++i) {
	byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
	return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
function stringify(arr, offset = 0) {
	const uuid = unsafeStringify(arr, offset); // UUID
	if (!isValidUUID(uuid)) {
		throw TypeError("Stringified UUID is invalid"); // 字符串化的UUID无效
	}
	return uuid;
}

/**
 *
 * @param {ArrayBuffer} udpChunk // UDP块
 * @param {import("@cloudflare/workers-types").WebSocket} webSocket // WebSocket
 * @param {ArrayBuffer} vlessResponseHeader // VLESS响应头部
 * @param {(string)=> void} log // 日志
 */
async function handleDNSQuery(udpChunk, webSocket, vlessResponseHeader, log) {
	// no matter which DNS server client send, we alwasy use hard code one.
	// beacsue someof DNS server is not support DNS over TCP
	try {
		const dnsServer = '8.8.4.4'; // change to 1.1.1.1 after cf fix connect own ip bug // DNS服务器
		const dnsPort = 53; // DNS端口
		/** @type {ArrayBuffer | null} */
		let vlessHeader = vlessResponseHeader; // VLESS头部
		/** @type {import("@cloudflare/workers-types").Socket} */
		const tcpSocket = connect({
			hostname: dnsServer,
			port: dnsPort,
		});

		log(`connected to ${dnsServer}:${dnsPort}`); // 连接到
		const writer = tcpSocket.writable.getWriter(); // 写入器
		await writer.write(udpChunk);
		writer.releaseLock();
		await tcpSocket.readable.pipeTo(new WritableStream({
			async write(chunk) {
				if (webSocket.readyState === WS_READY_STATE_OPEN) {
					if (vlessHeader) {
						webSocket.send(await new Blob([vlessHeader, chunk]).arrayBuffer());
						vlessHeader = null;
					} else {
						webSocket.send(chunk);
					}
				}
			},
			close() {
				log(`dns server(${dnsServer}) tcp is close`); // DNS服务器TCP关闭
			},
			abort(reason) {
				console.error(`dns server(${dnsServer}) tcp is abort`, reason); // DNS服务器TCP中止
			},
		}));
	} catch (error) {
		console.error(
			`handleDNSQuery have exception, error: ${error.message}` // 处理DNS查询有异常
		);
	}
}

/**
 *
 * @param {number} addressType // 地址类型
 * @param {string} addressRemote // 远程地址
 * @param {number} portRemote // 远程端口
 * @param {function} log The logging function. // 日志函数
 */
async function socks5Connect(addressType, addressRemote, portRemote, log) {
	const { username, password, hostname, port } = parsedSocks5Address; // 用户名，密码，主机名，端口
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
	const socksGreeting = new Uint8Array([5, 2, 0, 2]); // SOCKS问候

	const writer = socket.writable.getWriter(); // 写入器

	await writer.write(socksGreeting);
	log('sent socks greeting'); // 已发送SOCKS问候

	const reader = socket.readable.getReader(); // 读取器
	const encoder = new TextEncoder(); // 编码器
	let res = (await reader.read()).value; // 结果
	// Response format (Socks Server -> Worker):
	// +----+--------+
	// |VER | METHOD |
	// +----+--------+
	// | 1  |   1    |
	// +----+--------+
	if (res[0] !== 0x05) {
		log(`socks server version error: ${res[0]} expected: 5`); // SOCKS服务器版本错误
		return;
	}
	if (res[1] === 0xff) {
		log("no acceptable methods"); // 没有可接受的方法
		return;
	}

	// if return 0x0502
	if (res[1] === 0x02) {
		log("socks server needs auth"); // SOCKS服务器需要认证
		if (!username || !password) {
			log("please provide username/password"); // 请提供用户名/密码
			return;
		}
		// +----+------+----------+------+----------+
		// |VER | ULEN |  UNAME   | PLEN |  PASSWD  |
		// +----+------+----------+------+----------+
		// | 1  |  1   | 1 to 255 |  1   | 1 to 255 |
		// +----+------+----------+------+----------+
		const authRequest = new Uint8Array([
			1,
			username.length,
			...encoder.encode(username),
			password.length,
			...encoder.encode(password)
		]); // 认证请求
		await writer.write(authRequest);
		res = (await reader.read()).value; // 结果
		// expected 0x0100
		if (res[0] !== 0x01 || res[1] !== 0x00) {
			log("fail to auth socks server"); // 认证SOCKS服务器失败
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
	let DSTADDR;	// DSTADDR = ATYP + DST.ADDR // 目标地址
	switch (addressType) {
		case 1:
			DSTADDR = new Uint8Array(
				[1, ...addressRemote.split('.').map(Number)]
			);
			break;
		case 2:
			DSTADDR = new Uint8Array(
				[3, addressRemote.length, ...encoder.encode(addressRemote)]
			);
			break;
		case 3:
			DSTADDR = new Uint8Array(
				[4, ...addressRemote.split(':').flatMap(x => [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2), 16)])]
			);
			break;
		default:
			log(`invild  addressType is ${addressType}`); // 无效的地址类型
			return;
	}
	const socksRequest = new Uint8Array([5, 1, 0, ...DSTADDR, portRemote >> 8, portRemote & 0xff]); // SOCKS请求
	await writer.write(socksRequest);
	log('sent socks request'); // 已发送SOCKS请求

	res = (await reader.read()).value; // 结果
	// Response format (Socks Server -> Worker):
	//  +----+-----+-------+------+----------+----------+
	// |VER | REP |  RSV  | ATYP | BND.ADDR | BND.PORT |
	// +----+-----+-------+------+----------+----------+
	// | 1  |  1  | X'00' |  1   | Variable |    2     |
	// +----+-----+-------+------+----------+----------+
	if (res[1] === 0x00) {
		log("socks connection opened"); // SOCKS连接已打开
	} else {
		log("fail to open socks connection"); // 打开SOCKS连接失败
		return;
	}
	writer.releaseLock();
	reader.releaseLock();
	return socket;
}


/**
 *
 * @param {string} address // 地址
 */
function socks5AddressParser(address) {
	let [latter, former] = address.split("@").reverse(); // 后者，前者
	let username, password, hostname, port; // 用户名，密码，主机名，端口
	if (former) {
		const formers = former.split(":"); // 前者
		if (formers.length !== 2) {
			throw new Error('Invalid SOCKS address format'); // 无效的SOCKS地址格式
		}
		[username, password] = formers;
	}
	const latters = latter.split(":"); // 后者
	port = Number(latters.pop()); // 端口
	if (isNaN(port)) {
		throw new Error('Invalid SOCKS address format'); // 无效的SOCKS地址格式
	}
	hostname = latters.join(":"); // 主机名
	const regex = /^\[.*\]$/; // 正则表达式
	if (hostname.includes(":") && !regex.test(hostname)) {
		throw new Error('Invalid SOCKS address format'); // 无效的SOCKS地址格式
	}
	return {
		username, // 用户名
		password, // 密码
		hostname, // 主机名
		port, // 端口
	}
}

/**
 *
 * @param {string} userID // 用户ID
 * @param {string | null} hostName // 主机名
 * @returns {string}
 */
function getVLESSConfig(userID, hostName) {
	let 转码 = 'vl';
	let 转码2 = 'ess';
	let 符号 = '://';
	const protocol = `${转码}${转码2}`; // 组合 "vless"
	const vlessMain =
	`${protocol}` +
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
- type: vless
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
