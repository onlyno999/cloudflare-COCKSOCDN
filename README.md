```

// ====================================================================
// Cloudflare Worker: VL over WebSocket + SOCKS5
// --------------------------------------------------------------------
// 环境变量 (Vars) 说明：
//   UUID        必填，VL 用户的 UUID
//   ID          可选，订阅路径 (默认 123456)
//   SOCKS5_ADDRESS	可选 user:pass@127.0.0.1:1080 作为 SOCKS5_TXT_URL 加载失败时的备用。
//   SOCKS5_CONNECT_TIMEOUT = 5000; // SOCKS5 连接超时 (毫秒) 可选，SOCKS5 地址列表 TXT 文件的 URL，//https://example.com/socks5_list.txt
//   SOCKS5_ENABLE 可选，true|false，true启用SOCKS5反代，false不启用 (默认 true)
//   SOCKS5_GLOBAL 可选，true|false，true启用SOCKS5全局反代，false仅在直连失败时尝试 (默认 true)
//   隐藏        可选，true|false，true 时订阅接口只返回嘲讽语.
//   私钥        可选，用于 WS 连接认证的私钥
//   私钥开关    可选，true|false，是否启用私钥认证
//   嘲讽语      可选，隐藏订阅时返回的嘲讽语
//   我的节点名字  可选，订阅中节点的默认名称
//   使用说明 变量 选填 SOCKS5_TXT_URL 需要提供远程.txt格式文件。
//      SOCKS5_ADDRESS  无账号无密码:123456:1234直接填写IP加端口
//       SOCKS5_ADDRESS   有账号的，严格按照账号密码。user:pass@127.0.0.1:1080
//    可以设置单个帐号，多账号请用txt远程，每一行一个账号。
// ====================================================================


```


如果使用ct8，无需任何优选，只需要默认的域名就行。使用优选有可能适得其反。
