const PLUGIN_NAME = 'touch-docs-atlas'
const FEATURE_ID = 'docs-atlas'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }

const ACTION_COPY_PRIMARY = 'copy-primary'
const ACTION_COPY_SECONDARY = 'copy-secondary'
const ACTION_COPY_JSON = 'copy-json'

const GLOBAL_PREFIXES = [
  'docs-atlas',
  'devref',
  'atlas',
  '参考手册',
  '速查',
]

// ── 1. HTTP Status Codes (1xx–5xx, RFC 9110 / WebDAV / Operational) ──
const HTTP_STATUS_CODES = [
  // 1xx Informational
  { code: 100, name: 'Continue', cls: '1xx', zh: '继续发送请求体', desc: 'Initial request headers received; client should send request body.' },
  { code: 101, name: 'Switching Protocols', cls: '1xx', zh: '切换协议', desc: 'Server agrees to upgrade protocol (e.g., HTTP/1.1 → WebSocket).' },
  { code: 102, name: 'Processing', cls: '1xx', zh: '处理中 (WebDAV)', desc: 'Server received request and is still processing; prevents client timeout.' },
  { code: 103, name: 'Early Hints', cls: '1xx', zh: '提前提示预加载', desc: 'Returns Link preload headers while server prepares final response.' },
  // 2xx Success
  { code: 200, name: 'OK', cls: '2xx', zh: '请求成功', desc: 'Standard success response; meaning depends on HTTP method.' },
  { code: 201, name: 'Created', cls: '2xx', zh: '已创建资源', desc: 'Request succeeded and created one or more new resources (check Location header).' },
  { code: 202, name: 'Accepted', cls: '2xx', zh: '已接受异步处理', desc: 'Request accepted for async processing; completion not guaranteed yet.' },
  { code: 203, name: 'Non-Authoritative Information', cls: '2xx', zh: '非权威转换信息', desc: 'Payload was modified by a transforming proxy from origin 200 response.' },
  { code: 204, name: 'No Content', cls: '2xx', zh: '成功但无响应体', desc: 'Succeeded with no response body (common for DELETE or PUT updates).' },
  { code: 205, name: 'Reset Content', cls: '2xx', zh: '重置文档视图', desc: 'Tells client to reset the document view (e.g., clear form state).' },
  { code: 206, name: 'Partial Content', cls: '2xx', zh: '部分内容 (Range)', desc: 'Delivers requested byte range(s) for resumable downloads or streaming.' },
  { code: 207, name: 'Multi-Status', cls: '2xx', zh: '多状态响应 (WebDAV)', desc: 'Conveys status for multiple independent sub-operations.' },
  { code: 208, name: 'Already Reported', cls: '2xx', zh: '已报告 (WebDAV)', desc: 'Avoids repeatedly enumerating internal DAV binding members.' },
  { code: 226, name: 'IM Used', cls: '2xx', zh: '已应用实例操作', desc: 'Server fulfilled GET with delta/instance-manipulation representation.' },
  // 3xx Redirection
  { code: 300, name: 'Multiple Choices', cls: '3xx', zh: '多种选择', desc: 'Request has multiple possible representations; client may choose one.' },
  { code: 301, name: 'Moved Permanently', cls: '3xx', zh: '永久重定向', desc: 'Resource permanently moved to Location URI (cacheable; POST may become GET).' },
  { code: 302, name: 'Found', cls: '3xx', zh: '临时重定向', desc: 'Resource temporarily at Location URI; legacy browsers may switch POST→GET.' },
  { code: 303, name: 'See Other', cls: '3xx', zh: '查看其他地址 (GET)', desc: 'Redirect client to Location using GET (standard Post/Redirect/Get pattern).' },
  { code: 304, name: 'Not Modified', cls: '3xx', zh: '资源未修改 (缓存命中)', desc: 'Conditional GET/HEAD matched ETag/Last-Modified; reuse cached copy.' },
  { code: 307, name: 'Temporary Redirect', cls: '3xx', zh: '临时重定向 (保留方法)', desc: 'Temporary redirect that strictly preserves original HTTP method & body.' },
  { code: 308, name: 'Permanent Redirect', cls: '3xx', zh: '永久重定向 (保留方法)', desc: 'Permanent redirect that strictly preserves original HTTP method & body.' },
  // 4xx Client Error
  { code: 400, name: 'Bad Request', cls: '4xx', zh: '错误请求', desc: 'Malformed syntax, invalid parameters, or failed request validation.' },
  { code: 401, name: 'Unauthorized', cls: '4xx', zh: '未认证 (需登录)', desc: 'Authentication is required or credentials failed (check WWW-Authenticate).' },
  { code: 402, name: 'Payment Required', cls: '4xx', zh: '需要付费/额度不足', desc: 'Reserved for digital payment / quota billing gates.' },
  { code: 403, name: 'Forbidden', cls: '4xx', zh: '禁止访问 (无权限)', desc: 'Server understood identity but refuses authorization to this resource.' },
  { code: 404, name: 'Not Found', cls: '4xx', zh: '资源不存在', desc: 'Origin server did not find a current representation for the target URI.' },
  { code: 405, name: 'Method Not Allowed', cls: '4xx', zh: '方法不允许', desc: 'Target resource does not support this HTTP method (check Allow header).' },
  { code: 406, name: 'Not Acceptable', cls: '4xx', zh: '无法满足 Accept 协商', desc: 'Cannot produce response matching Accept / Accept-Language headers.' },
  { code: 407, name: 'Proxy Authentication Required', cls: '4xx', zh: '需要代理认证', desc: 'Client must authenticate with the proxy first (Proxy-Authenticate).' },
  { code: 408, name: 'Request Timeout', cls: '4xx', zh: '请求超时', desc: 'Server timed out waiting for client to finish sending the request.' },
  { code: 409, name: 'Conflict', cls: '4xx', zh: '资源状态冲突', desc: 'Request conflicts with current resource state (e.g., optimistic lock/duplicate).' },
  { code: 410, name: 'Gone', cls: '4xx', zh: '资源已永久移除', desc: 'Resource is intentionally and permanently gone; clients should purge links.' },
  { code: 411, name: 'Length Required', cls: '4xx', zh: '缺少 Content-Length', desc: 'Server refuses request without a defined Content-Length header.' },
  { code: 412, name: 'Precondition Failed', cls: '4xx', zh: '前置条件失败', desc: 'Conditional header (If-Match / If-Unmodified-Since) evaluated false.' },
  { code: 413, name: 'Content Too Large', cls: '4xx', zh: '请求体过大', desc: 'Request payload exceeds server size limit (formerly Payload Too Large).' },
  { code: 414, name: 'URI Too Long', cls: '4xx', zh: '请求 URI 过长', desc: 'Request target URI exceeds maximum length server is willing to parse.' },
  { code: 415, name: 'Unsupported Media Type', cls: '4xx', zh: '不支持的媒体类型', desc: 'Payload Content-Type or Content-Encoding is unsupported by endpoint.' },
  { code: 416, name: 'Range Not Satisfiable', cls: '4xx', zh: '请求范围无效', desc: 'Requested byte Range cannot be satisfied by resource length.' },
  { code: 417, name: 'Expectation Failed', cls: '4xx', zh: 'Expect 请求头失败', desc: 'Server cannot meet requirements of Expect request header.' },
  { code: 418, name: 'I\'m a teapot', cls: '4xx', zh: '我是茶壶 (RFC 2324)', desc: 'HTCPCP April Fools easter egg preserved in RFC 9110.' },
  { code: 421, name: 'Misdirected Request', cls: '4xx', zh: '误导向请求', desc: 'Request directed at server unable to produce response (HTTP/2 coalescing).' },
  { code: 422, name: 'Unprocessable Content', cls: '4xx', zh: '语义校验失败', desc: 'Well-formed payload (e.g., valid JSON) but semantic/field validation failed.' },
  { code: 423, name: 'Locked', cls: '4xx', zh: '资源已锁定 (WebDAV)', desc: 'Target resource is currently locked.' },
  { code: 424, name: 'Failed Dependency', cls: '4xx', zh: '依赖操作失败 (WebDAV)', desc: 'Failed because a previous dependent action failed.' },
  { code: 425, name: 'Too Early', cls: '4xx', zh: '拒绝重放早期数据', desc: 'Server unwilling to risk replaying TLS 1.3 0-RTT early data.' },
  { code: 426, name: 'Upgrade Required', cls: '4xx', zh: '需要升级协议', desc: 'Client must switch to protocol listed in Upgrade header (e.g., TLS).' },
  { code: 428, name: 'Precondition Required', cls: '4xx', zh: '要求条件请求', desc: 'Origin requires conditional headers (e.g., If-Match) to prevent lost updates.' },
  { code: 429, name: 'Too Many Requests', cls: '4xx', zh: '请求过于频繁 (限流)', desc: 'Rate limit exceeded; honor Retry-After header and exponential backoff.' },
  { code: 431, name: 'Request Header Fields Too Large', cls: '4xx', zh: '请求头字段过大', desc: 'Single header or total headers exceed server limits (often oversized cookies).' },
  { code: 451, name: 'Unavailable For Legal Reasons', cls: '4xx', zh: '因法律原因不可用', desc: 'Access denied due to legal/regulatory restriction.' },
  // 5xx Server Error
  { code: 500, name: 'Internal Server Error', cls: '5xx', zh: '服务器内部错误', desc: 'Unexpected server exception prevented fulfilling the request.' },
  { code: 501, name: 'Not Implemented', cls: '5xx', zh: '功能未实现', desc: 'Server does not support the functionality/method required.' },
  { code: 502, name: 'Bad Gateway', cls: '5xx', zh: '错误网关', desc: 'Proxy/gateway received an invalid response from upstream server.' },
  { code: 503, name: 'Service Unavailable', cls: '5xx', zh: '服务暂不可用', desc: 'Server overloaded or in maintenance; retryable (check Retry-After).' },
  { code: 504, name: 'Gateway Timeout', cls: '5xx', zh: '网关超时', desc: 'Proxy/gateway timed out waiting for upstream server response.' },
  { code: 505, name: 'HTTP Version Not Supported', cls: '5xx', zh: '不支持的 HTTP 版本', desc: 'Server does not support the HTTP protocol version used.' },
  { code: 506, name: 'Variant Also Negotiates', cls: '5xx', zh: '内容协商循环', desc: 'Internal configuration error in transparent content negotiation.' },
  { code: 507, name: 'Insufficient Storage', cls: '5xx', zh: '存储空间不足 (WebDAV)', desc: 'Server lacks storage space to store representation.' },
  { code: 508, name: 'Loop Detected', cls: '5xx', zh: '检测到无限循环 (WebDAV)', desc: 'Server terminated operation due to infinite loop.' },
  { code: 510, name: 'Not Extended', cls: '5xx', zh: '需要进一步扩展', desc: 'Further HTTP extensions required to fulfill request.' },
  { code: 511, name: 'Network Authentication Required', cls: '5xx', zh: '需要网络认证 (Captive Portal)', desc: 'Client must authenticate to gain network access (e.g., Wi-Fi portal).' },
]

// ── 2. Common chmod Presets ──
const CHMOD_PRESETS = [
  { octal: '755', title: 'Executable / Directory Standard', zh: '可执行文件与目录标准权限' },
  { octal: '644', title: 'Regular File Default', zh: '普通文件默认权限' },
  { octal: '600', title: 'Private Secret / SSH Key', zh: '私密文件 / SSH 私钥 (id_ed25519)' },
  { octal: '700', title: 'Private Directory (~/.ssh)', zh: '私密目录 (~/.ssh)' },
  { octal: '400', title: 'Read-Only Private File', zh: '仅所有者只读（私钥/证书）' },
  { octal: '664', title: 'Team Shared File', zh: '同组可读写普通文件' },
  { octal: '775', title: 'Team Shared Directory', zh: '同组可读写执行目录' },
  { octal: '1777', title: 'Sticky Temp Dir (/tmp)', zh: 'Sticky 位公共临时目录 (/tmp)' },
  { octal: '4755', title: 'SetUID Executable', zh: 'SetUID 可执行文件（慎用）' },
  { octal: '2750', title: 'SetGID Group Directory', zh: 'SetGID 组继承目录' },
]

