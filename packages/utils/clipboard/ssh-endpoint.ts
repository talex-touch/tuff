/**
 * SSH 与主机端点的判定。
 *
 * 单独成文件而不是并进 `content-classifier.ts`，是因为这里几乎全部是「什么**不**算」的
 * 规则：一个四段数字既可能是 IP 也可能是版本号，一个四位数既可能是端口也可能是验证码。
 * 判据集中放在一处才看得出它们有没有互相打架。
 */

/** 端口的合法范围。0 不是可连接端口。 */
const PORT_MIN = 1
const PORT_MAX = 65535

/**
 * 私有与保留地址段。落在这些段里的四段数字直接认作主机。
 *
 * 版本号落进 `10.` / `192.168.` 是巧合，主机落进去是常态。公网段没有这个不对称性，
 * 所以要另外要求上下文（见 `IPV4_CONTEXT`）。
 */
const PRIVATE_IPV4_PREFIXES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
]

const IPV4_CANDIDATE = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g

/** 括号形式的 IPv6 端点。裸 IPv6 不认——它和一堆冒号分隔的东西无法区分。 */
const IPV6_ENDPOINT = /\[([0-9A-Fa-f:]{2,45})\](?::(\d{1,5}))?/g

/** `user@host`，host 允许域名或 IP 字面量。 */
const USER_AT_HOST = /\b([a-z_][\w.-]{0,31})@((?:[\w-]+\.)+[A-Za-z]{2,}|\d{1,3}(?:\.\d{1,3}){3})\b/

/** ssh 系命令里的 `-p` / `-P`，以及 ssh_config 的 `Port n`。 */
const PORT_FLAG = /(?:^|\s)-[pP]\s+(\d{1,5})(?!\S)/
const PORT_DIRECTIVE = /(?:^|\n)\s*Port\s+(\d{1,5})\s*(?:$|\n)/
/** `host:port`。前面必须是主机形状，否则 `12:30` 这种时间也会被吃掉。 */
const HOST_COLON_PORT = /\b((?:[\w-]+\.)+[A-Za-z]{2,}|\d{1,3}(?:\.\d{1,3}){3}|localhost)\s*:\s*(\d{1,5})\b/

/** ssh 系命令名。它们的出现让一个公网 IP 从"可能是版本号"变成"是主机"。 */
const SSH_COMMAND = /(?:^|\s)(?:ssh|scp|sftp|rsync|ssh-copy-id|mosh)(?:\s|$)/

const SSH_PUBLIC_KEY =
  /\b(ssh-rsa|ssh-dss|ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521))\s+([A-Za-z0-9+/]{32,}={0,3})(?:\s+(\S+))?/

export interface ClipboardSshEndpoint {
  user: string | null
  host: string
  /** 主机是不是 IP 字面量。掩码只作用于 IP——域名掩掉就看不出连的是哪台了。 */
  hostIsIp: boolean
  port: number | null
  /** 主机在原文里的区间，供掩码使用。`hostIsIp` 为 false 时不掩码，但区间仍然给出。 */
  hostStart: number
  hostEnd: number
}

export interface ClipboardSshPublicKey {
  algorithm: string
  comment: string | null
  start: number
  end: number
}

function isPort(value: string): boolean {
  if (!/^\d{1,5}$/.test(value)) return false
  const port = Number(value)
  return port >= PORT_MIN && port <= PORT_MAX
}

function isIpv4(octets: readonly string[]): boolean {
  return octets.every(octet => {
    // 前导零的写法（`010.0.0.1`）在不同解析器里含义不同，一律不认。
    if (octet.length > 1 && octet.startsWith('0')) return false
    const value = Number(octet)
    return value >= 0 && value <= 255
  })
}

function isPrivateIpv4(address: string): boolean {
  return PRIVATE_IPV4_PREFIXES.some(prefix => prefix.test(address))
}

/**
 * 公网 IPv4 需要上下文才算主机。
 *
 * `1.2.3.4` 既是合法地址也是四段版本号，散文里遇到它更可能是后者。要求下列任一：
 * 带 `user@` 前缀、带 `:port` 后缀、出现在 ssh 系命令里，或者整条内容就是它本身
 * ——单独复制一个 IP 是常见操作，那种场景没有散文歧义。
 */
