/**
 * 剪贴板内容分类。
 *
 * 这里是**唯一**的判定实现。在它之前，主进程 (`clipboard-tagging.ts`) 和剪贴板历史插件
 * (`clipboard-shapes.ts`) 各自维护了一张正则表，语义还不一样：主进程在正文里搜子串，
 * 插件要求整条内容就是密钥。于是 `api_key: sk-xxx` 写在句子里时，主进程给它挂上
 * 「API 密钥」标签，插件却因为"含空白"判定不是密钥、把它明文渲染出来。
 *
 * 两侧现在都从这里读。判定带 span，掩码按区间替换——"整条就是密钥"只是
 * `start === 0 && end === length` 的特例，不再是一条独立的代码路径。
 */

import type { ClipboardSshEndpoint, ClipboardSshPublicKey } from './ssh-endpoint'
import { detectSshEndpoint, detectSshPublicKey } from './ssh-endpoint'

export type ClipboardTag =
  | 'url'
  | 'api_key'
  | 'github'
  | 'npm'
  | 'openai'
  | 'stripe'
  | 'google'
  | 'aws'
  | 'slack'
  | 'wechat'
  | 'password'
  | 'account'
  | 'email'
  | 'token'
  | 'private_key'
  | 'jwt'
  | 'connection_string'
  | 'verification_code'
  | 'ssh'

/** 展示顺序。UI 直接按这个顺序渲染标签，不再各自排序。 */
export const CLIPBOARD_TAG_ORDER: readonly ClipboardTag[] = [
  'url',
  'api_key',
  'private_key',
  'jwt',
  'connection_string',
  'verification_code',
  'ssh',
  'github',
  'npm',
  'openai',
  'stripe',
  'google',
  'aws',
  'slack',
  'wechat',
  'token',
  'password',
  'account',
  'email',
]

/**
 * 一段要被掩码的敏感片段的种类。
 *
 * 注意「敏感」不等于「凭据」：见下面的 `RETENTION_PROTECTING_KINDS`。这个类型名里的
 * secret 是历史称呼，成员里已经有不是凭据的东西。
 */
export type ClipboardSecretKind =
  | 'api-key'
  | 'private-key'
  | 'jwt'
  | 'connection-string'
  | 'env'
  | 'password-field'
  | 'token-field'
  /** 主机 IP。要掩码，但**不是**凭据——见 `RETENTION_PROTECTING_KINDS`。 */
  | 'host-ip'

export interface ClipboardSecretHit {
  kind: ClipboardSecretKind
  /** 已知服务名。自建网关这类识别不出来源的为 null，UI 显示「未识别服务」。 */
  service: string | null
  /** 命中在 content 里的区间，掩码按它替换。 */
  start: number
  end: number
  /** live 密钥、私钥、连接串这类「泄漏即事故」的，UI 上要额外红标。 */
  critical: boolean
}

export type VerificationCodeSource = 'prefixed' | 'keyword' | 'messaging-app'

export interface ClipboardVerificationCode {
  value: string
  source: VerificationCodeSource
}

/** 保留档位。主进程据此决定这条记录进哪一档清理策略。 */
export type ClipboardRetentionClass = 'secret' | 'verification-code' | 'ordinary'

/**
 * 命中哪些 kind 才让整条记录免于自动清理。
 *
 * 在此之前保留期由「有没有命中」决定（`secrets.length > 0`），也就是说掩码和永不删除
 * 是同一个开关：任何为了掩码而加进来的东西，都会顺带让记录永久留存。主机 IP 要掩码，
 * 但它不是凭据——该过期就得过期，否则复制几个 IP 就能让历史只增不减。
 *
 * 这份名单要和 `ClipboardSecretKind` 一起改：新增一个 kind 时必须显式回答它算不算凭据。
 */
const RETENTION_PROTECTING_KINDS: ReadonlySet<ClipboardSecretKind> = new Set([
  'api-key',
  'private-key',
  'jwt',
  'connection-string',
  'env',
  'password-field',
  'token-field',
])

export interface ClipboardClassification {
  tags: ClipboardTag[]
  secrets: ClipboardSecretHit[]
  verificationCode: ClipboardVerificationCode | null
  /** SSH / 主机端点。字段拆解用，不参与掩码——掩码由 `host-ip` 命中承担。 */
  sshEndpoint: ClipboardSshEndpoint | null
  sshPublicKey: ClipboardSshPublicKey | null
  retentionClass: ClipboardRetentionClass
}