// ── 3. Curated MIME Types (48 entries) ──
const MIME_TYPES = [
  { mime: 'application/json', exts: ['.json', '.map'], cat: 'data', desc: 'JSON data interchange (UTF-8 by default, RFC 8259)' },
  { mime: 'application/x-ndjson', exts: ['.ndjson', '.jsonl'], cat: 'data', desc: 'Newline-delimited JSON streaming records' },
  { mime: 'application/problem+json', exts: ['.json'], cat: 'api', desc: 'RFC 9457 structured HTTP API error details' },
  { mime: 'application/ld+json', exts: ['.jsonld'], cat: 'data', desc: 'JSON-LD linked structured data' },
  { mime: 'application/graphql+json', exts: ['.graphql'], cat: 'api', desc: 'GraphQL over HTTP response payload' },
  { mime: 'text/event-stream', exts: ['.sse'], cat: 'api', desc: 'Server-Sent Events (SSE) unidirectional stream' },
  { mime: 'text/html', exts: ['.html', '.htm'], cat: 'web', desc: 'HTML document (add ; charset=utf-8)' },
  { mime: 'text/css', exts: ['.css'], cat: 'web', desc: 'Cascading Style Sheets' },
  { mime: 'text/javascript', exts: ['.js', '.mjs', '.cjs'], cat: 'web', desc: 'JavaScript module/script (RFC 9239 canonical)' },
  { mime: 'application/typescript', exts: ['.ts', '.mts'], cat: 'code', desc: 'TypeScript source file' },
  { mime: 'application/wasm', exts: ['.wasm'], cat: 'web', desc: 'WebAssembly binary module (required for streaming compile)' },
  { mime: 'text/plain', exts: ['.txt', '.log'], cat: 'text', desc: 'Plain unformatted text' },
  { mime: 'text/markdown', exts: ['.md', '.markdown'], cat: 'text', desc: 'Markdown document (RFC 7763)' },
  { mime: 'text/csv', exts: ['.csv'], cat: 'data', desc: 'Comma-separated values table (RFC 4180)' },
  { mime: 'text/tab-separated-values', exts: ['.tsv'], cat: 'data', desc: 'Tab-separated values table' },
  { mime: 'application/xml', exts: ['.xml'], cat: 'data', desc: 'XML structured document' },
  { mime: 'application/yaml', exts: ['.yaml', '.yml'], cat: 'data', desc: 'YAML configuration/data (RFC 9512)' },
  { mime: 'application/toml', exts: ['.toml'], cat: 'data', desc: 'TOML configuration file' },
  { mime: 'application/x-www-form-urlencoded', exts: [], cat: 'api', desc: 'URL-encoded HTML form key=value body' },
  { mime: 'multipart/form-data', exts: [], cat: 'api', desc: 'Multipart form body for file uploads' },
  { mime: 'application/octet-stream', exts: ['.bin', '.exe'], cat: 'binary', desc: 'Arbitrary binary byte stream / forced download' },
  { mime: 'application/pdf', exts: ['.pdf'], cat: 'doc', desc: 'Portable Document Format' },
  { mime: 'application/zip', exts: ['.zip'], cat: 'archive', desc: 'ZIP compressed archive' },
  { mime: 'application/gzip', exts: ['.gz', '.tgz'], cat: 'archive', desc: 'GZIP compressed stream/archive' },
  { mime: 'application/x-tar', exts: ['.tar'], cat: 'archive', desc: 'POSIX tar archive' },
  { mime: 'application/zstd', exts: ['.zst'], cat: 'archive', desc: 'Zstandard compressed payload' },
  { mime: 'image/png', exts: ['.png'], cat: 'image', desc: 'Portable Network Graphics (lossless + alpha)' },
  { mime: 'image/jpeg', exts: ['.jpg', '.jpeg'], cat: 'image', desc: 'JPEG photographic image' },
  { mime: 'image/webp', exts: ['.webp'], cat: 'image', desc: 'WebP modern image (lossy/lossless/alpha)' },
  { mime: 'image/avif', exts: ['.avif'], cat: 'image', desc: 'AV1 Image File Format (high compression)' },
  { mime: 'image/svg+xml', exts: ['.svg'], cat: 'image', desc: 'Scalable Vector Graphics XML' },
  { mime: 'image/gif', exts: ['.gif'], cat: 'image', desc: 'Graphics Interchange Format' },
  { mime: 'image/x-icon', exts: ['.ico'], cat: 'image', desc: 'Favicon / Windows icon' },
  { mime: 'font/woff2', exts: ['.woff2'], cat: 'font', desc: 'WOFF2 compressed web font (recommended)' },
  { mime: 'font/woff', exts: ['.woff'], cat: 'font', desc: 'Web Open Font Format 1.0' },
  { mime: 'font/ttf', exts: ['.ttf'], cat: 'font', desc: 'TrueType Font' },
  { mime: 'font/otf', exts: ['.otf'], cat: 'font', desc: 'OpenType Font' },
  { mime: 'audio/mpeg', exts: ['.mp3'], cat: 'media', desc: 'MP3 audio stream' },
  { mime: 'audio/ogg', exts: ['.ogg', '.oga'], cat: 'media', desc: 'Ogg Vorbis / Opus audio' },
  { mime: 'audio/wav', exts: ['.wav'], cat: 'media', desc: 'Waveform PCM audio' },
  { mime: 'audio/webm', exts: ['.weba'], cat: 'media', desc: 'WebM audio' },
  { mime: 'video/mp4', exts: ['.mp4', '.m4v'], cat: 'media', desc: 'MPEG-4 video container' },
  { mime: 'video/webm', exts: ['.webm'], cat: 'media', desc: 'WebM VP8/VP9/AV1 video' },
  { mime: 'application/vnd.apple.mpegurl', exts: ['.m3u8'], cat: 'media', desc: 'HLS streaming playlist' },
  { mime: 'application/protobuf', exts: ['.pb', '.proto'], cat: 'api', desc: 'Protocol Buffers binary wire format' },
  { mime: 'application/grpc', exts: [], cat: 'api', desc: 'gRPC HTTP/2 binary framing' },
  { mime: 'application/vnd.sqlite3', exts: ['.sqlite', '.db'], cat: 'data', desc: 'SQLite 3 database file' },
  { mime: 'application/manifest+json', exts: ['.webmanifest'], cat: 'web', desc: 'PWA Web App Manifest' },
]

// ── 4. ASCII Control Names & ANSI SGR Escape Codes ──
const ASCII_CONTROL_NAMES = [
  ['NUL', '\\0', 'Null character'],
  ['SOH', '', 'Start of Heading'],
  ['STX', '', 'Start of Text'],
  ['ETX', '^C', 'End of Text (SIGINT / Ctrl+C)'],
  ['EOT', '^D', 'End of Transmission (EOF / Ctrl+D)'],
  ['ENQ', '', 'Enquiry'],
  ['ACK', '', 'Acknowledge'],
  ['BEL', '\\a', 'Bell / Alert'],
  ['BS', '\\b', 'Backspace'],
  ['TAB', '\\t', 'Horizontal Tab (HT)'],
  ['LF', '\\n', 'Line Feed (Unix newline)'],
  ['VT', '\\v', 'Vertical Tab'],
  ['FF', '\\f', 'Form Feed (page break)'],
  ['CR', '\\r', 'Carriage Return (CRLF with LF)'],
  ['SO', '', 'Shift Out'],
  ['SI', '', 'Shift In'],
  ['DLE', '', 'Data Link Escape'],
  ['DC1', '^Q', 'Device Control 1 (XON)'],
  ['DC2', '', 'Device Control 2'],
  ['DC3', '^S', 'Device Control 3 (XOFF)'],
  ['DC4', '', 'Device Control 4'],
  ['NAK', '', 'Negative Acknowledge'],
  ['SYN', '', 'Synchronous Idle'],
  ['ETB', '', 'End of Transmission Block'],
  ['CAN', '', 'Cancel'],
  ['EM', '', 'End of Medium'],
  ['SUB', '^Z', 'Substitute (SIGTSTP / Ctrl+Z)'],
  ['ESC', '\\x1b', 'Escape (ANSI CSI prefix \\x1b[)'],
  ['FS', '', 'File Separator'],
  ['GS', '', 'Group Separator'],
  ['RS', '', 'Record Separator'],
  ['US', '', 'Unit Separator'],
]

const ANSI_CODES = [
  { code: '0', seq: '\\x1b[0m', uni: '\\u001b[0m', name: 'Reset / Normal', cat: 'style', desc: 'Reset all styles and foreground/background colors' },
  { code: '1', seq: '\\x1b[1m', uni: '\\u001b[1m', name: 'Bold / Bright', cat: 'style', desc: 'Increased font weight or intensity' },
  { code: '2', seq: '\\x1b[2m', uni: '\\u001b[2m', name: 'Dim / Faint', cat: 'style', desc: 'Decreased intensity' },
  { code: '3', seq: '\\x1b[3m', uni: '\\u001b[3m', name: 'Italic', cat: 'style', desc: 'Italicized text' },
  { code: '4', seq: '\\x1b[4m', uni: '\\u001b[4m', name: 'Underline', cat: 'style', desc: 'Underlined text' },
  { code: '7', seq: '\\x1b[7m', uni: '\\u001b[7m', name: 'Inverse / Reverse', cat: 'style', desc: 'Swap foreground and background colors' },
  { code: '9', seq: '\\x1b[9m', uni: '\\u001b[9m', name: 'Strikethrough', cat: 'style', desc: 'Crossed-out text' },
  { code: '30', seq: '\\x1b[30m', uni: '\\u001b[30m', name: 'FG Black', cat: 'fg', desc: 'Standard foreground black' },
  { code: '31', seq: '\\x1b[31m', uni: '\\u001b[31m', name: 'FG Red', cat: 'fg', desc: 'Standard foreground red (errors)' },
  { code: '32', seq: '\\x1b[32m', uni: '\\u001b[32m', name: 'FG Green', cat: 'fg', desc: 'Standard foreground green (success)' },
  { code: '33', seq: '\\x1b[33m', uni: '\\u001b[33m', name: 'FG Yellow', cat: 'fg', desc: 'Standard foreground yellow (warnings)' },
  { code: '34', seq: '\\x1b[34m', uni: '\\u001b[34m', name: 'FG Blue', cat: 'fg', desc: 'Standard foreground blue (info)' },
  { code: '35', seq: '\\x1b[35m', uni: '\\u001b[35m', name: 'FG Magenta', cat: 'fg', desc: 'Standard foreground magenta' },
  { code: '36', seq: '\\x1b[36m', uni: '\\u001b[36m', name: 'FG Cyan', cat: 'fg', desc: 'Standard foreground cyan' },
  { code: '37', seq: '\\x1b[37m', uni: '\\u001b[37m', name: 'FG White', cat: 'fg', desc: 'Standard foreground white/light gray' },
  { code: '90', seq: '\\x1b[90m', uni: '\\u001b[90m', name: 'FG Bright Black (Gray)', cat: 'fg', desc: 'Bright black / muted gray foreground' },
  { code: '91', seq: '\\x1b[91m', uni: '\\u001b[91m', name: 'FG Bright Red', cat: 'fg', desc: 'Bright red foreground' },
  { code: '92', seq: '\\x1b[92m', uni: '\\u001b[92m', name: 'FG Bright Green', cat: 'fg', desc: 'Bright green foreground' },
  { code: '93', seq: '\\x1b[93m', uni: '\\u001b[93m', name: 'FG Bright Yellow', cat: 'fg', desc: 'Bright yellow foreground' },
  { code: '94', seq: '\\x1b[94m', uni: '\\u001b[94m', name: 'FG Bright Blue', cat: 'fg', desc: 'Bright blue foreground' },
  { code: '95', seq: '\\x1b[95m', uni: '\\u001b[95m', name: 'FG Bright Magenta', cat: 'fg', desc: 'Bright magenta foreground' },
  { code: '96', seq: '\\x1b[96m', uni: '\\u001b[96m', name: 'FG Bright Cyan', cat: 'fg', desc: 'Bright cyan foreground' },
  { code: '97', seq: '\\x1b[97m', uni: '\\u001b[97m', name: 'FG Bright White', cat: 'fg', desc: 'Bright white foreground' },
  { code: '40-47', seq: '\\x1b[41m', uni: '\\u001b[41m', name: 'BG Standard Colors (40–47)', cat: 'bg', desc: '40 Black, 41 Red, 42 Green, 43 Yellow, 44 Blue, 45 Magenta, 46 Cyan, 47 White' },
  { code: '100-107', seq: '\\x1b[100m', uni: '\\u001b[100m', name: 'BG Bright Colors (100–107)', cat: 'bg', desc: 'Bright background colors 100 (Gray) through 107 (Bright White)' },
  { code: '38;5;n', seq: '\\x1b[38;5;208m', uni: '\\u001b[38;5;208m', name: '256-Color Foreground', cat: 'color', desc: 'Set 256-color palette FG (0-255); use 48;5;n for BG' },
  { code: '38;2;r;g;b', seq: '\\x1b[38;2;56;189;248m', uni: '\\u001b[38;2;56;189;248m', name: 'TrueColor 24-bit RGB FG', cat: 'color', desc: 'Set 24-bit RGB foreground; use 48;2;r;g;b for BG' },
  { code: '2J', seq: '\\x1b[2J\\x1b[H', uni: '\\u001b[2J\\u001b[H', name: 'Clear Screen & Home Cursor', cat: 'cursor', desc: 'Erase entire display and move cursor to row 1, col 1' },
  { code: '2K', seq: '\\x1b[2K\\r', uni: '\\u001b[2K\\r', name: 'Clear Current Line', cat: 'cursor', desc: 'Erase entire current line and return carriage (progress bars)' },
  { code: '?25l', seq: '\\x1b[?25l', uni: '\\u001b[?25l', name: 'Hide Cursor (?25h to Show)', cat: 'cursor', desc: 'Hide terminal cursor during spinner/TUI render; restore with \\x1b[?25h' },
]