function publicIpv4HasContext(content: string, address: string, start: number, end: number): boolean {
  if (content.trim() === address) return true
  if (SSH_COMMAND.test(content)) return true
  if (start > 0 && content[start - 1] === '@') return true
  const after = content.slice(end)
  return /^\s*:\s*\d{1,5}\b/.test(after)
}

/**
 * 端口永远要靠分隔符定位，绝不从裸数字推断。
 *
 * `8080` 和 `123456` 在字面上和端口、验证码都无法区分，而分类器已经为验证码定过
 * 「没有来源证据的裸数字串不算验证码」这条纪律。端口不能反过来把它破坏掉。
 */
export function detectSshPort(content: string): number | null {
  for (const pattern of [PORT_FLAG, PORT_DIRECTIVE]) {
    const match = pattern.exec(content)
    if (match?.[1] && isPort(match[1])) return Number(match[1])
  }

  const bracketed = new RegExp(IPV6_ENDPOINT.source).exec(content)
  if (bracketed?.[2] && isPort(bracketed[2])) return Number(bracketed[2])

  const hostPort = HOST_COLON_PORT.exec(content)
  if (hostPort?.[2] && isPort(hostPort[2])) return Number(hostPort[2])

  return null
}

/** 找出内容里第一个够格当主机的 IPv4，返回它和它的区间。 */
function findIpv4Host(content: string): { address: string; start: number; end: number } | null {
  const pattern = new RegExp(IPV4_CANDIDATE.source, IPV4_CANDIDATE.flags)
  for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
    const address = match[0]
    if (!isIpv4(match.slice(1, 5) as string[])) continue
    const start = match.index
    const end = start + address.length
    if (isPrivateIpv4(address) || publicIpv4HasContext(content, address, start, end)) {
      return { address, start, end }
    }
  }
  return null
}

export function detectSshPublicKey(content: string): ClipboardSshPublicKey | null {
  const match = SSH_PUBLIC_KEY.exec(content)
  if (!match) return null
  return {
    algorithm: match[1]!,
    comment: match[3] ?? null,
    start: match.index,
    end: match.index + match[0].length,
  }
}

/**
 * 主机端点。域名或 IP 都算，但必须有能把它和普通文本区分开的证据：
 * `user@`、`:port`、ssh 系命令，或者是一个私有段 IP。
 */
export function detectSshEndpoint(content: string): ClipboardSshEndpoint | null {
  const trimmed = content.trim()
  if (!trimmed || trimmed.length > 2048) return null

  const port = detectSshPort(content)
  const userAtHost = USER_AT_HOST.exec(content)
  const ipv4 = findIpv4Host(content)

  if (userAtHost) {
    const host = userAtHost[2]!
    const hostIsIp = /^\d/.test(host)
    // `someone@example.com` 是邮箱，不是要连的机器——两者字面上完全一样。
    // 和公网 IP 同一条纪律：域名形态的 user@host 需要旁证才算端点。
    if (!hostIsIp && !SSH_COMMAND.test(content) && port === null) {
      return null
    }
    const hostStart = userAtHost.index + userAtHost[0].indexOf(host, userAtHost[1]!.length)
    return {
      user: userAtHost[1] ?? null,
      host,
      hostIsIp,
      port,
      hostStart,
      hostEnd: hostStart + host.length,
    }
  }

  if (ipv4) {
    return {
      user: null,
      host: ipv4.address,
      hostIsIp: true,
      port,
      hostStart: ipv4.start,
      hostEnd: ipv4.end,
    }
  }

  // 域名主机没有 `user@` 时，只有出现在 ssh 系命令里才算端点。否则
  // `docs.example.com:8080` 这种在散文里出现的地址会被当成要连的机器。
  if (SSH_COMMAND.test(content)) {
    const hostPort = HOST_COLON_PORT.exec(content)
    const host = hostPort?.[1]
    if (host) {
      const hostStart = hostPort!.index + hostPort![0].indexOf(host)
      return {
        user: null,
        host,
        hostIsIp: false,
        port,
        hostStart,
        hostEnd: hostStart + host.length,
      }
    }
  }

  return null
}
