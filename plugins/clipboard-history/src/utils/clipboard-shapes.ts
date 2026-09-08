import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import type { ClipboardSecretHit } from '@talex-touch/utils/clipboard'
import { classifyClipboardContent, maskSecretSpans } from '@talex-touch/utils/clipboard'
import {
  getClipboardColorTokens,
  getClipboardOcrInsight,
  getClipboardRawTags,
  getClipboardTitle,
  parseFileList,
  splitWordTokens,
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
  | 'words'
  | 'none'

export interface ClipboardSecretInfo {
  service: string
  kind: 'token' | 'private-key' | 'connection-string' | 'jwt' | 'env'
  /** 永远是脱敏后的展示值。私钥不在此处放任何正文片段。 */
  masked: string
  /**
   * 整条内容的脱敏呈现，供列表标题和预览区使用。
   * 和 `masked` 的区别在于：正文里嵌了密钥时，这里是整条内容、只有命中的那一段被打码。
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

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi
const SENSITIVE_PARAM = /^(?:token|access_token|refresh_token|api_key|apikey|key|secret|password|passwd|pwd|auth|authorization|signature|sig)$/i

/**
 * 前缀表是「不误报」的全部依据：未命中这里的高熵字符串一律不算密钥。
 * 顺序有意义——`sk-ant-` 必须排在 `sk-` 前面。
 */

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

/** 共享分类器的 kind 比这里多两档（字段式的 token / password），映射到最接近的展示形态。 */
const SECRET_KIND_MAP: Record<ClipboardSecretHit['kind'], ClipboardSecretInfo['kind']> = {
  'api-key': 'token',
  'private-key': 'private-key',
  jwt: 'jwt',
  'connection-string': 'connection-string',
  env: 'env',
  'token-field': 'token',
  'password-field': 'token',
}

/**
 * JWT 是否过期，只用于洞察区那行副标题。
 *
 * 刻意留在插件侧而不是推进共享分类器：共享的那份只回答「是不是密钥、在哪一段」，
 * 主进程不需要知道一个 token 的 exp，把 base64 解码也塞进去只会让两边都背上不用的代码。
 */
function describeJwt(value: string): string | undefined {
  const parts = value.split('.')
  if (parts.length !== 3) {
    return undefined
  }

  try {
    const normalized = (parts[1] as string).replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as {
      exp?: unknown
    }
    if (typeof payload.exp !== 'number') {
      return '无 exp 声明'
    }
    return payload.exp * 1000 < Date.now() ? '已过期' : '未过期'
  } catch {
    return undefined
  }
}

/**
 * 密钥判定。实现在 `@talex-touch/utils/clipboard`，主进程用的是同一份。
 *
 * 这里以前是一张独立的正则表，且只认「整条内容就是密钥」——所以 `api_key: sk-xxx`
 * 写在句子里时，主进程给它挂上「API 密钥」标签，这里却判定为否、把 key 明文渲染了
 * 出来。现在按 span 判定，嵌在正文里的同样会被打码。
 */
export function detectSecret(rawContent: string | null | undefined): ClipboardSecretInfo | null {
  const content = rawContent ?? ''
  if (!content) {
    return null
  }

  const { secrets } = classifyClipboardContent({ type: 'text', content })
  // 一条内容可能命中多段；洞察区只讲一件事，优先讲最危险的那一段。
  const primary = secrets.find(hit => hit.critical) ?? secrets[0]
  if (!primary) {
    return null
  }

  const value = content.slice(primary.start, primary.end)
  const detail = primary.kind === 'jwt' ? describeJwt(value) : undefined

  return {
    service: primary.service ?? 'API 密钥（未识别服务）',
    kind: SECRET_KIND_MAP[primary.kind],
    masked: maskSecretSpans(value, [{ ...primary, start: 0, end: value.length }]),
    maskedContent: maskSecretSpans(content, secrets),
    length: value.length,
    critical: primary.critical,
    ...(detail === undefined ? {} : { detail }),
  }
}

/**
 * 密钥记录里被认定为「值」的那一段原文。
 *
 * 只在用户显式点开显示开关时才会被调用，所以刻意不做成 `ClipboardSecretInfo` 的字段——
 * 那个对象会被传进列表、洞察、更多信息各处，一旦带上明文就等于掩码没做。
 */
export function readSecretPlainValue(secret: ClipboardSecretInfo, rawContent: string | null | undefined): string {
  const content = rawContent ?? ''
  if (secret.kind === 'private-key') {
    return secret.maskedContent
  }

  const { secrets } = classifyClipboardContent({ type: 'text', content })
  const primary = secrets.find(hit => hit.critical) ?? secrets[0]
  return primary ? content.slice(primary.start, primary.end) : content.trim()
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
 * 洞察区只渲染一个分区。优先级：密钥 > 命令 > 链接 > 颜色 > 文本拆词。
 * 图片先走 OCR，文件不给洞察（预览区的文件树本身就是内容）。
 *
 * 曾经在这之前还有一档 `chars`（把短内容拆成单字符网格）。拆字对任何内容都没有
 * 使用价值——验证码该被识别成验证码，不是被拆成六个数字格——所以整档去掉了。
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

  // 拆词结果只有整条内容本身时不出分区：一个和原文一模一样的词块是纯噪音。
  return hasUsefulWordSplit(content) ? 'words' : 'none'
}

/**
 * 拆词是否值得渲染。拆出来只有整条内容本身时等于没拆——验证码、编号、单个英文词
 * 都会落到这里，它们该被识别成对应的形态，而不是回一个和原文一模一样的词块。
 */
function hasUsefulWordSplit(content: string): boolean {
  const words = splitWordTokens(content)
  if (words.length === 0) {
    return false
  }
  return words.length > 1 || words[0] !== content.trim()
}