// ── 5. Curated Cheatsheets: Git, Docker, SQL, cURL, tmux (75 recipes) ──
const CHEATSHEETS = [
  // Git (18)
  { topic: 'git', id: 'git-rebase-i', title: 'Interactive Rebase Last N Commits', zh: '交互式变基合并/修改最近提交', cmd: 'git rebase -i HEAD~3', tags: ['rebase', 'squash', 'history', '变基'] },
  { topic: 'git', id: 'git-undo-soft', title: 'Undo Last Commit (Keep Staged Changes)', zh: '撤销最近一次提交并保留暂存', cmd: 'git reset --soft HEAD~1', tags: ['undo', 'reset', 'soft', '撤销'] },
  { topic: 'git', id: 'git-amend-no-edit', title: 'Amend Staged Changes Without Editing Message', zh: '追加暂存内容到上次提交', cmd: 'git commit --amend --no-edit', tags: ['amend', 'commit', '修改'] },
  { topic: 'git', id: 'git-stash-u', title: 'Stash Including Untracked Files With Note', zh: '暂存包含未跟踪文件的改动', cmd: 'git stash push -u -m "wip: note"', tags: ['stash', 'wip', '暂存'] },
  { topic: 'git', id: 'git-stash-pop', title: 'Apply & Drop Latest Stash', zh: '恢复并删除最近暂存', cmd: 'git stash pop', tags: ['stash', 'pop', '恢复'] },
  { topic: 'git', id: 'git-reflog', title: 'Recover Lost Commits via Reflog', zh: '通过 Reflog 找回丢失提交', cmd: 'git reflog -n 20', tags: ['reflog', 'recover', 'restore', '找回'] },
  { topic: 'git', id: 'git-cherry-pick', title: 'Cherry-Pick Specific Commit', zh: '挑选单个提交到当前分支', cmd: 'git cherry-pick <commit-sha>', tags: ['cherry-pick', 'commit', '挑选'] },
  { topic: 'git', id: 'git-worktree-add', title: 'Create Linked Worktree on New Branch', zh: '创建独立分支工作树', cmd: 'git worktree add -b feat/topic ../wt-topic origin/main', tags: ['worktree', 'branch', '工作树'] },
  { topic: 'git', id: 'git-worktree-rm', title: 'Remove Worktree & Prune Metadata', zh: '移除工作树并清理元数据', cmd: 'git worktree remove ../wt-topic && git worktree prune', tags: ['worktree', 'cleanup'] },
  { topic: 'git', id: 'git-log-graph', title: 'Compact Graph Commit History', zh: '图形化单行提交历史', cmd: 'git log --oneline --graph --decorate -n 25', tags: ['log', 'graph', 'history', '日志'] },
  { topic: 'git', id: 'git-diff-staged', title: 'Show Staged Diff Only', zh: '查看已暂存区差异', cmd: 'git diff --staged --stat', tags: ['diff', 'staged', 'cached', '差异'] },
  { topic: 'git', id: 'git-bisect', title: 'Binary Search Regression Commit', zh: '二分查找引入 Bug 的提交', cmd: 'git bisect start HEAD <good-sha>', tags: ['bisect', 'debug', 'regression', '二分'] },
  { topic: 'git', id: 'git-clean-dry', title: 'Preview Untracked Files Cleanup', zh: '预览清理未跟踪文件与目录', cmd: 'git clean -fdn', tags: ['clean', 'untracked', '清理'] },
  { topic: 'git', id: 'git-blame-w', title: 'Blame Ignoring Whitespace & Moves', zh: '忽略空白与代码移动的 Blame', cmd: 'git blame -w -C -C <file>', tags: ['blame', 'annotate', '归属'] },
  { topic: 'git', id: 'git-fixup', title: 'Create Fixup Commit & Autosquash', zh: '生成 fixup 并自动合并到目标提交', cmd: 'git commit --fixup=<sha> && git rebase -i --autosquash <sha>~1', tags: ['fixup', 'autosquash', 'rebase'] },
  { topic: 'git', id: 'git-prune-remote', title: 'Fetch & Prune Deleted Remote Branches', zh: '拉取并清理已删除远程分支引用', cmd: 'git fetch --all --prune', tags: ['fetch', 'prune', 'remote', '同步'] },
  { topic: 'git', id: 'git-tag-annotated', title: 'Create Annotated SemVer Tag', zh: '创建带注释的版本标签', cmd: 'git tag -a v1.0.0 -m "Release v1.0.0"', tags: ['tag', 'release', '标签'] },
  { topic: 'git', id: 'git-switch-track', title: 'Switch to Remote Tracking Branch', zh: '检出并跟踪远程分支', cmd: 'git switch -c feat/name --track origin/feat/name', tags: ['switch', 'checkout', 'branch', '分支'] },

  // Docker (15)
  { topic: 'docker', id: 'docker-run-it', title: 'Run Ephemeral Interactive Container', zh: '启动用完即删的交互式容器', cmd: 'docker run --rm -it alpine:3.20 sh', tags: ['run', 'interactive', 'shell', '容器'] },
  { topic: 'docker', id: 'docker-run-port-vol', title: 'Run Detached With Port & Bind Mount', zh: '后台运行并映射端口与本地目录', cmd: 'docker run -d --name app -p 8080:80 -v "$PWD:/app" -e NODE_ENV=production node:22-alpine', tags: ['run', 'port', 'volume', 'env'] },
  { topic: 'docker', id: 'docker-exec', title: 'Open Shell Inside Running Container', zh: '进入运行中容器的 Shell', cmd: 'docker exec -it <container> /bin/sh', tags: ['exec', 'shell', 'attach', '进入容器'] },
  { topic: 'docker', id: 'docker-logs', title: 'Follow Last 200 Log Lines With Timestamps', zh: '实时跟踪容器最新 200 行日志', cmd: 'docker logs -f --tail 200 -t <container>', tags: ['logs', 'tail', 'debug', '日志'] },
  { topic: 'docker', id: 'docker-buildx', title: 'Build Multi-Arch Image (linux/amd64,arm64)', zh: '构建多架构容器镜像', cmd: 'docker buildx build --platform linux/amd64,linux/arm64 -t org/app:1.0.0 .', tags: ['build', 'buildx', 'arm64', '构建'] },
  { topic: 'docker', id: 'docker-compose-up', title: 'Compose Rebuild & Start Detached', zh: 'Compose 重新构建并后台启动', cmd: 'docker compose up -d --build --remove-orphans', tags: ['compose', 'up', 'start'] },
  { topic: 'docker', id: 'docker-compose-logs', title: 'Follow Specific Compose Service Logs', zh: '查看指定 Compose 服务日志', cmd: 'docker compose logs -f --tail 100 api', tags: ['compose', 'logs'] },
  { topic: 'docker', id: 'docker-prune', title: 'Reclaim Unused Images, Containers & Build Cache', zh: '清理未使用的镜像、容器与构建缓存', cmd: 'docker system prune -af --volumes', tags: ['prune', 'clean', 'disk', '清理'] },
  { topic: 'docker', id: 'docker-inspect-ip', title: 'Inspect Container IP Address', zh: '获取容器内网 IP 地址', cmd: 'docker inspect -f "{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}" <container>', tags: ['inspect', 'ip', 'network'] },
  { topic: 'docker', id: 'docker-cp', title: 'Copy File From Container to Host', zh: '从容器拷贝文件到宿主机', cmd: 'docker cp <container>:/var/log/app.log ./app.log', tags: ['cp', 'copy', 'file'] },
  { topic: 'docker', id: 'docker-stats', title: 'Live CPU / Memory / IO Usage Table', zh: '实时监控容器 CPU 与内存占用', cmd: 'docker stats --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}"', tags: ['stats', 'memory', 'cpu', '监控'] },
  { topic: 'docker', id: 'docker-ps-format', title: 'Compact List of Containers & Ports', zh: '简洁展示所有容器状态与端口', cmd: 'docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"', tags: ['ps', 'list', 'ports'] },
  { topic: 'docker', id: 'docker-save-load', title: 'Export & Load Offline Image Tarball', zh: '离线导出与导入镜像压缩包', cmd: 'docker save org/app:1.0.0 | gzip > app.tar.gz && docker load < app.tar.gz', tags: ['save', 'load', 'offline', 'tar'] },
  { topic: 'docker', id: 'docker-network', title: 'Create Isolated Bridge Network', zh: '创建独立自定义桥接网络', cmd: 'docker network create --driver bridge app-net', tags: ['network', 'bridge'] },
  { topic: 'docker', id: 'docker-df', title: 'Inspect Docker Disk Usage Breakdown', zh: '查看 Docker 磁盘空间占用明细', cmd: 'docker system df -v', tags: ['disk', 'df', 'storage'] },

  // SQL (15)
  { topic: 'sql', id: 'sql-cte', title: 'Common Table Expression (WITH CTE)', zh: '公用表表达式 (CTE)', cmd: 'WITH active_users AS (SELECT id, email FROM users WHERE active = TRUE) SELECT * FROM active_users;', tags: ['cte', 'with', 'query'] },
  { topic: 'sql', id: 'sql-window-rn', title: 'Top-N Per Group via ROW_NUMBER()', zh: '窗口函数按分组取 Top-N', cmd: 'SELECT * FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY org_id ORDER BY created_at DESC) AS rn FROM events) t WHERE rn <= 3;', tags: ['window', 'row_number', 'topn', '窗口函数'] },
  { topic: 'sql', id: 'sql-window-lag', title: 'Row-to-Row Delta via LAG()', zh: '使用 LAG 计算相邻行差值', cmd: 'SELECT day, revenue, revenue - LAG(revenue) OVER (ORDER BY day) AS delta FROM daily_sales;', tags: ['window', 'lag', 'lead', 'analytics'] },
  { topic: 'sql', id: 'sql-window-sum', title: 'Running Cumulative Total', zh: '窗口函数计算累计求和', cmd: 'SELECT day, amount, SUM(amount) OVER (ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total FROM ledger;', tags: ['window', 'sum', 'running'] },
  { topic: 'sql', id: 'sql-upsert-pg', title: 'Upsert (PostgreSQL / SQLite ON CONFLICT)', zh: '冲突则更新 (Upsert)', cmd: 'INSERT INTO settings (key, value) VALUES (\'theme\', \'dark\') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;', tags: ['upsert', 'insert', 'conflict', 'postgres', 'sqlite'] },
  { topic: 'sql', id: 'sql-group-having', title: 'Aggregate Filter With GROUP BY + HAVING', zh: '分组聚合与 HAVING 过滤', cmd: 'SELECT user_id, COUNT(*) AS orders FROM orders GROUP BY user_id HAVING COUNT(*) >= 5 ORDER BY orders DESC;', tags: ['group', 'having', 'aggregate', '聚合'] },
  { topic: 'sql', id: 'sql-exists', title: 'Semi-Join With EXISTS (Null-Safe)', zh: '使用 EXISTS 进行空值安全半连接', cmd: 'SELECT u.* FROM users u WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.total > 100);', tags: ['exists', 'join', 'subquery'] },
  { topic: 'sql', id: 'sql-coalesce', title: 'Null Fallback With COALESCE & NULLIF', zh: '空值回退与防除零保护', cmd: 'SELECT COALESCE(nickname, email) AS label, total / NULLIF(count, 0) AS avg_price FROM stats;', tags: ['coalesce', 'nullif', 'null'] },
  { topic: 'sql', id: 'sql-case', title: 'Conditional Aggregation (CASE WHEN)', zh: '条件计数与透视聚合', cmd: 'SELECT COUNT(*) FILTER (WHERE status = \'paid\') AS paid_cnt, SUM(CASE WHEN status = \'refunded\' THEN amount ELSE 0 END) AS refunded_amt FROM invoices;', tags: ['case', 'filter', 'pivot'] },
  { topic: 'sql', id: 'sql-explain', title: 'Inspect Query Plan & Actual Timings', zh: '分析 SQL 执行计划与真实耗时', cmd: 'EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM events WHERE org_id = 42 ORDER BY created_at DESC LIMIT 20;', tags: ['explain', 'analyze', 'perf', '索引'] },
  { topic: 'sql', id: 'sql-index-concurrent', title: 'Create Partial Index Without Blocking Writes', zh: '无锁创建部分索引 (PostgreSQL)', cmd: 'CREATE INDEX CONCURRENTLY idx_orders_open ON orders (org_id, created_at DESC) WHERE status = \'open\';', tags: ['index', 'concurrently', 'postgres', '索引'] },
  { topic: 'sql', id: 'sql-keyset', title: 'Keyset (Cursor) Pagination', zh: '游标分页（避免深翻页 OFFSET 扫描）', cmd: 'SELECT id, created_at FROM logs WHERE (created_at, id) < (\'2026-11-23T12:00:00Z\', 9500) ORDER BY created_at DESC, id DESC LIMIT 50;', tags: ['pagination', 'cursor', 'keyset', '分页'] },
  { topic: 'sql', id: 'sql-jsonb', title: 'Query JSONB Field & Array Containment', zh: 'JSONB 字段提取与包含查询', cmd: 'SELECT id, meta->>\'region\' AS region FROM services WHERE meta @> \'{"tier":"prod"}\'::jsonb;', tags: ['json', 'jsonb', 'postgres'] },
  { topic: 'sql', id: 'sql-date-trunc', title: 'Bucket Timestamps by Day / Hour', zh: '按小时或天时间分桶统计', cmd: 'SELECT DATE_TRUNC(\'hour\', created_at) AS bucket, COUNT(*) FROM requests GROUP BY 1 ORDER BY 1 DESC;', tags: ['date', 'time', 'bucket', 'truncate'] },
  { topic: 'sql', id: 'sql-tx', title: 'Serializable / Explicit Transaction Block', zh: '显式事务提交与回滚', cmd: 'BEGIN; UPDATE accounts SET balance = balance - 100 WHERE id = 1; UPDATE accounts SET balance = balance + 100 WHERE id = 2; COMMIT;', tags: ['transaction', 'begin', 'commit', '事务'] },

  // cURL (14) — uses safe placeholders only
  { topic: 'curl', id: 'curl-post-json', title: 'POST JSON Payload With Headers', zh: '发送 JSON POST 请求', cmd: 'curl -fsSL -X POST https://api.example.com/v1/items -H "Content-Type: application/json" -d \'{"name":"demo"}\'', tags: ['post', 'json', 'http'] },
  { topic: 'curl', id: 'curl-auth-bearer', title: 'GET With Bearer Authorization Header', zh: '携带 Bearer 令牌发起请求', cmd: 'curl -fsSL https://api.example.com/v1/me -H "Authorization: Bearer <TOKEN>"', tags: ['auth', 'bearer', 'header'] },
  { topic: 'curl', id: 'curl-timing', title: 'Measure DNS / TLS / TTFB / Total Latency', zh: '测量 DNS/TLS/首字节与总耗时', cmd: 'curl -o /dev/null -s -w "dns:%{time_namelookup}s tls:%{time_appconnect}s ttfb:%{time_starttransfer}s total:%{time_total}s status:%{http_code}\\n" https://example.com', tags: ['timing', 'latency', 'ttfb', 'perf', '耗时'] },
  { topic: 'curl', id: 'curl-head', title: 'Fetch Response Headers Only', zh: '仅获取 HTTP 响应头 (HEAD)', cmd: 'curl -sSIL https://example.com', tags: ['head', 'headers', 'redirect'] },
  { topic: 'curl', id: 'curl-verbose', title: 'Verbose TLS & HTTP/2 Handshake Trace', zh: '详细输出 TLS 与请求/响应头', cmd: 'curl -v --http2 https://example.com', tags: ['verbose', 'debug', 'tls', 'http2'] },
  { topic: 'curl', id: 'curl-upload-form', title: 'Multipart Form File Upload', zh: 'Multipart 表单上传文件', cmd: 'curl -fsSL -X POST https://api.example.com/upload -F "file=@./report.pdf" -F "kind=invoice"', tags: ['upload', 'multipart', 'form'] },
  { topic: 'curl', id: 'curl-download-resume', title: 'Download With Redirect & Resume Support', zh: '跟随重定向并支持断点续传下载', cmd: 'curl -fL -C - -o archive.tar.gz https://example.com/archive.tar.gz', tags: ['download', 'resume', 'save'] },
  { topic: 'curl', id: 'curl-retry', title: 'Retry Transient Failures With Backoff', zh: '失败自动重试与超时控制', cmd: 'curl -fsSL --connect-timeout 5 --max-time 20 --retry 3 --retry-delay 2 --retry-all-errors https://api.example.com/health', tags: ['retry', 'timeout', 'resilience'] },
  { topic: 'curl', id: 'curl-resolve', title: 'Pin Custom IP for Hostname (SNI Preserved)', zh: '指定域名解析 IP 且保留 TLS SNI', cmd: 'curl -sSI --resolve example.com:443:127.0.0.1 https://example.com', tags: ['resolve', 'dns', 'sni', 'local'] },
  { topic: 'curl', id: 'curl-cookie', title: 'Save & Reuse Session Cookie Jar', zh: '保存并复用 Cookie 会话文件', cmd: 'curl -c cookies.txt -b cookies.txt -X POST https://example.com/session', tags: ['cookie', 'session'] },
  { topic: 'curl', id: 'curl-proxy', title: 'Send Request Through HTTP/SOCKS5 Proxy', zh: '通过代理发起请求', cmd: 'curl -fsSL -x socks5h://127.0.0.1:1080 https://example.com', tags: ['proxy', 'socks5'] },
  { topic: 'curl', id: 'curl-fail-body', title: 'Fail on 4xx/5xx While Still Printing Body', zh: '状态码失败返回非零退出码并保留响应体', cmd: 'curl --fail-with-body -sS https://api.example.com/v1/resource', tags: ['fail', 'ci', 'exit-code'] },
  { topic: 'curl', id: 'curl-unix-sock', title: 'Query Local Unix Domain Socket (e.g., Docker)', zh: '通过 Unix Socket 调试本地守护进程', cmd: 'curl --unix-socket /var/run/docker.sock http://localhost/version', tags: ['unix', 'socket', 'docker'] },
  { topic: 'curl', id: 'curl-jq', title: 'Fetch JSON & Filter With jq', zh: '获取 JSON 并用 jq 过滤字段', cmd: 'curl -fsSL https://api.example.com/v1/status | jq \'.services[] | {name, ok}\'', tags: ['json', 'jq', 'pipe'] },

  // tmux (13)
  { topic: 'tmux', id: 'tmux-new', title: 'Create Named Session', zh: '创建命名会话', cmd: 'tmux new-session -s dev', tags: ['session', 'new', '会话'] },
  { topic: 'tmux', id: 'tmux-attach', title: 'Attach or Create Named Session', zh: '接入会话（不存在则创建）', cmd: 'tmux new-session -A -s dev', tags: ['attach', 'session', '接入'] },
  { topic: 'tmux', id: 'tmux-ls', title: 'List Active Sessions', zh: '列出所有活跃会话', cmd: 'tmux ls', tags: ['list', 'sessions'] },
  { topic: 'tmux', id: 'tmux-detach', title: 'Detach Current Session (Keybinding)', zh: '分离当前会话（后台保持运行）', cmd: 'Ctrl+b d', tags: ['detach', 'key', '分离'] },
  { topic: 'tmux', id: 'tmux-split-v', title: 'Split Pane Left / Right (Vertical Divider)', zh: '左右分屏', cmd: 'Ctrl+b %  (or: tmux split-window -h)', tags: ['split', 'pane', 'horizontal', '分屏'] },
  { topic: 'tmux', id: 'tmux-split-h', title: 'Split Pane Top / Bottom (Horizontal Divider)', zh: '上下分屏', cmd: 'Ctrl+b "  (or: tmux split-window -v)', tags: ['split', 'pane', 'vertical', '分屏'] },
  { topic: 'tmux', id: 'tmux-zoom', title: 'Toggle Pane Fullscreen Zoom', zh: '放大/还原当前面板', cmd: 'Ctrl+b z', tags: ['zoom', 'pane', 'maximize', '最大化'] },
  { topic: 'tmux', id: 'tmux-window-new', title: 'Create / Rename / Switch Windows', zh: '新建、重命名与切换窗口', cmd: 'Ctrl+b c (new) · Ctrl+b , (rename) · Ctrl+b n/p (next/prev)', tags: ['window', 'tab', '窗口'] },
  { topic: 'tmux', id: 'tmux-resize', title: 'Resize Active Pane by Cells', zh: '调整当前面板尺寸', cmd: 'tmux resize-pane -R 10  (flags: -U/-D/-L/-R)', tags: ['resize', 'pane'] },
  { topic: 'tmux', id: 'tmux-copy-mode', title: 'Enter Scrollback & Search Copy Mode', zh: '进入滚屏回看与搜索模式', cmd: 'Ctrl+b [  (search: / or ?, exit: q)', tags: ['copy', 'scroll', 'search', '滚屏'] },
  { topic: 'tmux', id: 'tmux-sync-panes', title: 'Broadcast Keystrokes to All Panes in Window', zh: '同步输入到当前窗口所有面板', cmd: 'tmux setw synchronize-panes on', tags: ['sync', 'broadcast', 'multi'] },
  { topic: 'tmux', id: 'tmux-reload', title: 'Reload ~/.tmux.conf Live', zh: '热重载 tmux 配置文件', cmd: 'tmux source-file ~/.tmux.conf', tags: ['reload', 'config'] },
  { topic: 'tmux', id: 'tmux-kill', title: 'Kill Named Session', zh: '关闭指定会话', cmd: 'tmux kill-session -t dev', tags: ['kill', 'close', 'session'] },
]

