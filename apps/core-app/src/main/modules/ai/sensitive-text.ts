const CREDENTIAL_TEXT_PATTERNS: readonly RegExp[] = [
  /\b(?:sk|rk)[_-][A-Za-z0-9_-]{8,}\b/i,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/i,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/i,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/i,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}=*(?![A-Za-z0-9._~+\/-])/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b(?:api[_-]?key|access[_-]?key|token|secret|password|passwd|credential|authorization)\b\s*["']?\s*[:=]\s*["']?\s*\S+/i,
  /(?:恢复码|口令)\s*[:=：]\s*\S+/,
  /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/
]

const LOCAL_PATH_TEXT_PATTERNS: readonly RegExp[] = [
  /(?<![A-Za-z0-9_\/\\])file:\/\/[^\s"'`<>]+/i,
  /(?<![A-Za-z0-9_\/\\])(?:~[\\/]|\.{1,2}[\\/])[^\s"'`<>]+/,
  /(?<![A-Za-z0-9_\/\\])\/(?!\/)[^\s"'`<>]+/,
  /(?<![A-Za-z0-9_\/\\])[A-Za-z]:[\\/][^\s"'`<>]+/,
  /(?<![A-Za-z0-9_\/\\])\\\\[^\\\s"'`<>]+\\[^\s"'`<>]+/
]

const CREDENTIAL_KEY_SUFFIX_PATTERN =
  /(?:accesskey|apikey|authorization|authref|clientsecret|cookie|credential|idtoken|passwd|password|privatekey|refreshtoken|secret|token)$/
const CREDENTIAL_KEY_PREFIX_PATTERN =
  /^(?:authorization|authref|clientsecret|cookie|credential|passwd|password|privatekey|secret)/
const LOCAL_PATH_KEY_SUFFIX_PATTERN =
  /(?:cwd|destination|directory|dir|filename|filepath|file|folder|path|root|source)$/
const MAX_SENSITIVE_JSON_TEXT_CHARS = 32 * 1024
const MAX_SENSITIVE_JSON_TOTAL_CHARS = 64 * 1024
const MAX_SENSITIVE_TEXT_SCAN_CHARS = 64 * 1024
const MAX_SENSITIVE_JSON_DEPTH = 8
const MAX_SENSITIVE_JSON_PARSE_COUNT = 16
const MAX_SENSITIVE_JSON_NODES = 512
const MAX_SENSITIVE_JSON_CONTAINER_ENTRIES = 100

type TextClassifier = (content: string) => boolean

function matchesAnyPattern(content: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(content))
}

function normalizeJsonKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

export function isCredentialLikeKey(key: string): boolean {
  const normalized = normalizeJsonKey(key)
  return (
    CREDENTIAL_KEY_SUFFIX_PATTERN.test(normalized) || CREDENTIAL_KEY_PREFIX_PATTERN.test(normalized)
  )
}

export function isLocalPathLikeKey(key: string): boolean {
  return LOCAL_PATH_KEY_SUFFIX_PATTERN.test(normalizeJsonKey(key))
}

function jsonTextBounds(content: string): readonly [start: number, end: number] | undefined {
  let start = 0
  let end = content.length
  while (start < end && /[\t\n\r ]/.test(content[start])) start += 1
  while (end > start && /[\t\n\r ]/.test(content[end - 1])) end -= 1
  if (end - start < 2) return undefined

  const first = content[start]
  const last = content[end - 1]
  return (first === '{' && last === '}') ||
    (first === '[' && last === ']') ||
    (first === '"' && last === '"')
    ? [start, end]
    : undefined
}

function containsSensitiveJsonText(
  content: string,
  matchesText: TextClassifier,
  matchesKey: TextClassifier
): boolean {
  const initialBounds = jsonTextBounds(content)
  if (!initialBounds) return false

  const pending: Array<{ value: unknown; depth: number }> = [{ value: content, depth: 0 }]
  let inspectedNodes = 0
  let parsedChars = 0
  let parseCount = 0

  while (pending.length > 0) {
    const current = pending.pop()!
    inspectedNodes += 1
    if (inspectedNodes > MAX_SENSITIVE_JSON_NODES || current.depth > MAX_SENSITIVE_JSON_DEPTH) {
      return true
    }

    if (typeof current.value === 'string') {
      if (matchesText(current.value)) return true
      const bounds = jsonTextBounds(current.value)
      if (!bounds) continue
      const candidateLength = bounds[1] - bounds[0]
      if (
        candidateLength > MAX_SENSITIVE_JSON_TEXT_CHARS ||
        parsedChars + candidateLength > MAX_SENSITIVE_JSON_TOTAL_CHARS ||
        parseCount >= MAX_SENSITIVE_JSON_PARSE_COUNT
      ) {
        return true
      }

      parsedChars += candidateLength
      parseCount += 1
      try {
        const candidate = current.value.slice(bounds[0], bounds[1])
        const parsed = JSON.parse(candidate) as unknown
        pending.push({ value: parsed, depth: current.depth + 1 })
      } catch {
        // Matching delimiters alone do not make ordinary text valid JSON.
      }
      continue
    }

    if (!current.value || typeof current.value !== 'object') continue
    if (Array.isArray(current.value)) {
      if (current.value.length > MAX_SENSITIVE_JSON_CONTAINER_ENTRIES) return true
      for (const value of current.value) {
        pending.push({ value, depth: current.depth + 1 })
      }
      continue
    }

    const entries = Object.entries(current.value as Record<string, unknown>)
    if (entries.length > MAX_SENSITIVE_JSON_CONTAINER_ENTRIES) return true
    for (const [key, value] of entries) {
      if (matchesText(key) || matchesKey(key)) return true
      pending.push({ value, depth: current.depth + 1 })
    }
  }

  return false
}

export function containsCredentialLikeText(content: string): boolean {
  if (content.length > MAX_SENSITIVE_TEXT_SCAN_CHARS) return true
  const matchesCredential = (value: string): boolean =>
    matchesAnyPattern(value, CREDENTIAL_TEXT_PATTERNS)
  return (
    matchesCredential(content) ||
    containsSensitiveJsonText(content, matchesCredential, isCredentialLikeKey)
  )
}

export function containsLocalPathLikeText(content: string): boolean {
  if (content.length > MAX_SENSITIVE_TEXT_SCAN_CHARS) return true
  const matchesLocalPath = (value: string): boolean =>
    matchesAnyPattern(value, LOCAL_PATH_TEXT_PATTERNS)
  return (
    matchesLocalPath(content) ||
    containsSensitiveJsonText(content, matchesLocalPath, isLocalPathLikeKey)
  )
}
