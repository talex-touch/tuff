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

const TAG_ORDER: ClipboardTag[] = [
  'url',
  'api_key',
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
  'email'
]

const URL_PATTERN = /\bhttps?:\/\/\S+/i
const WWW_PATTERN = /\bwww\.\S+/i
const EMAIL_PATTERN = /\b[\w.%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i

const API_KEY_FIELD_PATTERN =
  /\b(api[-_ ]?key|x-api-key|access[-_ ]?key|secret[-_ ]?key|client[-_ ]?secret)\b\s*(?:[:=]|is)\s*[\w\-]{8,}/i
const GENERIC_API_KEY_PREFIX_PATTERN = /\bsk-[A-Za-z0-9]{16,}\b/
const GITHUB_TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9_]{36}|github_pat_[A-Za-z0-9_]{22,255})\b/
const NPM_TOKEN_PATTERN = /\bnpm_[A-Za-z0-9]{36,}\b/
const OPENAI_API_KEY_PATTERN = /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/
const STRIPE_SECRET_KEY_PATTERN = /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/
const GOOGLE_API_KEY_PATTERN = /\bAIza[\w-]{35}\b/
const AWS_ACCESS_KEY_PATTERN = /\bAKIA[0-9A-Z]{16}\b/
const SLACK_TOKEN_PATTERN = /\b(?:xox[abprs]|xapp)-[A-Za-z0-9-]{10,}\b/
const WECHAT_MENTION_PATTERN = /(?:@(?:wx|wechat)\b|微信)/iu

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

  const hasGitHubToken = GITHUB_TOKEN_PATTERN.test(sample)
  const hasNpmToken = NPM_TOKEN_PATTERN.test(sample)
  const hasOpenAiApiKey = OPENAI_API_KEY_PATTERN.test(sample)
  const hasStripeSecretKey = STRIPE_SECRET_KEY_PATTERN.test(sample)
  const hasGoogleApiKey = GOOGLE_API_KEY_PATTERN.test(sample)
  const hasAwsAccessKey = AWS_ACCESS_KEY_PATTERN.test(sample)
  const hasSlackToken = SLACK_TOKEN_PATTERN.test(sample)
  const hasWeChatMention = WECHAT_MENTION_PATTERN.test(sample)

  if (
    API_KEY_FIELD_PATTERN.test(sample) ||
    GENERIC_API_KEY_PREFIX_PATTERN.test(sample) ||
    hasGitHubToken ||
    hasNpmToken ||
    hasOpenAiApiKey ||
    hasStripeSecretKey ||
    hasGoogleApiKey ||
    hasAwsAccessKey ||
    hasSlackToken
  ) {
    tags.add('api_key')
  }

  if (hasGitHubToken) tags.add('github')
  if (hasNpmToken) tags.add('npm')
  if (hasOpenAiApiKey) tags.add('openai')
  if (hasStripeSecretKey) tags.add('stripe')
  if (hasGoogleApiKey) tags.add('google')
  if (hasAwsAccessKey) tags.add('aws')
  if (hasSlackToken) tags.add('slack')
  if (hasWeChatMention) tags.add('wechat')

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

/**
 * Search terms persist beside classification tags so a query can match a known software alias
 * even when the copied text used another spelling.
 */
export function getClipboardTagSearchTerms(tags: readonly ClipboardTag[]): string[] {
  const terms = new Set<string>(tags)
  if (tags.includes('wechat')) {
    terms.add('wx')
    terms.add('wechat')
    terms.add('微信')
  }
  return [...terms]
}