let triggerGeneration = 0

function getPlugin() {
  return globalThis.plugin
}

function getClipboard() {
  return globalThis.clipboard
}

function getPermission() {
  return globalThis.permission
}

function getLogger() {
  return globalThis.logger
}

function getItemBuilder() {
  return globalThis.TuffItemBuilder
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string') {
    return query
  }
  return query?.text ?? ''
}

function stripGlobalPrefix(rawInput) {
  const trimmed = normalizeText(rawInput)
  if (!trimmed) {
    return ''
  }
  const lower = trimmed.toLowerCase()
  for (const prefix of GLOBAL_PREFIXES) {
    const lp = prefix.toLowerCase()
    if (lower === lp) {
      return ''
    }
    if (lower.startsWith(`${lp} `) || lower.startsWith(`${lp}:`)) {
      return trimmed.slice(prefix.length + 1).trim()
    }
  }
  return trimmed
}

function buildInfoItem({ id, featureId, title, subtitle, accessory }) {
  const Builder = getItemBuilder()
  const builder = new Builder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId })
  if (accessory) {
    builder.setAccessory(accessory)
  }
  return builder.build()
}

function buildActionItem({ id, featureId, title, subtitle, accessory, actions }) {
  const Builder = getItemBuilder()
  const defaultAction = actions[0]?.id
  const builder = new Builder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      ...(defaultAction ? { defaultAction } : {}),
    })
  if (accessory) {
    builder.setAccessory(accessory)
  }
  for (const action of actions) {
    builder.createAndAddAction(action.id, 'plugin', action.label, action.payload)
  }
  return builder.build()
}

