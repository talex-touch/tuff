import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import {
  getClipboardColorTokens,
  getClipboardOcrInsight,
  getClipboardRawTags,
  getClipboardTitle,
  parseFileList,
} from './clipboard-items'

/**
 * 一条内容可以同时属于多个形态——带 token 的 URL 既是 `link` 也是 `secret`。
 * 分类条按「包含」筛选，洞察区则只渲染优先级最高的那一个（见 selectClipboardInsight）。
 */
export type ClipboardShape =
  | 'text'
  | 'link'
  | 'image'
  | 'video'
  | 'files'
  | 'color'
  | 'command'
  | 'secret'
  | 'favorite'

export type ClipboardInsightKind =
  | 'ocr'
  | 'link'
  | 'secret'
  | 'command'
  | 'color'
  | 'chars'
  | 'words'
  | 'none'

export interface ClipboardSecretInfo {
  service: string
  kind: 'token' | 'private-key' | 'connection-string' | 'jwt' | 'env'
  /** 永远是脱敏后的展示值。私钥不在此处放任何正文片段。 */
  masked: string
  /**
   * 整条内容的脱敏呈现，供列表标题和预览区使用。
   * 和 `masked` 的区别只在 env：那里 `masked` 只是值，这里要带上键名才读得懂。
   */
  maskedContent: string
  length: number
  /** live 密钥、私钥、连接串这类「泄漏即事故」的，UI 上要额外红标。 */
  critical: boolean
  detail?: string
}

export interface ClipboardCommandInfo {
  program: string
  args: string
  pipe: string | null
  dangers: string[]
  containsCredential: boolean
}

export interface ClipboardLinkParam {
  key: string
  value: string
  sensitive: boolean
}

const PRIVATE_KEY_PATTERN = /-----BEGIN ([A-Z ]*)PRIVATE KEY-----/
const CONNECTION_STRING_PATTERN = /^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\//i
const SENSITIVE_ENV_KEY = /(SECRET|TOKEN|KEY|PASSWORD|PASSWD|CREDENTIAL)/
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi
const SENSITIVE_PARAM = /^(?:token|access_token|refresh_token|api_key|apikey|key|secret|password|passwd|pwd|auth|authorization|signature|sig)$/i

/**
 * 前缀表是「不误报」的全部依据：未命中这里的高熵字符串一律不算密钥。
 * 顺序有意义——`sk-ant-` 必须排在 `sk-` 前面。
 */
const SECRET_PATTERNS: Array<{
  service: string
  test: RegExp
  critical?: (value: string) => boolean
}> = [
  { service: 'GitHub', test: /^gh[pousr]_[A-Za-z0-9]{36}$/ },
  { service: 'GitHub', test: /^github_pat_[A-Za-z0-9_]{22,}$/ },
  { service: 'npm', test: /^npm_[A-Za-z0-9]{36}$/ },
  { service: 'Anthropic', test: /^sk-ant-[A-Za-z0-9_-]{20,}$/ },
  { service: 'OpenAI', test: /^sk-(?:proj-)?[A-Za-z0-9_-]{20,}$/ },
  { service: 'AWS', test: /^AKIA[0-9A-Z]{16}$/ },
  {
    service: 'Stripe',
    test: /^(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}$/,
    critical: value => value.includes('_live_'),
  },
  { service: 'Slack', test: /^xox[baprs]-[A-Za-z0-9-]{10,}$/ },
  { service: 'Google', test: /^AIza[0-9A-Za-z_-]{35}$/ },
]

const COMMAND_EXECUTABLES = new Set([
  'awk', 'brew', 'bun', 'cargo', 'cat', 'chmod', 'chown', 'code', 'cp', 'curl', 'dd', 'docker',
  'ffmpeg', 'find', 'git', 'go', 'grep', 'kubectl', 'launchctl', 'ls', 'make', 'mkdir', 'mkfs',
  'mv', 'mysql', 'node', 'npm', 'open', 'pip', 'pip3', 'pnpm', 'psql', 'python', 'python3',
  'redis-cli', 'rm', 'rsync', 'scp', 'sed', 'ssh', 'sudo', 'systemctl', 'tar', 'unzip', 'wget',
  'yarn', 'zip',
])

