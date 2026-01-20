export type ClipboardTag = 'url' | 'api_key' | 'password' | 'account' | 'email' | 'token'

const TAG_ORDER: ClipboardTag[] = ['url', 'api_key', 'token', 'password', 'account', 'email']

const URL_PATTERN = /\bhttps?:\/\/\S+/i
const WWW_PATTERN = /\bwww\.\S+/i
const EMAIL_PATTERN = /\b[\w.%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i

const API_KEY_FIELD_PATTERN =
  /\b(api[-_ ]?key|x-api-key|access[-_ ]?key|secret[-_ ]?key|client[-_ ]?secret)\b\s*(?:[:=]|is)\s*[\w\-]{8,}/i
const API_KEY_PREFIX_PATTERN =
  /\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{36}|AIza[\w\-]{35}|AKIA[0-9A-Z]{16})\b/

const TOKEN_FIELD_PATTERN = /\b(token|bearer)\b\s*(?:[:=]|is)\s*[\w\-.=]{8,}/i
const BEARER_PATTERN = /\bbearer\s+[\w\-.=]{8,}\b/i

const PASSWORD_FIELD_PATTERN = /\b(pass(word)?|passwd|pwd)\b\s*(?:[:=]|is)\s*\S+/i
const ACCOUNT_FIELD_PATTERN = /\b(user(name)?|account|login)\b\s*(?:[:=]|is)\s*\S+/i

export function detectClipboardTags(payload: {
  type: 'text' | 'image' | 'files'
  content: string
  rawContent?: string | null
}): ClipboardTag[] {
  if (payload.type !== 'text') return []

  const trimmed = (payload.content ?? '').trim()
  if (!trimmed) return []

  const sample = trimmed.length > 5000 ? trimmed.slice(0, 5000) : trimmed
  const tags = new Set<ClipboardTag>()

  if (URL_PATTERN.test(sample) || WWW_PATTERN.test(sample)) {
    tags.add('url')
  }

  if (EMAIL_PATTERN.test(sample)) {
    tags.add('email')
  }

  if (API_KEY_FIELD_PATTERN.test(sample) || API_KEY_PREFIX_PATTERN.test(sample)) {
    tags.add('api_key')
  }

  if (TOKEN_FIELD_PATTERN.test(sample) || BEARER_PATTERN.test(sample)) {
    tags.add('token')
  }

  if (PASSWORD_FIELD_PATTERN.test(sample)) {
    tags.add('password')
  }

  if (ACCOUNT_FIELD_PATTERN.test(sample)) {
    tags.add('account')
  }

  return TAG_ORDER.filter((tag) => tags.has(tag))
}