// ── chmod Octal <-> Symbolic Engine ──
function triadToSymbolic(digit, specialBit, specialChar) {
  const r = (digit & 4) ? 'r' : '-'
  const w = (digit & 2) ? 'w' : '-'
  const hasX = (digit & 1) !== 0
  let x = hasX ? 'x' : '-'
  if (specialBit) {
    x = hasX ? specialChar.toLowerCase() : specialChar.toUpperCase()
  }
  return `${r}${w}${x}`
}

function triadToWords(digit) {
  const parts = []
  if (digit & 4) parts.push('read')
  if (digit & 2) parts.push('write')
  if (digit & 1) parts.push('exec')
  return parts.length ? parts.join('+') : 'none'
}

function triadToClause(digit) {
  let s = ''
  if (digit & 4) s += 'r'
  if (digit & 2) s += 'w'
  if (digit & 1) s += 'x'
  return s
}

function describeChmodMode(special, u, g, o) {
  const symU = triadToSymbolic(u, (special & 4) !== 0, 's')
  const symG = triadToSymbolic(g, (special & 2) !== 0, 's')
  const symO = triadToSymbolic(o, (special & 1) !== 0, 't')
  const symbolic = `${symU}${symG}${symO}`
  const octal3 = `${u}${g}${o}`
  const octal4 = `${special}${u}${g}${o}`
  const displayOctal = special > 0 ? octal4 : octal3
  const binary = `${u.toString(2).padStart(3, '0')} ${g.toString(2).padStart(3, '0')} ${o.toString(2).padStart(3, '0')}`
  const clause = `u=${triadToClause(u)},g=${triadToClause(g)},o=${triadToClause(o)}`

  const specialLabels = []
  if (special & 4) specialLabels.push('setuid (4000)')
  if (special & 2) specialLabels.push('setgid (2000)')
  if (special & 1) specialLabels.push('sticky (1000)')

  const warnings = []
  if ((o & 2) !== 0 && (special & 1) === 0) {
    warnings.push('World-writable (o+w) without sticky bit')
  }
  if ((special & 4) !== 0 && (o & 2) !== 0) {
    warnings.push('High risk: setuid combined with world-writable')
  }

  return {
    special,
    u,
    g,
    o,
    octal3,
    octal4,
    displayOctal,
    symbolic,
    binary,
    clause,
    specialLabels,
    warnings,
    ownerDesc: `${symU} (${triadToWords(u)})`,
    groupDesc: `${symG} (${triadToWords(g)})`,
    otherDesc: `${symO} (${triadToWords(o)})`,
  }
}

function parseChmodInput(raw) {
  const text = normalizeText(raw)
  if (!text) {
    return null
  }

  // 3 or 4 digit octal (e.g., 755, 0644, 4755, 1777)
  if (/^[0-7]{3,4}$/.test(text)) {
    const padded = text.length === 3 ? `0${text}` : text
    return describeChmodMode(
      Number.parseInt(padded[0], 10),
      Number.parseInt(padded[1], 10),
      Number.parseInt(padded[2], 10),
      Number.parseInt(padded[3], 10),
    )
  }

  // 9-char or 10-char ls -l symbolic (e.g. rwxr-xr-x, -rw-r--r--, drwxrwxrwt, rwsr-xr-x)
  let sym = text
  if (sym.length === 10 && /^[-dlbcps]/.test(sym)) {
    sym = sym.slice(1)
  }
  if (/^[r-][w-][xXsS-][r-][w-][xXsS-][r-][w-][xXtT-]$/.test(sym)) {
    let special = 0
    const parseTriad = (triad, specialMask, sChar) => {
      let val = 0
      if (triad[0] === 'r') val |= 4
      if (triad[1] === 'w') val |= 2
      const xch = triad[2]
      if (xch === 'x' || xch === 'X') {
        val |= 1
      }
      else if (xch === sChar.toLowerCase()) {
        val |= 1
        special |= specialMask
      }
      else if (xch === sChar.toUpperCase()) {
        special |= specialMask
      }
      return val
    }
    const u = parseTriad(sym.slice(0, 3), 4, 's')
    const g = parseTriad(sym.slice(3, 6), 2, 's')
    const o = parseTriad(sym.slice(6, 9), 1, 't')
    return describeChmodMode(special, u, g, o)
  }

  // Symbolic clause form: u=rwx,g=rx,o=rx
  if (/^[ugoa]+=[rwx]*([,\s]+[ugoa]+=[rwx]*)*$/i.test(text)) {
    let u = 0
    let g = 0
    let o = 0
    const clauses = text.toLowerCase().split(/[,\s]+/).filter(Boolean)
    for (const part of clauses) {
      const [who, perms] = part.split('=')
      let bits = 0
      if (perms.includes('r')) bits |= 4
      if (perms.includes('w')) bits |= 2
      if (perms.includes('x')) bits |= 1
      if (who.includes('a') || who.includes('u')) u = bits
      if (who.includes('a') || who.includes('g')) g = bits
      if (who.includes('a') || who.includes('o')) o = bits
    }
    return describeChmodMode(0, u, g, o)
  }

  return null
}