const DANGEROUS_COMMAND_PATTERNS: Array<{ label: string; test: RegExp }> = [
  { label: '递归删除', test: /\brm\s+-[a-zA-Z]*[rf]/ },
  { label: '提权执行', test: /\bsudo\b/ },
  { label: '开放全部权限', test: /\bchmod\s+(?:-R\s+)?777\b/ },
  { label: '管道执行远程脚本', test: /\|\s*(?:sudo\s+)?(?:sh|bash|zsh)\b/ },
  { label: '裸写磁盘', test: /\bdd\s+if=/ },
  { label: '格式化', test: /\bmkfs(?:\.\w+)?\b/ },
  { label: 'fork 炸弹', test: /:\s*\(\s*\)\s*\{.*\|.*&.*\}\s*;?\s*:/ },
]

const CREDENTIAL_IN_COMMAND =
  /(?:-H\s+["']?\s*authorization\s*:)|(?:-u\s+[^\s:]+:[^\s]+)|(?:bearer\s+[A-Za-z0-9._-]{16,})/i

const VIDEO_EXTENSIONS = /\.(?:mp4|mov|mkv|webm|avi|m4v)$/i

function maskSecret(value: string): string {
  const visible = Math.min(12, Math.max(4, Math.floor(value.length / 4)))
  const hidden = Math.min(20, Math.max(4, value.length - visible))
  return `${value.slice(0, visible)}${'•'.repeat(hidden)}`
}

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return atob(padded)
}

function detectJwt(value: string): ClipboardSecretInfo | null {
  const parts = value.split('.')
  if (parts.length !== 3) {
    return null
  }
  const [rawHeader, rawPayload] = parts
  if (!/^[A-Za-z0-9_-]+$/.test(rawHeader ?? '') || !/^[A-Za-z0-9_-]+$/.test(rawPayload ?? '')) {
    return null
  }

  try {
    const header = JSON.parse(decodeBase64Url(rawHeader as string)) as { alg?: unknown }
    if (typeof header.alg !== 'string') {
      return null
    }

    const payload = JSON.parse(decodeBase64Url(rawPayload as string)) as { exp?: unknown }
    const exp = typeof payload.exp === 'number' ? payload.exp : null
    const expired = exp !== null && exp * 1000 < Date.now()

    return {
      service: `JWT · ${header.alg}`,
      kind: 'jwt',
      masked: maskSecret(value),
      maskedContent: maskSecret(value),
      length: value.length,
      critical: false,
      detail: exp === null ? '无 exp 声明' : expired ? '已过期' : '未过期',
    }
  } catch {
    // 非法 JWT 不是密钥，降级交给后面的前缀表判断。
    return null
  }
}

function maskConnectionString(value: string): string {
  return value.replace(/(\/\/[^:/@]+:)([^@]+)(@)/, (_, prefix: string, _password: string, suffix: string) => {
    return `${prefix}${'•'.repeat(8)}${suffix}`
  })
}

export function detectSecret(rawContent: string | null | undefined): ClipboardSecretInfo | null {
  const content = rawContent ?? ''

  const privateKey = content.match(PRIVATE_KEY_PATTERN)
  if (privateKey) {
    const label = (privateKey[1] ?? '').trim()
    return {
      service: label ? `${label} 私钥` : '私钥',
      kind: 'private-key',
      // 私钥正文一个字符都不进 DOM，连掩码里的前缀都不给。
      masked: '私钥内容不予显示',
      maskedContent: '私钥内容不予显示',
      length: content.length,
      critical: true,
    }
  }

  const value = content.trim()
  if (!value || /\s/.test(value)) {
    return null
  }

  const envMatch = value.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/)
  if (envMatch && SENSITIVE_ENV_KEY.test(envMatch[1] as string)) {
    const envKey = envMatch[1] as string
    const secretValue = envMatch[2] as string
    return {
      service: envKey,
      kind: 'env',
      masked: maskSecret(secretValue),
      maskedContent: `${envKey}=${maskSecret(secretValue)}`,
      length: secretValue.length,
      critical: false,
    }
  }

  if (CONNECTION_STRING_PATTERN.test(value)) {
    const scheme = value.slice(0, value.indexOf(':'))
    return {
      service: `${scheme} 连接串`,
      kind: 'connection-string',
      masked: maskConnectionString(value),
      maskedContent: maskConnectionString(value),
      length: value.length,
      critical: true,
    }
  }

  const jwt = detectJwt(value)
  if (jwt) {
    return jwt
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test.test(value)) {
      return {
        service: pattern.service,
        kind: 'token',
        masked: maskSecret(value),
        maskedContent: maskSecret(value),
        length: value.length,
        critical: pattern.critical?.(value) ?? false,
      }
    }
  }

  return null
}