export interface ClipboardClassifyInput {
  type: 'text' | 'image' | 'files'
  content: string
  rawContent?: string | null
  /** 验证码的第三条判据要它：来自短信 / 邮件应用的短数字串才可能是验证码。 */
  sourceApp?: string | null
  /** 用户在设置里追加的密钥前缀，和内置前缀走同一条通用规则。 */
  customKeyPrefixes?: readonly string[]
}

const MAX_SAMPLE_LENGTH = 5000

// ── 已知服务前缀 ────────────────────────────────────────────────────────────
// 顺序有意义：`sk-ant-` 必须排在 `sk-` 前面，否则 Anthropic 的 key 会被认成 OpenAI 的。

interface ServicePattern {
  service: string
  tag: ClipboardTag | null
  pattern: RegExp
  critical?: (value: string) => boolean
}

const SERVICE_PATTERNS: readonly ServicePattern[] = [
  { service: 'GitHub', tag: 'github', pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },
  { service: 'GitHub', tag: 'github', pattern: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g },
  { service: 'npm', tag: 'npm', pattern: /\bnpm_[A-Za-z0-9]{36,}\b/g },
  { service: 'Anthropic', tag: null, pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { service: 'OpenAI', tag: 'openai', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { service: 'AWS', tag: 'aws', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    service: 'Stripe',
    tag: 'stripe',
    pattern: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    critical: value => value.includes('_live_'),
  },
  { service: 'Slack', tag: 'slack', pattern: /\b(?:xox[abprs]|xapp)-[A-Za-z0-9-]{10,}\b/g },
  { service: 'Google', tag: 'google', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
]

const PRIVATE_KEY_PATTERN = /-----BEGIN ([A-Z ]*)PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g
const CONNECTION_STRING_PATTERN = /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s]+/gi
const JWT_PATTERN = /\b(eyJ[A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\b/g
const ENV_ASSIGNMENT_PATTERN = /\b([A-Za-z_][A-Za-z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIAL)[A-Za-z0-9_]*)\s*=\s*(\S+)/g
const API_KEY_FIELD_PATTERN =
  /\b(?:api[-_ ]?key|x-api-key|access[-_ ]?key|secret[-_ ]?key|client[-_ ]?secret)\b\s*(?:[:=]|is)\s*(\S{8,})/gi
const TOKEN_FIELD_PATTERN = /\b(?:token|bearer)\b\s*(?:[:=]|is)\s*([\w\-.=]{8,})/gi
/** `Authorization: Bearer <token>` 没有分隔符，字段式那条匹配不到它。 */
const BEARER_PATTERN = /\bbearer\s+([\w\-.=]{8,})\b/gi
const PASSWORD_FIELD_PATTERN = /\b(?:pass(?:word)?|passwd|pwd)\b\s*(?:[:=]|is)\s*(\S+)/gi

/**
 * 字段式规则（`token is xxx`）会咬到普通英文散文：`token is important for this project`
 * 里的 `important` 就会被当成凭据。以前这只是个多余的 UI 标签，现在同一个判定还决定
 * 「永不自动删除」和打码，所以假阳性的代价从"标签不准"变成了"用户读不到自己的正文，
 * 而且这条记录永远删不掉"。
 *
 * 判据是「短的纯小写字母串」：英文词典词几乎都短于 12 个字母，而凭据要么带数字标点、
 * 要么长得多。只看"纯小写"会把 `Bearer abcdefghijklmnop` 这种真 token 一起误杀。
 */
const PROSE_WORD_MAX_LENGTH = 12
const PURE_LOWERCASE = /^[a-z]+$/

function looksLikeCredentialValue(value: string): boolean {
  return !(PURE_LOWERCASE.test(value) && value.length < PROSE_WORD_MAX_LENGTH)
}

const URL_PATTERN = /\bhttps?:\/\/\S+/i
const WWW_PATTERN = /\bwww\.\S+/i
const EMAIL_PATTERN = /\b[\w.%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
const ACCOUNT_FIELD_PATTERN = /\b(?:user(?:name)?|account|login)\b\s*(?:[:=]|is)\s*\S+/i
const WECHAT_MENTION_PATTERN = /(?:@(?:wx|wechat)\b|微信)/iu

/**
 * 未识别来源的密钥：`<2-6 位小写字母><- 或 _><高熵体>`。
 *
 * 这条存在的原因是自建网关。sub2api 之类的服务把下发 key 的前缀做成了每个部署自己配的
 * 值（默认 `sk-`，但运维可以改成任意串），所以硬编码某个前缀既会漏掉别的部署，
 * 又假装知道是哪家。这里只认形状，服务名留空。
 */
const UNKNOWN_KEY_PATTERN = /(?:^|[\s"'`(<[])([a-z]{2,6}[-_])([A-Za-z0-9_-]{20,})(?![\w-])/g

/** 词典式下划线分词：`my_documentation_folder` 这种不是密钥。 */
const DICTIONARY_SHAPE = /^[a-z]+(?:[_-][a-z]+)+$/

function looksHighEntropy(body: string): boolean {
  if (DICTIONARY_SHAPE.test(body)) return false
  return /[a-z]/.test(body) && /[A-Z]/.test(body) && /\d/.test(body)
}

// ── 验证码 ──────────────────────────────────────────────────────────────────

/** `G-123456` 这类带字母前缀的一次性码。 */
const PREFIXED_CODE_PATTERN = /(?:^|\s)([A-Z]{1,3})-(\d{4,8})(?![\w-])/
const CODE_KEYWORD_PATTERN =
  /(验证码|校验码|动态码|verification\s*code|security\s*code|one[-\s]?time|\bOTP\b)/i
const DIGIT_RUN_PATTERN = /\b(\d{4,8})\b/
const BARE_CODE_PATTERN = /^\d{4,8}$/

/**
 * 短信 / 邮件类来源。只有在这个名单里，一条裸数字才可能被当成验证码。
 * 不认识的 bundle id 一律不算——宁可多留 90 天，也不能把别人的订单号一小时后删掉。
 */
const MESSAGING_APP_IDS: ReadonlySet<string> = new Set([
  'com.apple.mobilesms',
  'com.apple.messages',
  'com.apple.mail',
  'com.apple.ichat',
  'com.microsoft.outlook',
  'com.readdle.smartemail-mac',
  'com.airmail.beta',
  'com.google.gmail',
  'ru.keepcoder.telegram',
  'com.tencent.xinwechat',
])

function isMessagingApp(sourceApp: string | null | undefined): boolean {
  const id = (sourceApp ?? '').trim().toLowerCase()
  return id.length > 0 && MESSAGING_APP_IDS.has(id)
}

// ── 判定 ────────────────────────────────────────────────────────────────────

function pushHit(hits: ClipboardSecretHit[], hit: ClipboardSecretHit): void {
  // 同一段文本可能被多条规则命中（Stripe 的 `sk_live_` 也匹配通用 `sk-`），保留先命中的。
  const overlaps = hits.some(existing => hit.start < existing.end && existing.start < hit.end)
  if (!overlaps) hits.push(hit)
}

function collectServiceHits(sample: string, hits: ClipboardSecretHit[]): void {
  for (const entry of SERVICE_PATTERNS) {
    const pattern = new RegExp(entry.pattern.source, entry.pattern.flags)
    for (let match = pattern.exec(sample); match !== null; match = pattern.exec(sample)) {
      const value = match[0]
      pushHit(hits, {
        kind: 'api-key',
        service: entry.service,
        start: match.index,
        end: match.index + value.length,
        critical: entry.critical?.(value) ?? false,
      })
    }
  }
}

function collectStructuralHits(sample: string, hits: ClipboardSecretHit[]): void {
  const scan = (
    pattern: RegExp,
    kind: ClipboardSecretKind,
    critical: boolean,
    service: (match: RegExpExecArray) => string | null,
    valueGroup = 0,
    accept?: (value: string) => boolean,
  ): void => {
    const regex = new RegExp(pattern.source, pattern.flags)
    for (let match = regex.exec(sample); match !== null; match = regex.exec(sample)) {
      const value = match[valueGroup]
      if (regex.lastIndex === match.index) regex.lastIndex += 1
      if (!value) continue
      if (accept && !accept(value)) continue
      const start = valueGroup === 0 ? match.index : match.index + match[0].indexOf(value)
      pushHit(hits, {
        kind,
        service: service(match),
        start,
        end: start + value.length,
        critical,
      })
    }
  }

  scan(PRIVATE_KEY_PATTERN, 'private-key', true, match => {
    const label = (match[1] ?? '').trim()
    return label ? `${label} 私钥` : '私钥'
  })
  scan(CONNECTION_STRING_PATTERN, 'connection-string', true, match => `${match[1]} 连接串`)
  scan(JWT_PATTERN, 'jwt', false, () => 'JWT')
  scan(ENV_ASSIGNMENT_PATTERN, 'env', false, match => match[1] ?? null, 2)
  scan(API_KEY_FIELD_PATTERN, 'api-key', false, () => null, 1, looksLikeCredentialValue)
  scan(TOKEN_FIELD_PATTERN, 'token-field', false, () => null, 1, looksLikeCredentialValue)
  scan(BEARER_PATTERN, 'token-field', false, () => null, 1, looksLikeCredentialValue)
  scan(PASSWORD_FIELD_PATTERN, 'password-field', false, () => null, 1, looksLikeCredentialValue)
}

function collectUnknownKeyHits(
  sample: string,
  hits: ClipboardSecretHit[],
  customPrefixes: readonly string[],
): void {
  const pattern = new RegExp(UNKNOWN_KEY_PATTERN.source, UNKNOWN_KEY_PATTERN.flags)
  for (let match = pattern.exec(sample); match !== null; match = pattern.exec(sample)) {
    const prefix = match[1] ?? ''
    const body = match[2] ?? ''
    const isCustom = customPrefixes.some(candidate => prefix.toLowerCase() === candidate.toLowerCase())
    if (!isCustom && !looksHighEntropy(body)) continue

    const start = match.index + match[0].indexOf(prefix)
    pushHit(hits, {
      kind: 'api-key',
      service: null,
      start,
      end: start + prefix.length + body.length,
      critical: false,
    })
  }
}

function detectVerificationCode(
  sample: string,
  sourceApp: string | null | undefined,
  hasSecret: boolean,
): ClipboardVerificationCode | null {
  // `sk-123456` 是密钥不是验证码；密钥命中优先。
  if (hasSecret) return null

  const prefixed = PREFIXED_CODE_PATTERN.exec(sample)
  if (prefixed?.[2]) {
    return { value: prefixed[2], source: 'prefixed' }
  }

  if (CODE_KEYWORD_PATTERN.test(sample)) {
    const digits = DIGIT_RUN_PATTERN.exec(sample)
    if (digits?.[1]) {
      return { value: digits[1], source: 'keyword' }
    }
  }

  // 裸数字只在来源明确是短信 / 邮件时才算。这一条是用户明确确认过的保守取舍：
  // 订单号、金额、年月、PIN 都是同一个形状，而误判的后果是一小时后自动删除。
  const trimmed = sample.trim()
  if (BARE_CODE_PATTERN.test(trimmed) && isMessagingApp(sourceApp)) {
    return { value: trimmed, source: 'messaging-app' }
  }

  return null
}

function collectTags(
  sample: string,
  hits: readonly ClipboardSecretHit[],
  verificationCode: ClipboardVerificationCode | null,
  ssh: { endpoint: ClipboardSshEndpoint | null; publicKey: ClipboardSshPublicKey | null },
): ClipboardTag[] {
  const tags = new Set<ClipboardTag>()

  if (URL_PATTERN.test(sample) || WWW_PATTERN.test(sample)) tags.add('url')
  if (EMAIL_PATTERN.test(sample)) tags.add('email')
  if (ACCOUNT_FIELD_PATTERN.test(sample)) tags.add('account')
  if (WECHAT_MENTION_PATTERN.test(sample)) tags.add('wechat')
  if (verificationCode) tags.add('verification_code')
  if (ssh.endpoint || ssh.publicKey) tags.add('ssh')

  for (const hit of hits) {
    switch (hit.kind) {
      case 'api-key':
      case 'env':
        tags.add('api_key')
        break
      case 'private-key':
        tags.add('private_key')
        break
      case 'jwt':
        tags.add('jwt')
        break
      case 'connection-string':
        tags.add('connection_string')
        break
      case 'token-field':
        tags.add('token')
        break
      case 'password-field':
        tags.add('password')
        break
    }

    const serviceTag = SERVICE_PATTERNS.find(entry => entry.service === hit.service)?.tag
    if (serviceTag) tags.add(serviceTag)
  }

  return CLIPBOARD_TAG_ORDER.filter(tag => tags.has(tag))
}

const EMPTY_CLASSIFICATION: ClipboardClassification = {
  tags: [],
  secrets: [],
  verificationCode: null,
  sshEndpoint: null,
  sshPublicKey: null,
  retentionClass: 'ordinary',
}

export function classifyClipboardContent(input: ClipboardClassifyInput): ClipboardClassification {
  if (input.type !== 'text') return EMPTY_CLASSIFICATION

  const trimmed = (input.content ?? '').trim()
  if (!trimmed) return EMPTY_CLASSIFICATION

  const sample = input.content.length > MAX_SAMPLE_LENGTH ? input.content.slice(0, MAX_SAMPLE_LENGTH) : input.content

  const secrets: ClipboardSecretHit[] = []
  // 顺序即优先级：`pushHit` 丢弃与已有命中重叠的区间，所以认得出服务名的规则必须先扫。
  // 反过来的话，`api_key: sk-xxx` 会被通用字段规则先占住，OpenAI 这个更具体的判定
  // 连同它的服务名标签一起被丢掉。
  collectServiceHits(sample, secrets)
  collectStructuralHits(sample, secrets)
  collectUnknownKeyHits(sample, secrets, input.customKeyPrefixes ?? [])
  secrets.sort((left, right) => left.start - right.start)

  // 主机 IP 最后扫：连接串里的 IP（`postgres://u:p@10.0.0.1:5432/db`）应当由
  // `connection-string` 整段吃掉并按凭据处理，而不是被拆出一个 host-ip 让整串反而
  // 失去保护。`pushHit` 丢弃重叠区间，排在最后就自动是这个结果。
  const sshEndpoint = detectSshEndpoint(sample)
  const sshPublicKey = detectSshPublicKey(sample)
  if (sshEndpoint?.hostIsIp) {
    pushHit(secrets, {
      kind: 'host-ip',
      service: null,
      start: sshEndpoint.hostStart,
      end: sshEndpoint.hostEnd,
      critical: false,
    })
  }

  const verificationCode = detectVerificationCode(sample, input.sourceApp, secrets.length > 0)
  const tags = collectTags(sample, secrets, verificationCode, {
    endpoint: sshEndpoint,
    publicKey: sshPublicKey,
  })

  const retentionClass: ClipboardRetentionClass = secrets.some(hit =>
    RETENTION_PROTECTING_KINDS.has(hit.kind),
  )
    ? 'secret'
    : verificationCode
      ? 'verification-code'
      : 'ordinary'

  return { tags, secrets, verificationCode, sshEndpoint, sshPublicKey, retentionClass }
}

/**
 * 按命中区间掩码。整条内容就是密钥时区间覆盖全文，所以不需要单独的"整条"分支。
 * 私钥一个字符都不给，连前缀都不留。
 */
export function maskSecretSpans(content: string, secrets: readonly ClipboardSecretHit[]): string {
  if (secrets.length === 0) return content

  const ordered = [...secrets].sort((left, right) => left.start - right.start)
  let cursor = 0
  let output = ''

  for (const hit of ordered) {
    if (hit.start < cursor) continue
    output += content.slice(cursor, hit.start)
    output += maskValue(content.slice(hit.start, hit.end), hit.kind)
    cursor = hit.end
  }

  return output + content.slice(cursor)
}

function maskValue(value: string, kind: ClipboardSecretKind): string {
  if (kind === 'private-key') return '私钥内容不予显示'
  if (kind === 'host-ip') {
    // 留最后一段，够用来认出「是不是我那台」，又不把整个地址摊开。
    const tail = value.slice(value.lastIndexOf('.') + 1)
    return `${'•'.repeat(Math.max(3, value.length - tail.length - 1))}.${tail}`
  }
  if (kind === 'connection-string') {
    return value.replace(/(\/\/[^:/@]+:)([^@]+)(@)/, (_, prefix: string, __: string, suffix: string) => {
      return `${prefix}${'•'.repeat(8)}${suffix}`
    })
  }

  const visible = Math.min(12, Math.max(4, Math.floor(value.length / 4)))
  const hidden = Math.min(20, Math.max(4, value.length - visible))
  return `${value.slice(0, visible)}${'•'.repeat(hidden)}`
}