function buildChmodItems(featureId, arg) {
  const trimmed = normalizeText(arg)
  if (!trimmed) {
    return CHMOD_PRESETS.map((preset) => {
      const info = parseChmodInput(preset.octal)
      return buildActionItem({
        id: `${featureId}-chmod-preset-${preset.octal}`,
        featureId,
        title: `chmod ${preset.octal}  (${info.symbolic})  —  ${preset.title}`,
        subtitle: `${preset.zh} · Owner ${info.ownerDesc} · Group ${info.groupDesc} · Other ${info.otherDesc}`,
        accessory: info.octal4,
        actions: [
          { id: ACTION_COPY_PRIMARY, label: '复制 chmod 命令', payload: { text: `chmod ${preset.octal} ` } },
          { id: ACTION_COPY_SECONDARY, label: '复制符号权限', payload: { text: info.symbolic } },
        ],
      })
    })
  }

  const parsed = parseChmodInput(trimmed)
  if (!parsed) {
    return [
      buildInfoItem({
        id: `${featureId}-chmod-invalid`,
        featureId,
        title: 'Invalid chmod Mode / 权限格式无效',
        subtitle: 'Use 3/4-digit octal (755, 0644, 1777), symbolic (rwxr-xr-x, drwxrwxrwt), or clauses (u=rwx,g=rx,o=rx)',
        accessory: 'ERROR',
      }),
    ]
  }

  const items = [
    buildActionItem({
      id: `${featureId}-chmod-summary`,
      featureId,
      title: `Octal ${parsed.displayOctal} (${parsed.octal4})  ⇄  ${parsed.symbolic}`,
      subtitle: `${parsed.clause}  ·  Binary ${parsed.binary}${parsed.specialLabels.length ? `  ·  Special: ${parsed.specialLabels.join(', ')}` : ''}`,
      accessory: 'CHMOD',
      actions: [
        { id: ACTION_COPY_PRIMARY, label: '复制 chmod 命令', payload: { text: `chmod ${parsed.displayOctal} ` } },
        { id: ACTION_COPY_SECONDARY, label: '复制符号表示', payload: { text: parsed.symbolic } },
        { id: ACTION_COPY_JSON, label: '复制八进制值', payload: { text: parsed.displayOctal } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-chmod-breakdown`,
      featureId,
      title: `Owner: ${parsed.ownerDesc}  |  Group: ${parsed.groupDesc}  |  Other: ${parsed.otherDesc}`,
      subtitle: `Symbolic command: chmod ${parsed.clause} <path>`,
      accessory: 'ROLES',
      actions: [
        { id: ACTION_COPY_PRIMARY, label: '复制符号命令', payload: { text: `chmod ${parsed.clause} ` } },
        { id: ACTION_COPY_SECONDARY, label: '复制二进制位', payload: { text: parsed.binary } },
      ],
    }),
  ]

  if (parsed.warnings.length > 0) {
    items.push(buildInfoItem({
      id: `${featureId}-chmod-warning`,
      featureId,
      title: 'Security Caution / 权限安全提示',
      subtitle: parsed.warnings.join(' · '),
      accessory: 'WARN',
    }))
  }

  return items
}

// ── IPv4 CIDR Subnet Calculator ──
function parseIpv4ToInt(ipStr) {
  const parts = String(ipStr ?? '').trim().split('.')
  if (parts.length !== 4) {
    return null
  }
  let acc = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith('0'))) {
      return null
    }
    const octet = Number.parseInt(part, 10)
    if (octet < 0 || octet > 255) {
      return null
    }
    acc = ((acc << 8) | octet) >>> 0
  }
  return acc
}

function intToIpv4(num) {
  const n = num >>> 0
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ].join('.')
}

function intToBinaryOctets(num) {
  const n = num >>> 0
  return [
    ((n >>> 24) & 255).toString(2).padStart(8, '0'),
    ((n >>> 16) & 255).toString(2).padStart(8, '0'),
    ((n >>> 8) & 255).toString(2).padStart(8, '0'),
    (n & 255).toString(2).padStart(8, '0'),
  ].join('.')
}

function maskIntToPrefix(maskInt) {
  const m = maskInt >>> 0
  const inv = (~m) >>> 0
  if (((inv & ((inv + 1) >>> 0)) >>> 0) !== 0) {
    return null
  }
  let count = 0
  let v = m
  while (v !== 0) {
    count += v & 1
    v = v >>> 1
  }
  return count
}

function classifyIpv4(ipInt) {
  const a = (ipInt >>> 24) & 255
  const b = (ipInt >>> 16) & 255
  if (a === 10) return 'Private (RFC 1918 · 10.0.0.0/8)'
  if (a === 172 && b >= 16 && b <= 31) return 'Private (RFC 1918 · 172.16.0.0/12)'
  if (a === 192 && b === 168) return 'Private (RFC 1918 · 192.168.0.0/16)'
  if (a === 100 && b >= 64 && b <= 127) return 'CGNAT Shared (RFC 6598 · 100.64.0.0/10)'
  if (a === 127) return 'Loopback (RFC 1122 · 127.0.0.0/8)'
  if (a === 169 && b === 254) return 'Link-Local (RFC 3927 · 169.254.0.0/16)'
  if (a >= 224 && a <= 239) return 'Multicast (RFC 5771 · 224.0.0.0/4)'
  if (a === 0) return 'Current Network / Unspecified (0.0.0.0/8)'
  if (a >= 240) return 'Reserved (240.0.0.0/4)'
  return 'Public Routable IPv4'
}

function calculateCidr(raw) {
  const text = normalizeText(raw)
  if (!text) {
    return null
  }

  let ipPart = ''
  let prefix = null

  if (text.includes('/')) {
    const [left, right] = text.split('/')
    if (!left || !right || text.split('/').length !== 2) {
      return { ok: false, error: 'Use IPv4/prefix (e.g., 192.168.1.42/24) or IPv4 netmask' }
    }
    ipPart = left.trim()
    const rightTrim = right.trim()
    if (/^\d{1,2}$/.test(rightTrim)) {
      prefix = Number.parseInt(rightTrim, 10)
      if (prefix < 0 || prefix > 32) {
        return { ok: false, error: `CIDR prefix /${prefix} out of range (0–32)` }
      }
    }
    else {
      const maskInt = parseIpv4ToInt(rightTrim)
      if (maskInt === null) {
        return { ok: false, error: `Invalid subnet mask "${rightTrim}"` }
      }
      prefix = maskIntToPrefix(maskInt)
      if (prefix === null) {
        return { ok: false, error: `Non-contiguous subnet mask "${rightTrim}"` }
      }
    }
  }
  else {
    const tokens = text.split(/\s+/)
    if (tokens.length === 2) {
      ipPart = tokens[0]
      const maskInt = parseIpv4ToInt(tokens[1])
      if (maskInt === null) {
        return { ok: false, error: `Invalid subnet mask "${tokens[1]}"` }
      }
      prefix = maskIntToPrefix(maskInt)
      if (prefix === null) {
        return { ok: false, error: `Non-contiguous subnet mask "${tokens[1]}"` }
      }
    }
    else {
      return { ok: false, error: 'Use IPv4/prefix (e.g., 10.0.0.1/24) or IPv4 netmask (10.0.0.1 255.255.255.0)' }
    }
  }

  const ipInt = parseIpv4ToInt(ipPart)
  if (ipInt === null) {
    return { ok: false, error: `Invalid IPv4 address "${ipPart}"` }
  }

  const maskInt = prefix === 0 ? 0 : ((0xFFFFFFFF << (32 - prefix)) >>> 0)
  const wildcardInt = (~maskInt) >>> 0
  const networkInt = (ipInt & maskInt) >>> 0
  const broadcastInt = (networkInt | wildcardInt) >>> 0
  const totalAddresses = 2 ** (32 - prefix)

  let firstUsableInt
  let lastUsableInt
  let usableCount
  let broadcastLabel = intToIpv4(broadcastInt)
  let specialNote = ''

  if (prefix === 32) {
    firstUsableInt = networkInt
    lastUsableInt = networkInt
    usableCount = 1
    broadcastLabel = 'N/A (Host route /32)'
    specialNote = 'Single host route (/32)'
  }
  else if (prefix === 31) {
    firstUsableInt = networkInt
    lastUsableInt = broadcastInt
    usableCount = 2
    broadcastLabel = 'N/A (RFC 3021 /31 point-to-point)'
    specialNote = 'RFC 3021 point-to-point link'
  }
  else {
    firstUsableInt = (networkInt + 1) >>> 0
    lastUsableInt = (broadcastInt - 1) >>> 0
    usableCount = totalAddresses - 2
  }

  return {
    ok: true,
    inputIp: intToIpv4(ipInt),
    prefix,
    cidr: `${intToIpv4(networkInt)}/${prefix}`,
    network: intToIpv4(networkInt),
    broadcast: broadcastLabel,
    netmask: intToIpv4(maskInt),
    wildcard: intToIpv4(wildcardInt),
    firstUsable: intToIpv4(firstUsableInt),
    lastUsable: intToIpv4(lastUsableInt),
    usableRange: prefix === 32 ? intToIpv4(firstUsableInt) : `${intToIpv4(firstUsableInt)} – ${intToIpv4(lastUsableInt)}`,
    usableCount,
    totalAddresses,
    classification: classifyIpv4(networkInt),
    ipBinary: intToBinaryOctets(ipInt),
    maskBinary: intToBinaryOctets(maskInt),
    specialNote,
  }
}

function buildCidrItems(featureId, arg) {
  const trimmed = normalizeText(arg)
  if (!trimmed) {
    const commonBlocks = ['192.168.1.0/24', '10.0.0.0/16', '172.16.0.0/20', '10.0.0.0/30', '10.0.0.0/31', '10.0.0.1/32']
    return commonBlocks.map((block) => {
      const res = calculateCidr(block)
      return buildActionItem({
        id: `${featureId}-cidr-sample-${block.replace(/[./]/g, '-')}`,
        featureId,
        title: `${res.cidr}  —  ${res.usableCount.toLocaleString('en-US')} usable hosts`,
        subtitle: `Mask ${res.netmask} · Range ${res.usableRange} · ${res.classification}`,
        accessory: `/${res.prefix}`,
        actions: [
          { id: ACTION_COPY_PRIMARY, label: '复制 CIDR', payload: { text: res.cidr } },
          { id: ACTION_COPY_JSON, label: '复制完整 JSON', payload: { text: JSON.stringify(res, null, 2) } },
        ],
      })
    })
  }

  const res = calculateCidr(trimmed)
  if (!res || !res.ok) {
    return [
      buildInfoItem({
        id: `${featureId}-cidr-invalid`,
        featureId,
        title: 'Invalid IPv4 CIDR / 子网格式无效',
        subtitle: res?.error || 'Try "192.168.1.42/24" or "10.0.0.1 255.255.255.0"',
        accessory: 'ERROR',
      }),
    ]
  }

  const summaryJson = JSON.stringify({
    cidr: res.cidr,
    network: res.network,
    broadcast: res.broadcast,
    netmask: res.netmask,
    wildcard: res.wildcard,
    usableRange: res.usableRange,
    usableHosts: res.usableCount,
    totalAddresses: res.totalAddresses,
    classification: res.classification,
  }, null, 2)

  return [
    buildActionItem({
      id: `${featureId}-cidr-network`,
      featureId,
      title: `Network: ${res.cidr}  (${res.usableCount.toLocaleString('en-US')} usable / ${res.totalAddresses.toLocaleString('en-US')} total)`,
      subtitle: `${res.classification}${res.specialNote ? ` · ${res.specialNote}` : ''}`,
      accessory: `/${res.prefix}`,
      actions: [
        { id: ACTION_COPY_PRIMARY, label: '复制标准 CIDR', payload: { text: res.cidr } },
        { id: ACTION_COPY_JSON, label: '复制子网详情 JSON', payload: { text: summaryJson } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-cidr-range`,
      featureId,
      title: `Usable Hosts: ${res.usableRange}`,
      subtitle: `Broadcast: ${res.broadcast}`,
      accessory: 'HOSTS',
      actions: [
        { id: ACTION_COPY_PRIMARY, label: '复制可用主机范围', payload: { text: res.usableRange } },
        { id: ACTION_COPY_SECONDARY, label: '复制广播地址', payload: { text: res.broadcast } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-cidr-mask`,
      featureId,
      title: `Subnet Mask: ${res.netmask}  ·  Wildcard: ${res.wildcard}`,
      subtitle: `Mask Bin: ${res.maskBinary}`,
      accessory: 'MASK',
      actions: [
        { id: ACTION_COPY_PRIMARY, label: '复制子网掩码', payload: { text: res.netmask } },
        { id: ACTION_COPY_SECONDARY, label: '复制通配符掩码', payload: { text: res.wildcard } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-cidr-binary`,
      featureId,
      title: `IP Binary (${res.inputIp}): ${res.ipBinary}`,
      subtitle: 'Enter to copy full subnet report as JSON',
      accessory: 'BIN',
      actions: [
        { id: ACTION_COPY_JSON, label: '复制子网详情 JSON', payload: { text: summaryJson } },
        { id: ACTION_COPY_PRIMARY, label: '复制二进制 IP', payload: { text: res.ipBinary } },
      ],
    }),
  ]
}

// ── HTTP Status Code Lookup ──
function buildHttpStatusItems(featureId, arg) {
  const q = normalizeText(arg).toLowerCase()
  let matches
  if (!q) {
    const highlights = [200, 201, 204, 301, 302, 304, 307, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504]
    matches = HTTP_STATUS_CODES.filter(s => highlights.includes(s.code))
  }
  else if (/^[1-5]xx$/.test(q)) {
    matches = HTTP_STATUS_CODES.filter(s => s.cls === q)
  }
  else if (/^\d{3}$/.test(q)) {
    const codeNum = Number.parseInt(q, 10)
    matches = HTTP_STATUS_CODES.filter(s => s.code === codeNum)
  }
  else {
    matches = HTTP_STATUS_CODES.filter((s) => {
      const hay = `${s.code} ${s.cls} ${s.name} ${s.zh} ${s.desc}`.toLowerCase()
      return hay.includes(q)
    })
  }

  if (matches.length === 0) {
    return [
      buildInfoItem({
        id: `${featureId}-http-empty`,
        featureId,
        title: `No HTTP Status Matching "${arg}"`,
        subtitle: 'Try 200, 304, 404, 422, 429, 502, 2xx, 4xx, 5xx, or keywords like redirect, timeout, rate limit',
        accessory: 'HTTP',
      }),
    ]
  }

  return matches.slice(0, 18).map(s => buildActionItem({
    id: `${featureId}-http-${s.code}`,
    featureId,
    title: `${s.code} ${s.name} — ${s.zh}`,
    subtitle: s.desc,
    accessory: `HTTP ${s.cls}`,
    actions: [
      { id: ACTION_COPY_PRIMARY, label: '复制状态码与名称', payload: { text: `${s.code} ${s.name}` } },
      { id: ACTION_COPY_SECONDARY, label: '复制完整说明', payload: { text: `${s.code} ${s.name} (${s.zh}): ${s.desc}` } },
    ],
  }))
}

// ── MIME Types Lookup ──
function buildMimeItems(featureId, arg) {
  const q = normalizeText(arg).toLowerCase()
  const matches = !q
    ? MIME_TYPES.slice(0, 16)
    : MIME_TYPES.filter((entry) => {
        const hay = `${entry.mime} ${entry.exts.join(' ')} ${entry.cat} ${entry.desc}`.toLowerCase()
        return hay.includes(q) || entry.exts.some(ext => ext === `.${q}` || ext === q)
      })

  if (matches.length === 0) {
    return [
      buildInfoItem({
        id: `${featureId}-mime-empty`,
        featureId,
        title: `No MIME Type Matching "${arg}"`,
        subtitle: 'Try json, svg, woff2, pdf, wasm, sse, multipart, or image',
        accessory: 'MIME',
      }),
    ]
  }

  return matches.slice(0, 18).map((entry, idx) => buildActionItem({
    id: `${featureId}-mime-${idx}-${entry.mime.replace(/[^a-z0-9]/gi, '-')}`,
    featureId,
    title: `${entry.mime}${entry.exts.length ? `  (${entry.exts.join(', ')})` : ''}`,
    subtitle: entry.desc,
    accessory: entry.cat.toUpperCase(),
    actions: [
      { id: ACTION_COPY_PRIMARY, label: '复制 MIME 类型', payload: { text: entry.mime } },
      { id: ACTION_COPY_SECONDARY, label: '复制 Content-Type 头', payload: { text: `Content-Type: ${entry.mime}` } },
    ],
  }))
}

// ── ASCII & ANSI Reference ──
function describeAsciiCode(code) {
  if (code < 0 || code > 127) {
    return null
  }
  const hex = `0x${code.toString(16).toUpperCase().padStart(2, '0')}`
  const oct = code.toString(8).padStart(3, '0')
  const bin = code.toString(2).padStart(8, '0')
  const unicode = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`

  if (code < 32) {
    const [abbr, esc, desc] = ASCII_CONTROL_NAMES[code]
    return {
      code,
      label: abbr,
      char: esc || abbr,
      hex,
      oct,
      bin,
      unicode,
      desc,
      category: 'CTRL',
      copyValue: esc || hex,
    }
  }
  if (code === 127) {
    return {
      code,
      label: 'DEL',
      char: 'DEL',
      hex,
      oct,
      bin,
      unicode,
      desc: 'Delete control character',
      category: 'CTRL',
      copyValue: hex,
    }
  }
  const ch = String.fromCharCode(code)
  const label = code === 32 ? 'SPACE (" ")' : `"${ch}"`
  return {
    code,
    label,
    char: ch,
    hex,
    oct,
    bin,
    unicode,
    desc: `HTML &#${code}; · JS "\\x${code.toString(16).toUpperCase().padStart(2, '0')}"`,
    category: 'ASCII',
    copyValue: ch,
  }
}

function buildAsciiItems(featureId, arg) {
  const q = normalizeText(arg)
  if (!q) {
    const commonCodes = [0, 9, 10, 13, 27, 32, 48, 65, 97, 127]
    return commonCodes.map((code) => {
      const info = describeAsciiCode(code)
      return buildActionItem({
        id: `${featureId}-ascii-${code}`,
        featureId,
        title: `ASCII ${info.code} · ${info.hex} · ${info.label}`,
        subtitle: `Bin ${info.bin} · Oct ${info.oct} · ${info.unicode} · ${info.desc}`,
        accessory: info.category,
        actions: [
          { id: ACTION_COPY_PRIMARY, label: '复制字符/转义', payload: { text: info.copyValue } },
          { id: ACTION_COPY_SECONDARY, label: '复制十六进制', payload: { text: info.hex } },
        ],
      })
    })
  }

  const lower = q.toLowerCase()
  if (lower === 'control' || lower === 'ctrl') {
    return [0, 3, 4, 7, 8, 9, 10, 12, 13, 27, 127].map((code) => {
      const info = describeAsciiCode(code)
      return buildActionItem({
        id: `${featureId}-ascii-ctrl-${code}`,
        featureId,
        title: `ASCII ${info.code} (${info.hex}) — ${info.label}`,
        subtitle: `${info.desc} · Bin ${info.bin}`,
        accessory: 'CTRL',
        actions: [
          { id: ACTION_COPY_PRIMARY, label: '复制值', payload: { text: info.copyValue } },
          { id: ACTION_COPY_SECONDARY, label: '复制十六进制', payload: { text: info.hex } },
        ],
      })
    })
  }

  let matchedCodes = []
  // Hex lookup: 0x41
  if (/^0x[0-9a-f]{1,2}$/i.test(q)) {
    const code = Number.parseInt(q.slice(2), 16)
    if (code >= 0 && code <= 127) matchedCodes = [code]
  }
  // Decimal lookup: 0..127
  else if (/^\d{1,3}$/.test(q)) {
    const code = Number.parseInt(q, 10)
    if (code >= 0 && code <= 127) matchedCodes = [code]
  }
  // Escape literal: \n, \r, \t, \0
  else if (q === '\\n') {
    matchedCodes = [10]
  }
  else if (q === '\\r') {
    matchedCodes = [13]
  }
  else if (q === '\\t') {
    matchedCodes = [9]
  }
  else if (q === '\\0') {
    matchedCodes = [0]
  }
  // Single ASCII character
  else if (q.length === 1 && q.charCodeAt(0) <= 127) {
    matchedCodes = [q.charCodeAt(0)]
  }
  // Control name search (LF, CR, ESC, NUL, TAB, DEL, etc.)
  else {
    for (let i = 0; i < ASCII_CONTROL_NAMES.length; i += 1) {
      const [abbr, esc, desc] = ASCII_CONTROL_NAMES[i]
      if (`${abbr} ${esc} ${desc}`.toLowerCase().includes(lower)) {
        matchedCodes.push(i)
      }
    }
    if ('del delete'.includes(lower)) {
      matchedCodes.push(127)
    }
    if ('space sp'.includes(lower)) {
      matchedCodes.push(32)
    }
  }

  if (matchedCodes.length === 0) {
    return [
      buildInfoItem({
        id: `${featureId}-ascii-empty`,
        featureId,
        title: `No ASCII Entry for "${q}"`,
        subtitle: 'Enter a char (A, @), decimal (65), hex (0x41), escape (\\n), or name (LF, ESC, TAB)',
        accessory: 'ASCII',
      }),
    ]
  }

  return matchedCodes.slice(0, 12).map((code) => {
    const info = describeAsciiCode(code)
    return buildActionItem({
      id: `${featureId}-ascii-${code}`,
      featureId,
      title: `ASCII ${info.code} · ${info.hex} · ${info.label}`,
      subtitle: `Oct ${info.oct} · Bin ${info.bin} · ${info.unicode} · ${info.desc}`,
      accessory: info.category,
      actions: [
        { id: ACTION_COPY_PRIMARY, label: '复制字符/转义', payload: { text: info.copyValue } },
        { id: ACTION_COPY_SECONDARY, label: '复制完整编码', payload: { text: `DEC=${info.code} HEX=${info.hex} OCT=${info.oct} BIN=${info.bin} ${info.unicode}` } },
      ],
    })
  })
}

function buildAnsiItems(featureId, arg) {
  const q = normalizeText(arg).toLowerCase()
  const matches = !q
    ? ANSI_CODES.slice(0, 16)
    : ANSI_CODES.filter(a => `${a.code} ${a.name} ${a.cat} ${a.desc} ${a.seq}`.toLowerCase().includes(q))

  if (matches.length === 0) {
    return [
      buildInfoItem({
        id: `${featureId}-ansi-empty`,
        featureId,
        title: `No ANSI Code Matching "${arg}"`,
        subtitle: 'Try reset, bold, red, green, cyan, 256, rgb, clear, or cursor',
        accessory: 'ANSI',
      }),
    ]
  }

  return matches.slice(0, 18).map((entry, idx) => buildActionItem({
    id: `${featureId}-ansi-${idx}-${entry.code.replace(/[^a-z0-9]/gi, '-')}`,
    featureId,
    title: `${entry.seq}  —  ${entry.name} (SGR ${entry.code})`,
    subtitle: entry.desc,
    accessory: `ANSI ${entry.cat.toUpperCase()}`,
    actions: [
      { id: ACTION_COPY_PRIMARY, label: '复制 \\x1b 序列', payload: { text: entry.seq } },
      { id: ACTION_COPY_SECONDARY, label: '复制 \\u001b 序列', payload: { text: entry.uni } },
    ],
  }))
}

// ── Cheatsheets Lookup (Git / Docker / SQL / cURL / tmux) ──
function buildCheatsheetItems(featureId, topicFilter, keyword) {
  const topic = normalizeText(topicFilter).toLowerCase()
  const q = normalizeText(keyword).toLowerCase()

  let pool = CHEATSHEETS
  if (topic) {
    pool = pool.filter(entry => entry.topic === topic)
  }

  if (q) {
    const terms = q.split(/\s+/).filter(Boolean)
    pool = pool.filter((entry) => {
      const hay = `${entry.topic} ${entry.title} ${entry.zh} ${entry.cmd} ${entry.tags.join(' ')}`.toLowerCase()
      return terms.every(term => hay.includes(term))
    })
  }

  if (pool.length === 0) {
    return [
      buildInfoItem({
        id: `${featureId}-cheat-empty`,
        featureId,
        title: `No Cheatsheet Recipe Matching "${[topicFilter, keyword].filter(Boolean).join(' ')}"`,
        subtitle: 'Available topics: git, docker, sql, curl, tmux',
        accessory: 'CHEAT',
      }),
    ]
  }

  return pool.slice(0, 18).map(entry => buildActionItem({
    id: `${featureId}-cheat-${entry.id}`,
    featureId,
    title: `${entry.title} · ${entry.zh}`,
    subtitle: entry.cmd,
    accessory: entry.topic.toUpperCase(),
    actions: [
      { id: ACTION_COPY_PRIMARY, label: '复制命令 / Copy Command', payload: { text: entry.cmd } },
      { id: ACTION_COPY_SECONDARY, label: '复制带注释片段', payload: { text: `# ${entry.title} (${entry.zh})\n${entry.cmd}` } },
    ],
  }))
}

// ── Unified Search & Smart Auto-Router ──
function buildAtlasOverview(featureId) {
  return [
    buildInfoItem({
      id: `${featureId}-guide`,
      featureId,
      title: 'Dev Docs Atlas — 100% Offline Reference & Calculators',
      subtitle: 'HTTP 1xx–5xx · chmod 755/rwxr-xr-x · CIDR 10.0.0.1/24 · MIME · ASCII/ANSI · Git/Docker/SQL/cURL/tmux',
      accessory: 'ATLAS',
    }),
    buildActionItem({
      id: `${featureId}-quick-http`,
      featureId,
      title: 'HTTP Status Codes (59 RFC 9110 / WebDAV codes)',
      subtitle: 'Type: http 429  |  http 5xx  |  http redirect',
      accessory: 'HTTP',
      actions: [{ id: ACTION_COPY_PRIMARY, label: '复制示例查询', payload: { text: 'http 429' } }],
    }),
    buildActionItem({
      id: `${featureId}-quick-chmod`,
      featureId,
      title: 'chmod Octal ⇄ Symbolic Calculator',
      subtitle: 'Type: chmod 755  |  chmod 4755  |  chmod rwxr-xr-x  |  chmod u=rwx,g=rx,o=rx',
      accessory: 'CHMOD',
      actions: [{ id: ACTION_COPY_PRIMARY, label: '复制常用 755', payload: { text: 'chmod 755 ' } }],
    }),
    buildActionItem({
      id: `${featureId}-quick-cidr`,
      featureId,
      title: 'IPv4 CIDR Subnet Calculator',
      subtitle: 'Type: cidr 192.168.1.42/24  |  cidr 10.0.0.1/31  |  10.0.0.1 255.255.240.0',
      accessory: 'CIDR',
      actions: [{ id: ACTION_COPY_PRIMARY, label: '复制示例网段', payload: { text: '192.168.1.0/24' } }],
    }),
    buildActionItem({
      id: `${featureId}-quick-mime`,
      featureId,
      title: 'MIME Types (48 entries) & ASCII / ANSI Codes',
      subtitle: 'Type: mime svg  |  mime sse  |  ascii 65  |  ascii LF  |  ansi green',
      accessory: 'MIME/ANSI',
      actions: [{ id: ACTION_COPY_PRIMARY, label: '复制 JSON Content-Type', payload: { text: 'Content-Type: application/json' } }],
    }),
    buildActionItem({
      id: `${featureId}-quick-cheats`,
      featureId,
      title: 'Cheatsheets: Git · Docker · SQL · cURL · tmux (75 recipes)',
      subtitle: 'Type: cheat git rebase  |  cheat docker logs  |  cheat sql window  |  cheat curl timing  |  cheat tmux split',
      accessory: 'CHEATS',
      actions: [{ id: ACTION_COPY_PRIMARY, label: '复制常用 Git Log', payload: { text: 'git log --oneline --graph --decorate -n 25' } }],
    }),
  ]
}

function buildUnifiedSearch(featureId, query) {
  const q = normalizeText(query)
  const lower = q.toLowerCase()
  const items = []

  // Auto-detect IPv4 CIDR or IPv4 + dotted netmask
  if (/^\d{1,3}(?:\.\d{1,3}){3}(?:\/(?:\d{1,2}|\d{1,3}(?:\.\d{1,3}){3})|\s+\d{1,3}(?:\.\d{1,3}){3})$/.test(q)) {
    return buildCidrItems(featureId, q)
  }

  // Auto-detect symbolic chmod or 4-digit octal chmod or 6xx/7xx 3-digit octal
  if (
    /^[-dlbcps]?[r-][w-][xXsS-][r-][w-][xXsS-][r-][w-][xXtT-]$/.test(q)
    || /^[ugoa]+=[rwx]*([,\s]+[ugoa]+=[rwx]*)+$/i.test(q)
    || /^[0-7]{4}$/.test(q)
    || /^[67][0-7]{2}$/.test(q)
  ) {
    return buildChmodItems(featureId, q)
  }

  // Auto-detect 3-digit HTTP status code (100-599)
  if (/^[1-5]\d{2}$/.test(q)) {
    items.push(...buildHttpStatusItems(featureId, q))
    // If also a valid 3-digit octal (e.g. 400, 444, 500), append chmod interpretation cleanly
    if (/^[0-7]{3}$/.test(q)) {
      const mode = parseChmodInput(q)
      if (mode) {
        items.push(buildActionItem({
          id: `${featureId}-chmod-also-${q}`,
          featureId,
          title: `Also chmod ${mode.displayOctal}: ${mode.symbolic}`,
          subtitle: `Owner ${mode.ownerDesc} · Group ${mode.groupDesc} · Other ${mode.otherDesc}`,
          accessory: 'CHMOD',
          actions: [
            { id: ACTION_COPY_PRIMARY, label: '复制 chmod 命令', payload: { text: `chmod ${mode.displayOctal} ` } },
            { id: ACTION_COPY_SECONDARY, label: '复制符号权限', payload: { text: mode.symbolic } },
          ],
        }))
      }
    }
    return items
  }

  // Auto-detect MIME type string (type/subtype) or dot extension (.svg, .woff2)
  if (/^[a-z]+\/[a-z0-9.+-]+$/i.test(q) || /^\.[a-z0-9]{1,12}$/i.test(q)) {
    return buildMimeItems(featureId, q)
  }

  // Otherwise search across cheatsheets, HTTP codes, MIME types, ANSI codes
  const cheatHits = CHEATSHEETS.filter(e =>
    `${e.topic} ${e.title} ${e.zh} ${e.cmd} ${e.tags.join(' ')}`.toLowerCase().includes(lower),
  ).slice(0, 8)
  for (const entry of cheatHits) {
    items.push(buildActionItem({
      id: `${featureId}-search-cheat-${entry.id}`,
      featureId,
      title: `${entry.title} · ${entry.zh}`,
      subtitle: entry.cmd,
      accessory: entry.topic.toUpperCase(),
      actions: [
        { id: ACTION_COPY_PRIMARY, label: '复制命令 / Copy Command', payload: { text: entry.cmd } },
        { id: ACTION_COPY_SECONDARY, label: '复制带注释片段', payload: { text: `# ${entry.title}\n${entry.cmd}` } },
      ],
    }))
  }

  const httpHits = HTTP_STATUS_CODES.filter(s =>
    `${s.code} ${s.cls} ${s.name} ${s.zh} ${s.desc}`.toLowerCase().includes(lower),
  ).slice(0, 5)
  for (const s of httpHits) {
    items.push(buildActionItem({
      id: `${featureId}-search-http-${s.code}`,
      featureId,
      title: `${s.code} ${s.name} — ${s.zh}`,
      subtitle: s.desc,
      accessory: `HTTP ${s.cls}`,
      actions: [
        { id: ACTION_COPY_PRIMARY, label: '复制状态码与名称', payload: { text: `${s.code} ${s.name}` } },
        { id: ACTION_COPY_SECONDARY, label: '复制完整说明', payload: { text: `${s.code} ${s.name}: ${s.desc}` } },
      ],
    }))
  }

  const mimeHits = MIME_TYPES.filter(m =>
    `${m.mime} ${m.exts.join(' ')} ${m.cat} ${m.desc}`.toLowerCase().includes(lower),
  ).slice(0, 4)
  for (let i = 0; i < mimeHits.length; i += 1) {
    const m = mimeHits[i]
    items.push(buildActionItem({
      id: `${featureId}-search-mime-${i}`,
      featureId,
      title: `${m.mime}${m.exts.length ? ` (${m.exts.join(', ')})` : ''}`,
      subtitle: m.desc,
      accessory: 'MIME',
      actions: [
        { id: ACTION_COPY_PRIMARY, label: '复制 MIME 类型', payload: { text: m.mime } },
        { id: ACTION_COPY_SECONDARY, label: '复制 Content-Type 头', payload: { text: `Content-Type: ${m.mime}` } },
      ],
    }))
  }

  const ansiHits = ANSI_CODES.filter(a =>
    `${a.code} ${a.name} ${a.desc}`.toLowerCase().includes(lower),
  ).slice(0, 4)
  for (let i = 0; i < ansiHits.length; i += 1) {
    const a = ansiHits[i]
    items.push(buildActionItem({
      id: `${featureId}-search-ansi-${i}`,
      featureId,
      title: `${a.seq} — ${a.name}`,
      subtitle: a.desc,
      accessory: 'ANSI',
      actions: [
        { id: ACTION_COPY_PRIMARY, label: '复制 \\x1b 序列', payload: { text: a.seq } },
        { id: ACTION_COPY_SECONDARY, label: '复制 \\u001b 序列', payload: { text: a.uni } },
      ],
    }))
  }

  if (items.length === 0) {
    return [
      buildInfoItem({
        id: `${featureId}-empty`,
        featureId,
        title: `No Reference Entry Found for "${q}"`,
        subtitle: 'Try: http 429 · chmod 755 · cidr 10.0.0.1/24 · mime svg · ascii LF · ansi red · cheat git/docker/sql/curl/tmux',
        accessory: 'ATLAS',
      }),
    ]
  }

  return items.slice(0, 18)
}

function buildResultItems(featureId, rawText) {
  const input = stripGlobalPrefix(rawText)
  if (!input) {
    return buildAtlasOverview(featureId)
  }

  const firstSpace = input.search(/[\s:]/)
  const head = (firstSpace >= 0 ? input.slice(0, firstSpace) : input).toLowerCase()
  const rest = firstSpace >= 0 ? input.slice(firstSpace + 1).trim() : ''

  if (
    head === 'http'
    || head === 'http-status'
    || head === 'httpcode'
    || head === 'status-code'
    || head === 'statuscode'
    || head === 'status'
    || head === '状态码'
  ) {
    return buildHttpStatusItems(featureId, rest)
  }
  if (head === 'chmod' || head === '权限计算') {
    return buildChmodItems(featureId, rest)
  }
  if (head === 'cidr' || head === 'subnet' || head === '子网') {
    return buildCidrItems(featureId, rest)
  }
  if (head === 'mime') {
    return buildMimeItems(featureId, rest)
  }
  if (head === 'ascii') {
    return buildAsciiItems(featureId, rest)
  }
  if (head === 'ansi') {
    return buildAnsiItems(featureId, rest)
  }
  if (head === 'cheat' || head === 'cheatsheet') {
    const subSpace = rest.search(/[\s:]/)
    const maybeTopic = (subSpace >= 0 ? rest.slice(0, subSpace) : rest).toLowerCase()
    const subRest = subSpace >= 0 ? rest.slice(subSpace + 1).trim() : ''
    if (['git', 'docker', 'sql', 'curl', 'tmux'].includes(maybeTopic)) {
      return buildCheatsheetItems(featureId, maybeTopic, subRest)
    }
    return buildCheatsheetItems(featureId, '', rest)
  }
  if (['git', 'docker', 'sql', 'curl', 'tmux'].includes(head)) {
    return buildCheatsheetItems(featureId, head, rest)
  }

  return buildUnifiedSearch(featureId, input)
}

function blocked(reason, message) {
  return {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason,
    message,
  }
}

async function ensureClipboardWritePermission() {
  const perm = getPermission()
  if (!perm || typeof perm.check !== 'function') {
    return {
      granted: false,
      reason: 'permission-sdk-unavailable',
      message: '权限系统不可用',
    }
  }
  try {
    const granted = await perm.check('clipboard.write')
    if (granted === true) {
      return { granted: true, reason: '', message: '' }
    }
    return {
      granted: false,
      reason: 'permission-denied',
      message: '缺少 clipboard.write 权限',
    }
  }
  catch (error) {
    getLogger()?.warn?.(`[${PLUGIN_NAME}] Permission check failed`)
    if (error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
      return {
        granted: false,
        reason: 'permission-unavailable',
        message: '权限服务暂不可用',
      }
    }
    if (error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
      return {
        granted: false,
        reason: 'permission-denied',
        message: '缺少 clipboard.write 权限',
      }
    }
    return {
      granted: false,
      reason: 'permission-check-failed',
      message: '权限检查失败',
    }
  }
}

async function publishItems(items, generation, signal) {
  if (generation !== triggerGeneration || signal?.aborted) {
    return true
  }
  const feature = getPlugin()?.feature
  if (!feature || typeof feature.clearItems !== 'function' || typeof feature.pushItems !== 'function') {
    return false
  }
  await feature.clearItems()
  if (generation !== triggerGeneration || signal?.aborted) {
    return true
  }
  await feature.pushItems(items)
  return true
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query, _feature, signal) {
    const generation = ++triggerGeneration
    try {
      const items = buildResultItems(featureId || FEATURE_ID, getQueryText(query))
      return await publishItems(items, generation, signal)
    }
    catch {
      getLogger()?.error?.(`[${PLUGIN_NAME}] Failed to handle feature`)
      try {
        return await publishItems([
          buildInfoItem({
            id: `${featureId || FEATURE_ID}-error`,
            featureId: featureId || FEATURE_ID,
            title: 'Docs Atlas Error / 参考手册运行异常',
            subtitle: '请检查查询格式后重试',
            accessory: 'ERROR',
          }),
        ], generation, signal)
      }
      catch {
        getLogger()?.error?.(`[${PLUGIN_NAME}] Failed to publish fallback`)
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    try {
      const selectedActionId = normalizeText(
        context?.actionId || item?.meta?.defaultAction || item?.actions?.[0]?.id,
      )
      if (!selectedActionId) {
        return blocked('invalid-action', '无效的操作')
      }

      const declaredAction = Array.isArray(item?.actions)
        ? item.actions.find(action => action?.id === selectedActionId)
        : null
      if (!declaredAction || declaredAction.type !== 'plugin') {
        return blocked('invalid-action', '未找到对应的插件操作')
      }

      const payloadText = typeof declaredAction.payload === 'string'
        ? declaredAction.payload
        : declaredAction.payload?.text
      if (typeof payloadText !== 'string') {
        return blocked('invalid-action', '缺少可复制内容')
      }

      const permCheck = await ensureClipboardWritePermission()
      if (!permCheck.granted) {
        return blocked(permCheck.reason, permCheck.message)
      }

      const clip = getClipboard()
      if (!clip || typeof clip.writeText !== 'function') {
        return blocked('capability-unavailable', '当前环境不支持写入剪贴板')
      }

      await clip.writeText(payloadText)
      return {
        externalAction: true,
        success: true,
        status: 'started',
        message: '已复制到剪贴板',
      }
    }
    catch (error) {
      getLogger()?.error?.(`[${PLUGIN_NAME}] Action failed`)
      if (error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
        return blocked('permission-denied', '缺少 clipboard.write 权限')
      }
      if (error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
        return blocked('permission-unavailable', '权限服务暂不可用')
      }
      return blocked('clipboard-write-failed', '写入剪贴板失败')
    }
  },

  onDestroy() {
    triggerGeneration += 1
  },
}

module.exports = pluginLifecycle