/**
 * 密钥记录里被 `detectSecret` 认定为「值」的那一段原文。
 *
 * 只在用户显式点开显示开关时才会被调用，所以刻意不做成 `ClipboardSecretInfo` 的字段——
 * 那个对象会被传进列表、洞察、更多信息各处，一旦带上明文就等于掩码没做。
 */
export function readSecretPlainValue(secret: ClipboardSecretInfo, rawContent: string | null | undefined): string {
  const content = rawContent ?? ''
  if (secret.kind === 'private-key') {
    return secret.maskedContent
  }
  if (secret.kind === 'env') {
    const separator = content.indexOf('=')
    return separator >= 0 ? content.slice(separator + 1).trim() : content.trim()
  }
  return content.trim()
}

/**
 * 列表标题：命中密钥就永远只给掩码，没有显示开关。
 * 列表是旁人扫一眼就能看到的表面，它和详情区的可见性不该共享同一个开关。
 */
export function getClipboardDisplayTitle(item: PluginClipboardItem): string {
  const secret = detectSecret(item.content)
  if (!secret) {
    return getClipboardTitle(item)
  }

  return getClipboardTitle({ ...item, content: secret.maskedContent })
}

/**
 * 详情预览区正文。`reveal` 由详情区那一个开关控制，私钥在这里就被吞掉，
 * 不依赖调用方记得「私钥不要渲染开关」。
 */
export function getClipboardPreviewText(
  item: PluginClipboardItem,
  reveal: boolean,
): string {
  const content = item.content ?? ''
  const secret = detectSecret(content)
  if (!secret) {
    return content
  }

  return reveal && secret.kind !== 'private-key' ? content : secret.maskedContent
}

/**
 * Cmd/Ctrl+Enter 的动作按内容类型分派，而不是永远复制。
 * 顺序即优先级；`copy` 是兜底，任何判定不出来的内容都落到它。
 */
export type ClipboardPrimaryAction =
  | { kind: 'open-link'; url: string }
  | { kind: 'preview-image' }
  | { kind: 'reveal-file'; path: string }
  | { kind: 'copy' }

export function resolveClipboardPrimaryAction(
  item: PluginClipboardItem | null | undefined,
): ClipboardPrimaryAction {
  if (!item) {
    return { kind: 'copy' }
  }

  if (item.type === 'image') {
    return { kind: 'preview-image' }
  }

  if (item.type === 'files') {
    const first = parseFileList(item.content)[0]
    return first ? { kind: 'reveal-file', path: first } : { kind: 'copy' }
  }

  const url = extractLinks(item.content)[0]
  return url ? { kind: 'open-link', url } : { kind: 'copy' }
}

export function getClipboardPrimaryActionLabel(action: ClipboardPrimaryAction): string {
  switch (action.kind) {
    case 'open-link':
      return '浏览器打开'
    case 'preview-image':
      return '预览'
    case 'reveal-file':
      return '在访达中显示'
    default:
      return '复制'
  }
}

export function detectCommand(rawContent: string | null | undefined): ClipboardCommandInfo | null {
  const content = (rawContent ?? '').trim()
  if (!content || content.length > 2000) {
    return null
  }

  const firstLine = (content.split(/\r?\n/)[0] ?? '').trim()
  const tokens = firstLine.split(/\s+/)
  const program = (tokens[0] ?? '').replace(/^.*\//, '')
  const structural = /(?:\|\s*\S|&&|\s>>?\s|2>&1)/.test(content)

  if (!COMMAND_EXECUTABLES.has(program)) {
    return null
  }
  if (tokens.length < 2 && !structural) {
    return null
  }

  const pipeIndex = content.indexOf('|')
  const pipe = pipeIndex >= 0 ? content.slice(pipeIndex).trim() : null
  const argsSource = pipeIndex >= 0 ? content.slice(0, pipeIndex) : content
  const args = argsSource.trim().slice(tokens[0]?.length ?? 0).trim()

  const dangers = DANGEROUS_COMMAND_PATTERNS.filter(pattern => pattern.test.test(content)).map(
    pattern => pattern.label,
  )
  const containsCredential = CREDENTIAL_IN_COMMAND.test(content)

  return { program, args, pipe, dangers, containsCredential }
}

export function extractLinks(rawContent: string | null | undefined): string[] {
  const matches = (rawContent ?? '').match(URL_PATTERN) ?? []
  const seen = new Set<string>()
  const links: string[] = []

  for (const raw of matches) {
    // 句末标点常被正则一起吃进来。
    const link = raw.replace(/[),.;!?]+$/, '')
    if (!seen.has(link)) {
      seen.add(link)
      links.push(link)
    }
  }

  return links
}

export function parseLinkParams(url: string): ClipboardLinkParam[] {
  try {
    const parsed = new URL(url)
    return Array.from(parsed.searchParams.entries()).map(([key, value]) => ({
      key,
      value,
      sensitive: SENSITIVE_PARAM.test(key),
    }))
  } catch {
    return []
  }
}

export function getLinkHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function buildCleanLink(url: string): string {
  try {
    const parsed = new URL(url)
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_PARAM.test(key)) {
        parsed.searchParams.delete(key)
      }
    }
    return parsed.toString()
  } catch {
    return url
  }
}

function hasVideoFile(item: PluginClipboardItem): boolean {
  return parseFileList(item.content).some(path => VIDEO_EXTENSIONS.test(path))
}

export function classifyClipboardItem(item: PluginClipboardItem): ClipboardShape[] {
  const shapes = new Set<ClipboardShape>()

  if (item.isFavorite) {
    shapes.add('favorite')
  }

  if (item.type === 'image') {
    shapes.add('image')
    return Array.from(shapes)
  }

  if (item.type === 'files') {
    shapes.add('files')
    if (hasVideoFile(item)) {
      shapes.add('video')
    }
    return Array.from(shapes)
  }

  shapes.add('text')

  const content = item.content ?? ''
  const tags = getClipboardRawTags(item)

  if (detectSecret(content) || tags.some(tag => /^(api_key|token|password)$/.test(tag))) {
    shapes.add('secret')
  }
  if (detectCommand(content)) {
    shapes.add('command')
  }
  if (extractLinks(content).length > 0 || tags.includes('url')) {
    shapes.add('link')
  }
  if (getClipboardColorTokens(item).length > 0) {
    shapes.add('color')
  }

  return Array.from(shapes)
}

/**
 * 字符网格只对验证码 / 编号 / 单个词这种场景有意义。
 *
 * 不能只用「没有空白」判断：中文没有词间空格，一整句话同样无空白，
 * 那样又会退回到「把一段中文拆成 20 个字符格」的老毛病。
 */
function isShortToken(content: string): boolean {
  const value = content.trim()
  if (!value || /\s/.test(value)) {
    return false
  }

  const graphemes = Array.from(value)
  if (graphemes.length > 32) {
    return false
  }

  // 验证码 / 编号 / 订单号：ASCII 词字符构成，拆字确实有用。
  if (/^[\w.:@/+-]+$/.test(value)) {
    return true
  }

  // 带句读的一律按长文本处理；只有很短、无标点的 CJK 片段才值得拆字。
  if (/[，。！？；：、“”‘’（）《》…—]/.test(value)) {
    return false
  }

  return graphemes.length <= 8
}

/**
 * 洞察区只渲染一个分区。优先级：密钥 > 命令 > 链接 > 颜色 > 短文本 > 长文本。
 * 图片先走 OCR，文件不给洞察（预览区的文件树本身就是内容）。
 */
export function selectClipboardInsight(
  item: PluginClipboardItem | null | undefined,
): ClipboardInsightKind {
  if (!item) {
    return 'none'
  }

  if (item.type === 'image') {
    return getClipboardOcrInsight(item) ? 'ocr' : 'none'
  }

  if (item.type === 'files') {
    return 'none'
  }

  const content = item.content ?? ''

  if (detectSecret(content)) {
    return 'secret'
  }
  if (detectCommand(content)) {
    return 'command'
  }
  if (extractLinks(content).length > 0) {
    return 'link'
  }
  if (getClipboardColorTokens(item).length > 0) {
    return 'color'
  }
  if (isShortToken(content)) {
    return 'chars'
  }

  return content ? 'words' : 'none'
}
