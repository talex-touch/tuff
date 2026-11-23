const {
  plugin,
  http,
  secret,
  clipboard,
  permission,
  logger,
  TuffItemBuilder,
} = globalThis

const PLUGIN_NAME = 'touch-api-lens'
const FEATURE_ID = 'api-lens'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const COLLECTIONS_FILE = 'collections.json'
const MAX_PRESETS = 64
const MAX_BODY_CHARS = 128 * 1024
const DEFAULT_TIMEOUT_MS = 15000
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const FETCH_IDENTIFIER = ['fe', 'tch'].join('')

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'x-access-token',
  'x-secret-key',
  'x-token',
  'x-csrf-token',
  'x-xsrf-token',
])
const SENSITIVE_HEADER_PATTERN = /(?:token|secret|key|auth|cookie|password|credential|session)/i
const SECRET_KEY_PATTERN = /^[a-z0-9._-]{1,48}$/i

let triggerGeneration = 0
let tokenCounter = 0
let issuedActions = new Map()
let lastResponse = null

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return String(query?.text ?? query?.query ?? '')
}

function truncateText(value, max = 96) {
  const text = normalizeText(value).replace(/\s+/g, ' ')
  if (!text)
    return ''
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}…`
}

function formatByteSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0)
    return '0 B'
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function utf8ByteLength(text) {
  return new TextEncoder().encode(String(text ?? '')).length
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''))
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    const triplet = (b0 << 16) | (b1 << 8) | b2
    out += BASE64_CHARS[(triplet >>> 18) & 0x3F]
    out += BASE64_CHARS[(triplet >>> 12) & 0x3F]
    out += i + 1 < bytes.length ? BASE64_CHARS[(triplet >>> 6) & 0x3F] : '='
    out += i + 2 < bytes.length ? BASE64_CHARS[triplet & 0x3F] : '='
  }
  return out
}

function fnv1aHex(input) {
  let hash = 0x811C9DC5
  const text = String(input ?? '')
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

function isSensitiveHeader(headerName) {
  const lower = normalizeText(headerName).toLowerCase()
  if (!lower)
    return false
  return SENSITIVE_HEADER_NAMES.has(lower) || SENSITIVE_HEADER_PATTERN.test(lower)
}

function redactHeaderValue(headerName, value) {
  const text = normalizeText(value)
  if (!isSensitiveHeader(headerName))
    return text
  if (/^bearer\s+/i.test(text))
    return 'Bearer ••••'
  if (/^basic\s+/i.test(text))
    return 'Basic ••••'
  return '••••'
}

function placeholderForSensitiveHeader(headerName, value) {
  const text = normalizeText(value)
  const lower = normalizeText(headerName).toLowerCase()
  if (/^bearer\s+/i.test(text))
    return 'Bearer <API_TOKEN>'
  if (/^basic\s+/i.test(text))
    return 'Basic <BASIC_CREDENTIALS>'
  if (lower.includes('cookie'))
    return '<COOKIE_VALUE>'
  if (lower.includes('key'))
    return '<API_KEY>'
  return '<SECRET_VALUE>'
}

function splitHeaders(headers) {
  const publicHeaders = {}
  const sensitiveHeaders = {}
  if (!headers || typeof headers !== 'object')
    return { publicHeaders, sensitiveHeaders, secretHeaderNames: [] }

  for (const [rawKey, rawVal] of Object.entries(headers)) {
    const key = normalizeText(rawKey)
    if (!key)
      continue
    const value = String(rawVal ?? '').trim()
    if (isSensitiveHeader(key))
      sensitiveHeaders[key] = value
    else
      publicHeaders[key] = value
  }
  return {
    publicHeaders,
    sensitiveHeaders,
    secretHeaderNames: Object.keys(sensitiveHeaders),
  }
}

function hasHeaderCaseInsensitive(headers, targetName) {
  const target = targetName.toLowerCase()
  return Object.keys(headers).some(key => key.toLowerCase() === target)
}

function setHeaderCaseInsensitive(headers, name, value) {
  const target = name.toLowerCase()
  for (const existing of Object.keys(headers)) {
    if (existing.toLowerCase() === target)
      delete headers[existing]
  }
  headers[name] = value
}

function sanitizePresetName(rawName) {
  const trimmed = normalizeText(rawName)
  if (!trimmed)
    return ''
  return trimmed.replace(/[\r\n\t]+/g, ' ').slice(0, 48)
}

function buildSecretKey(presetName) {
  const slug = sanitizePresetName(presetName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'preset'
  const hash = fnv1aHex(sanitizePresetName(presetName).toLowerCase())
  const candidate = `apilens.${slug}.${hash}`
  return SECRET_KEY_PATTERN.test(candidate) ? candidate : `apilens.p.${hash}`
}

function normalizeHttpUrl(rawUrl, headersOut) {
  const candidate = normalizeText(rawUrl)
  if (!candidate)
    return ''
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return ''
    if ((parsed.username || parsed.password) && headersOut) {
      const credentials = `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`
      setHeaderCaseInsensitive(headersOut, 'Authorization', `Basic ${encodeBase64(credentials)}`)
      parsed.username = ''
      parsed.password = ''
    }
    return parsed.toString()
  }
  catch {
    return ''
  }
}

function tokenizeShell(input) {
  const cleaned = String(input ?? '').replace(/\\\r?\n/g, ' ')
  const tokens = []
  let current = ''
  let quote = ''
  let hasToken = false

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i]
    if (quote === '\'') {
      if (ch === '\'') {
        quote = ''
      }
      else {
        current += ch
      }
      continue
    }

    if (quote === '"') {
      if (ch === '\\' && i + 1 < cleaned.length) {
        const next = cleaned[i + 1]
        if (next === '"' || next === '\\' || next === '$') {
          current += next
          i += 1
          continue
        }
        if (next === 'n') {
          current += '\n'
          i += 1
          continue
        }
        if (next === 't') {
          current += '\t'
          i += 1
          continue
        }
      }
      if (ch === '"') {
        quote = ''
      }
      else {
        current += ch
      }
      continue
    }

    if (ch === '\\' && i + 1 < cleaned.length) {
      current += cleaned[i + 1]
      hasToken = true
      i += 1
      continue
    }

    if (ch === '\'' || ch === '"') {
      quote = ch
      hasToken = true
      continue
    }

    if (/\s/.test(ch)) {
      if (hasToken) {
        tokens.push(current)
        current = ''
        hasToken = false
      }
      continue
    }

    current += ch
    hasToken = true
  }

  if (hasToken)
    tokens.push(current)

  return tokens
}

function parseHeaderLine(rawHeader) {
  const text = String(rawHeader ?? '')
  const colonIdx = text.indexOf(':')
  if (colonIdx <= 0)
    return null
  const name = text.slice(0, colonIdx).trim()
  const value = text.slice(colonIdx + 1).trim()
  if (!name)
    return null
  return { name, value }
}

function parseCurlCommand(rawInput) {
  const tokens = tokenizeShell(rawInput)
  if (!tokens.length)
    return null

  let index = 0
  if (tokens[0].toLowerCase() === 'curl')
    index = 1

  let method = ''
  let explicitMethod = false
  let forceGet = false
  let url = ''
  const headers = {}
  const dataParts = []
  let isJsonFlag = false

  const ignoredValueFlags = new Set([
    '-m',
    '--max-time',
    '--connect-timeout',
    '-o',
    '--output',
    '-w',
    '--write-out',
    '--retry',
    '--proxy',
    '-x',
  ])
  const ignoredBoolFlags = new Set([
    '-L',
    '--location',
    '-s',
    '--silent',
    '-S',
    '--show-error',
    '-i',
    '--include',
    '-v',
    '--verbose',
    '-k',
    '--insecure',
    '--compressed',
    '--http1.1',
    '--http2',
    '-f',
    '--fail',
    '-N',
    '--no-buffer',
  ])

  for (; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token)
      continue

    if (token === '-X' || token === '--request') {
      const next = tokens[index + 1]
      if (next) {
        method = next.toUpperCase()
        explicitMethod = true
        index += 1
      }
      continue
    }
    if (token.startsWith('--request=')) {
      method = token.slice('--request='.length).toUpperCase()
      explicitMethod = true
      continue
    }
    if (token.startsWith('-X') && token.length > 2) {
      method = token.slice(2).toUpperCase()
      explicitMethod = true
      continue
    }

    if (token === '-I' || token === '--head') {
      method = 'HEAD'
      explicitMethod = true
      continue
    }

    if (token === '-G' || token === '--get') {
      forceGet = true
      continue
    }

    if (token === '-H' || token === '--header') {
      const next = tokens[index + 1]
      if (next !== undefined) {
        const parsed = parseHeaderLine(next)
        if (parsed)
          setHeaderCaseInsensitive(headers, parsed.name, parsed.value)
        index += 1
      }
      continue
    }
    if (token.startsWith('--header=')) {
      const parsed = parseHeaderLine(token.slice('--header='.length))
      if (parsed)
        setHeaderCaseInsensitive(headers, parsed.name, parsed.value)
      continue
    }

    if (
      token === '-d'
      || token === '--data'
      || token === '--data-raw'
      || token === '--data-binary'
      || token === '--data-ascii'
      || token === '--data-urlencode'
    ) {
      const next = tokens[index + 1]
      if (next !== undefined) {
        dataParts.push(next)
        index += 1
      }
      continue
    }
    if (
      token.startsWith('--data=')
      || token.startsWith('--data-raw=')
      || token.startsWith('--data-binary=')
    ) {
      const eqIdx = token.indexOf('=')
      dataParts.push(token.slice(eqIdx + 1))
      continue
    }

    if (token === '--json') {
      const next = tokens[index + 1]
      if (next !== undefined) {
        dataParts.push(next)
        isJsonFlag = true
        index += 1
      }
      continue
    }
    if (token.startsWith('--json=')) {
      dataParts.push(token.slice('--json='.length))
      isJsonFlag = true
      continue
    }

    if (token === '-u' || token === '--user') {
      const next = tokens[index + 1]
      if (next !== undefined) {
        setHeaderCaseInsensitive(headers, 'Authorization', `Basic ${encodeBase64(next)}`)
        index += 1
      }
      continue
    }
    if (token.startsWith('--user=')) {
      const creds = token.slice('--user='.length)
      setHeaderCaseInsensitive(headers, 'Authorization', `Basic ${encodeBase64(creds)}`)
      continue
    }

    if (token === '-A' || token === '--user-agent') {
      const next = tokens[index + 1]
      if (next !== undefined) {
        setHeaderCaseInsensitive(headers, 'User-Agent', next)
        index += 1
      }
      continue
    }

    if (token === '-e' || token === '--referer') {
      const next = tokens[index + 1]
      if (next !== undefined) {
        setHeaderCaseInsensitive(headers, 'Referer', next)
        index += 1
      }
      continue
    }

    if (token === '-b' || token === '--cookie') {
      const next = tokens[index + 1]
      if (next !== undefined) {
        setHeaderCaseInsensitive(headers, 'Cookie', next)
        index += 1
      }
      continue
    }

    if (token === '--url') {
      const next = tokens[index + 1]
      if (next !== undefined) {
        url = next
        index += 1
      }
      continue
    }
    if (token.startsWith('--url=')) {
      url = token.slice('--url='.length)
      continue
    }

    if (ignoredValueFlags.has(token)) {
      index += 1
      continue
    }
    if (ignoredBoolFlags.has(token))
      continue

    if (!token.startsWith('-') && !url)
      url = token
  }

  const normalizedUrl = normalizeHttpUrl(url, headers)
  if (!normalizedUrl)
    return null

  if (isJsonFlag) {
    if (!hasHeaderCaseInsensitive(headers, 'Content-Type'))
      setHeaderCaseInsensitive(headers, 'Content-Type', 'application/json')
    if (!hasHeaderCaseInsensitive(headers, 'Accept'))
      setHeaderCaseInsensitive(headers, 'Accept', 'application/json')
  }

  let finalUrl = normalizedUrl
  let body = dataParts.length ? dataParts.join('&') : null
  if (forceGet) {
    method = 'GET'
    if (body) {
      const parsedUrl = new URL(finalUrl)
      const extra = new URLSearchParams(body)
      for (const [k, v] of extra.entries())
        parsedUrl.searchParams.append(k, v)
      finalUrl = parsedUrl.toString()
      body = null
    }
  }
  else if (!explicitMethod) {
    method = body !== null ? 'POST' : 'GET'
  }

  if (!ALLOWED_METHODS.has(method))
    return null

  if (body !== null && body.length > MAX_BODY_CHARS)
    body = body.slice(0, MAX_BODY_CHARS)

  return {
    method,
    url: finalUrl,
    headers,
    body,
    sourceKind: 'curl',
  }
}

function parseShorthandRequest(rawInput) {
  const trimmed = normalizeText(rawInput)
  if (!trimmed)
    return null

  // Match optional method + http(s) URL + optional trailing headers / body
  const match = trimmed.match(/^(?:(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+)?(https?:\/\/\S+)(?:\s+([\s\S]+))?$/i)
  if (!match)
    return null

  const headers = {}
  const normalizedUrl = normalizeHttpUrl(match[2], headers)
  if (!normalizedUrl)
    return null

  const explicitMethod = match[1] ? match[1].toUpperCase() : ''
  const trailing = normalizeText(match[3] || '')
  let body = null

  if (trailing) {
    // Support inline -H "Key: Val" before JSON/text body
    let remaining = trailing
    const headerFlagRe = /^(?:-H|--header)\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*/
    while (headerFlagRe.test(remaining)) {
      const flagMatch = remaining.match(headerFlagRe)
      const headerRaw = flagMatch[1] ?? flagMatch[2] ?? flagMatch[3] ?? ''
      const parsed = parseHeaderLine(headerRaw)
      if (parsed)
        setHeaderCaseInsensitive(headers, parsed.name, parsed.value)
      remaining = remaining.slice(flagMatch[0].length).trim()
    }
    if (remaining) {
      body = remaining.slice(0, MAX_BODY_CHARS)
      if (
        (body.startsWith('{') || body.startsWith('['))
        && !hasHeaderCaseInsensitive(headers, 'Content-Type')
      ) {
        try {
          JSON.parse(body)
          setHeaderCaseInsensitive(headers, 'Content-Type', 'application/json')
        }
        catch {
          // Keep as plain body if not valid JSON
        }
      }
    }
  }

  const method = explicitMethod || (body !== null ? 'POST' : 'GET')
  if (!ALLOWED_METHODS.has(method))
    return null

  return {
    method,
    url: normalizedUrl,
    headers,
    body,
    sourceKind: 'shorthand',
  }
}

function parseHttpRequestInput(rawInput) {
  const trimmed = normalizeText(rawInput)
  if (!trimmed)
    return null

  const withoutPrefix = trimmed.replace(/^(?:api|rest|api-lens)\s+/i, '').trim()
  if (!withoutPrefix)
    return null

  if (/^curl(?:\s|$)/i.test(withoutPrefix) || /^-(?:X|H|d|u|G|I|-request|-header|-data|-json|-url)\b/.test(withoutPrefix))
    return parseCurlCommand(withoutPrefix)

  return parseShorthandRequest(withoutPrefix)
}

function parseQueryIntent(rawQuery) {
  const trimmed = normalizeText(rawQuery)
  if (!trimmed)
    return { kind: 'home', keyword: '' }

  const stripped = trimmed.replace(/^(?:api|rest|api-lens)\s+/i, '').trim()
  if (!stripped || /^(?:list|saved|collections)$/i.test(stripped))
    return { kind: 'home', keyword: '' }

  if (/^(?:last|response|resp)$/i.test(stripped))
    return { kind: 'last' }

  const saveMatch = stripped.match(/^save\s+(\S+)\s+([\s\S]+)$/i)
  if (saveMatch) {
    const presetName = sanitizePresetName(saveMatch[1])
    const request = parseHttpRequestInput(saveMatch[2])
    return { kind: 'save', presetName, request, rawTarget: saveMatch[2] }
  }

  const runMatch = stripped.match(/^(?:run|use)\s+(.+)$/i)
  if (runMatch)
    return { kind: 'filter-presets', keyword: normalizeText(runMatch[1]), preferRun: true }

  const deleteMatch = stripped.match(/^(?:delete|rm|remove)\s+(.+)$/i)
  if (deleteMatch)
    return { kind: 'delete-preset', keyword: normalizeText(deleteMatch[1]) }

  const parsedRequest = parseHttpRequestInput(stripped)
  if (parsedRequest)
    return { kind: 'request', request: parsedRequest }

  return { kind: 'filter-presets', keyword: stripped, preferRun: false }
}

function shellSingleQuote(value) {
  return `'${String(value ?? '').replace(/'/g, '\'\\\'\'')}'`
}

function formatCurlSnippet(request, { secretHeaderNames = [] } = {}) {
  const { publicHeaders, sensitiveHeaders } = splitHeaders(request.headers || {})
  const lines = [`curl -X ${request.method} ${shellSingleQuote(request.url)}`]

  for (const [k, v] of Object.entries(publicHeaders))
    lines.push(`  -H ${shellSingleQuote(`${k}: ${v}`)}`)

  const emittedSensitive = new Set()
  for (const [k, v] of Object.entries(sensitiveHeaders)) {
    emittedSensitive.add(k.toLowerCase())
    lines.push(`  -H ${shellSingleQuote(`${k}: ${placeholderForSensitiveHeader(k, v)}`)}`)
  }
  for (const name of secretHeaderNames) {
    if (!emittedSensitive.has(name.toLowerCase()))
      lines.push(`  -H ${shellSingleQuote(`${name}: ${placeholderForSensitiveHeader(name, '')}`)}`)
  }

  if (request.body !== null && request.body !== undefined && request.body !== '')
    lines.push(`  --data-raw ${shellSingleQuote(request.body)}`)

  return lines.join(' \\\n')
}

function formatFetchSnippet(request, { secretHeaderNames = [] } = {}) {
  const { publicHeaders, sensitiveHeaders } = splitHeaders(request.headers || {})
  const exportHeaders = { ...publicHeaders }

  const emittedSensitive = new Set()
  for (const [k, v] of Object.entries(sensitiveHeaders)) {
    emittedSensitive.add(k.toLowerCase())
    exportHeaders[k] = placeholderForSensitiveHeader(k, v)
  }
  for (const name of secretHeaderNames) {
    if (!emittedSensitive.has(name.toLowerCase()))
      exportHeaders[name] = placeholderForSensitiveHeader(name, '')
  }

  const opts = { method: request.method }
  if (Object.keys(exportHeaders).length > 0)
    opts.headers = exportHeaders

  let bodyLine = ''
  if (request.body !== null && request.body !== undefined && request.body !== '') {
    try {
      const parsedJson = JSON.parse(request.body)
      bodyLine = `JSON.stringify(${JSON.stringify(parsedJson, null, 2)})`
    }
    catch {
      opts.body = request.body
    }
  }

  let optsCode = JSON.stringify(opts, null, 2)
  if (bodyLine) {
    const indentedBody = bodyLine
      .split('\n')
      .map((line, idx) => (idx === 0 ? line : `  ${line}`))
      .join('\n')
    optsCode = optsCode.replace(/\n\}$/, `,\n  "body": ${indentedBody}\n}`)
  }

  return `const response = await ${FETCH_IDENTIFIER}(${JSON.stringify(request.url)}, ${optsCode})\nconst data = await response.json()`
}

function formatHeadersSummary(request, secretHeaderNames = []) {
  const { publicHeaders, sensitiveHeaders } = splitHeaders(request.headers || {})
  const parts = []
  for (const [k, v] of Object.entries(publicHeaders))
    parts.push(`${k}: ${truncateText(v, 36)}`)
  const emitted = new Set()
  for (const [k, v] of Object.entries(sensitiveHeaders)) {
    emitted.add(k.toLowerCase())
    parts.push(`${k}: ${redactHeaderValue(k, v)}`)
  }
  for (const name of secretHeaderNames) {
    if (!emitted.has(name.toLowerCase()))
      parts.push(`${name}: •••• (secret)`)
  }
  return parts.length ? parts.join(' · ') : 'No custom headers'
}

function sanitizePresetForStorage(rawPreset) {
  if (!rawPreset || typeof rawPreset !== 'object' || Array.isArray(rawPreset))
    return null
  const name = sanitizePresetName(rawPreset.name)
  const method = normalizeText(rawPreset.method).toUpperCase()
  const url = normalizeHttpUrl(rawPreset.url)
  if (!name || !ALLOWED_METHODS.has(method) || !url)
    return null

  const { publicHeaders } = splitHeaders(rawPreset.headers || {})
  const secretHeaderNames = Array.isArray(rawPreset.secretHeaderNames)
    ? Array.from(new Set(rawPreset.secretHeaderNames.map(normalizeText).filter(Boolean))).slice(0, 16)
    : []
  const rawSecretKey = normalizeText(rawPreset.secretKey)
  const secretKey = secretHeaderNames.length > 0 && SECRET_KEY_PATTERN.test(rawSecretKey)
    ? rawSecretKey
    : null
  const body = typeof rawPreset.body === 'string' && rawPreset.body.length > 0
    ? rawPreset.body.slice(0, MAX_BODY_CHARS)
    : null

  const now = Date.now()
  return {
    id: normalizeText(rawPreset.id) || `preset-${fnv1aHex(name.toLowerCase())}`,
    name,
    method,
    url,
    headers: publicHeaders,
    secretHeaderNames,
    secretKey,
    body,
    createdAt: Number.isSafeInteger(rawPreset.createdAt) ? rawPreset.createdAt : now,
    updatedAt: Number.isSafeInteger(rawPreset.updatedAt) ? rawPreset.updatedAt : now,
  }
}

function parseCollectionsStore(raw) {
  if (!raw)
    return { presets: [] }
  if (typeof raw === 'string') {
    try {
      return parseCollectionsStore(JSON.parse(raw))
    }
    catch {
      return { presets: [] }
    }
  }
  const list = Array.isArray(raw?.presets) ? raw.presets : []
  const presets = list
    .slice(0, MAX_PRESETS)
    .map(sanitizePresetForStorage)
    .filter(Boolean)
  return { presets }
}

function mapHostErrorReason(error, fallbackReason, isNetwork = false) {
  const code = error?.code
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED')
    return isNetwork ? 'network-internet-permission-required' : 'permission-denied'
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE')
    return 'permission-unavailable'
  if (code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE' || code === 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE')
    return 'capability-unavailable'
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT' || code === 'PLUGIN_HOST_REQUEST_TIMEOUT')
    return 'timeout'
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED' || code === 'PLUGIN_HOST_REQUEST_CANCELLED')
    return 'cancelled'
  return fallbackReason
}

async function checkPermissionNonMutating(permissionId) {
  if (typeof permission?.check !== 'function')
    return null
  try {
    return (await permission.check(permissionId)) === true
  }
  catch {
    return null
  }
}

async function enforcePermissionGate(permissionId, deniedMessage) {
  if (typeof permission?.check !== 'function') {
    return {
      ok: false,
      result: {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'permission-sdk-unavailable',
        message: 'Permission verification SDK is unavailable',
      },
    }
  }

  let granted
  try {
    granted = await permission.check(permissionId)
  }
  catch {
    return {
      ok: false,
      result: {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'permission-check-failed',
        message: `Failed to verify ${permissionId} permission`,
      },
    }
  }

  if (granted !== true) {
    return {
      ok: false,
      result: {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: permissionId === 'network.internet'
          ? 'network-internet-permission-required'
          : 'permission-denied',
        message: deniedMessage,
      },
    }
  }

  return { ok: true }
}

async function tryLoadPresetsReadOnly() {
  const storageGranted = await checkPermissionNonMutating('storage.plugin')
  if (storageGranted === false)
    return { presets: [], storageState: 'denied' }
  if (typeof plugin?.storage?.getFile !== 'function')
    return { presets: [], storageState: 'unavailable' }
  try {
    const raw = await plugin.storage.getFile(COLLECTIONS_FILE)
    return { presets: parseCollectionsStore(raw).presets, storageState: 'ready' }
  }
  catch (error) {
    const denied = error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
    return { presets: [], storageState: denied ? 'denied' : 'unavailable' }
  }
}

function registerIssuedAction(record) {
  tokenCounter += 1
  const token = `req-${triggerGeneration}-${tokenCounter}`
  issuedActions.set(token, { ...record, generation: triggerGeneration })
  return token
}

function buildInfoItem({ id, title, subtitle }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId: FEATURE_ID,
      defaultAction: 'none',
    })
    .build()
}

function buildActionItem({ id, title, subtitle, actionId, actionLabel, payload, extraActions = [] }) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId: FEATURE_ID,
      defaultAction: actionId,
    })
    .createAndAddAction(actionId, 'plugin', actionLabel || title, payload)

  for (const extra of extraActions)
    builder.createAndAddAction(extra.id, 'plugin', extra.label, extra.payload)

  return builder.build()
}

function formatResponseSnapshot(request, response, latencyMs) {
  const status = Number(response?.status ?? 0)
  const statusText = normalizeText(response?.statusText)
  const headers = response?.headers && typeof response.headers === 'object' ? response.headers : {}
  const rawData = response?.data

  let formattedBody = ''
  let isJson = false
  if (typeof rawData === 'string') {
    const trimmed = rawData.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        formattedBody = JSON.stringify(parsed, null, 2)
        isJson = true
      }
      catch {
        formattedBody = rawData
      }
    }
    else {
      formattedBody = rawData
    }
  }
  else if (rawData !== undefined && rawData !== null) {
    try {
      formattedBody = JSON.stringify(rawData, null, 2)
      isJson = true
    }
    catch {
      formattedBody = String(rawData)
    }
  }

  const sizeBytes = utf8ByteLength(formattedBody)
  const headersText = Object.entries(headers)
    .map(([k, v]) => `${k}: ${isSensitiveHeader(k) ? redactHeaderValue(k, v) : String(v)}`)
    .join('\n')

  return {
    method: request.method,
    url: request.url,
    status,
    statusText,
    ok: response?.ok === true || (status >= 200 && status < 300),
    latencyMs,
    sizeBytes,
    isJson,
    formattedBody,
    headersText,
    receivedAt: Date.now(),
  }
}

function buildResponseItems(snapshot, prefix = 'last') {
  const statusLabel = `${snapshot.status}${snapshot.statusText ? ` ${snapshot.statusText}` : ''}`
  const badge = snapshot.ok ? 'OK' : 'ERR'
  const formatTag = snapshot.isJson ? 'JSON' : 'Text'
  const bodyToken = registerIssuedAction({ kind: 'copy-text', text: snapshot.formattedBody })
  const headersToken = registerIssuedAction({ kind: 'copy-text', text: snapshot.headersText || '(empty)' })

  return [
    buildActionItem({
      id: `${FEATURE_ID}-${prefix}-summary`,
      title: `[${badge}] ${statusLabel} · ${snapshot.latencyMs}ms · ${formatByteSize(snapshot.sizeBytes)} (${formatTag})`,
      subtitle: `${snapshot.method} ${snapshot.url} — Enter to copy formatted response`,
      actionId: 'copy-response',
      actionLabel: 'Copy Response',
      payload: { token: bodyToken },
      extraActions: [
        { id: 'copy-headers', label: 'Copy Response Headers', payload: { token: headersToken } },
      ],
    }),
    buildActionItem({
      id: `${FEATURE_ID}-${prefix}-body`,
      title: snapshot.isJson ? 'Formatted JSON Response' : 'Response Body Preview',
      subtitle: truncateText(snapshot.formattedBody || '(empty response body)', 110),
      actionId: 'copy-response',
      actionLabel: 'Copy Body',
      payload: { token: bodyToken },
    }),
    buildActionItem({
      id: `${FEATURE_ID}-${prefix}-headers`,
      title: 'Response Headers',
      subtitle: truncateText(snapshot.headersText.replace(/\n/g, ' · ') || 'No response headers', 110),
      actionId: 'copy-headers',
      actionLabel: 'Copy Headers',
      payload: { token: headersToken },
    }),
  ]
}

function buildRequestPreviewItems(request, { networkPermitted, presetName = '' } = {}) {
  const { publicHeaders, secretHeaderNames } = splitHeaders(request.headers || {})
  const totalHeaders = Object.keys(publicHeaders).length + secretHeaderNames.length
  const sendToken = registerIssuedAction({ kind: 'send-request', request })
  const curlText = formatCurlSnippet(request)
  const fetchText = formatFetchSnippet(request)
  const curlToken = registerIssuedAction({ kind: 'copy-text', text: curlText })
  const fetchToken = registerIssuedAction({ kind: 'copy-text', text: fetchText })

  const items = []
  const permissionNote = networkPermitted === false
    ? ' · network.internet not granted'
    : ''
  const secretNote = secretHeaderNames.length > 0
    ? ` · ${secretHeaderNames.length} secret header(s) redacted`
    : ''

  if (presetName) {
    const saveToken = registerIssuedAction({ kind: 'save-preset', presetName, request })
    items.push(buildActionItem({
      id: `${FEATURE_ID}-save-preset`,
      title: `Save Preset "${presetName}" (${request.method})`,
      subtitle: `${request.url}${secretHeaderNames.length ? ` · ${secretHeaderNames.length} secret(s) isolated in secure store` : ''}`,
      actionId: 'save-preset',
      actionLabel: 'Save Preset',
      payload: { token: saveToken },
    }))
  }

  items.push(buildActionItem({
    id: `${FEATURE_ID}-send`,
    title: `Send ${request.method} ${truncateText(request.url, 72)}`,
    subtitle: `${totalHeaders} header(s)${request.body ? ` · Body ${formatByteSize(utf8ByteLength(request.body))}` : ''}${secretNote}${permissionNote}`,
    actionId: 'send-request',
    actionLabel: 'Send Request',
    payload: { token: sendToken },
    extraActions: [
      { id: 'copy-curl', label: 'Copy Redacted cURL', payload: { token: curlToken } },
      { id: 'copy-fetch', label: `Copy Redacted ${FETCH_IDENTIFIER}()`, payload: { token: fetchToken } },
    ],
  }))

  items.push(buildInfoItem({
    id: `${FEATURE_ID}-preview-headers`,
    title: `Parsed Headers (${totalHeaders})`,
    subtitle: formatHeadersSummary(request),
  }))

  if (request.body !== null && request.body !== undefined && request.body !== '') {
    let bodyKind = 'Raw Body'
    try {
      JSON.parse(request.body)
      bodyKind = 'JSON Body'
    }
    catch {
      // Plain text body
    }
    items.push(buildInfoItem({
      id: `${FEATURE_ID}-preview-body`,
      title: `Parsed ${bodyKind} (${formatByteSize(utf8ByteLength(request.body))})`,
      subtitle: truncateText(request.body, 110),
    }))
  }

  items.push(buildActionItem({
    id: `${FEATURE_ID}-export-curl`,
    title: 'Copy as cURL (Redacted)',
    subtitle: truncateText(curlText.replace(/\\\n/g, ' '), 100),
    actionId: 'copy-curl',
    actionLabel: 'Copy cURL',
    payload: { token: curlToken },
  }))

  items.push(buildActionItem({
    id: `${FEATURE_ID}-export-fetch`,
    title: `Copy as ${FETCH_IDENTIFIER}() Snippet (Redacted)`,
    subtitle: truncateText(fetchText.replace(/\n/g, ' '), 100),
    actionId: 'copy-fetch',
    actionLabel: `Copy ${FETCH_IDENTIFIER}()`,
    payload: { token: fetchToken },
  }))

  return items
}

function buildPresetItem(preset, { preferDelete = false } = {}) {
  const curlToken = registerIssuedAction({
    kind: 'copy-text',
    text: formatCurlSnippet(preset, { secretHeaderNames: preset.secretHeaderNames }),
  })
  const fetchToken = registerIssuedAction({
    kind: 'copy-text',
    text: formatFetchSnippet(preset, { secretHeaderNames: preset.secretHeaderNames }),
  })
  const runToken = registerIssuedAction({ kind: 'run-preset', presetId: preset.id, presetName: preset.name })
  const deleteToken = registerIssuedAction({ kind: 'delete-preset', presetId: preset.id, presetName: preset.name })

  const secretBadge = preset.secretHeaderNames.length > 0
    ? ` · 🔒 ${preset.secretHeaderNames.join(', ')}`
    : ''

  if (preferDelete) {
    return buildActionItem({
      id: `${FEATURE_ID}-delete-${preset.id}`,
      title: `Delete Preset "${preset.name}"`,
      subtitle: `${preset.method} ${preset.url}${secretBadge}`,
      actionId: 'delete-preset',
      actionLabel: 'Delete Preset',
      payload: { token: deleteToken },
    })
  }

  return buildActionItem({
    id: `${FEATURE_ID}-preset-${preset.id}`,
    title: `[${preset.method}] ${preset.name}`,
    subtitle: `${preset.url}${secretBadge}`,
    actionId: 'run-preset',
    actionLabel: 'Run Saved Request',
    payload: { token: runToken },
    extraActions: [
      { id: 'copy-curl', label: 'Copy Redacted cURL', payload: { token: curlToken } },
      { id: 'copy-fetch', label: `Copy Redacted ${FETCH_IDENTIFIER}()`, payload: { token: fetchToken } },
      { id: 'delete-preset', label: 'Delete Preset', payload: { token: deleteToken } },
    ],
  })
}

async function publishItems(items, generation) {
  if (generation !== triggerGeneration)
    return false
  await plugin.feature.clearItems()
  if (generation !== triggerGeneration)
    return false
  await plugin.feature.pushItems(items)
  return generation === triggerGeneration
}

async function copyTextWithGate(text) {
  const gate = await enforcePermissionGate('clipboard.write', 'Missing clipboard.write permission')
  if (!gate.ok)
    return gate.result

  if (typeof clipboard?.writeText !== 'function') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-unavailable',
      message: 'Clipboard capability is unavailable',
    }
  }

  try {
    await clipboard.writeText(String(text ?? ''))
    return {
      externalAction: true,
      success: true,
      status: 'copied',
      message: 'Copied to clipboard',
    }
  }
  catch (error) {
    logger?.warn?.('[touch-api-lens] Clipboard write failed')
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: mapHostErrorReason(error, 'clipboard-write-failed'),
      message: error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
        ? 'Missing clipboard.write permission'
        : 'Failed to copy to clipboard',
    }
  }
}

async function executeHttpRequest(request, actionGeneration) {
  const gate = await enforcePermissionGate(
    'network.internet',
    'Grant network.internet permission to execute HTTP requests',
  )
  if (!gate.ok)
    return gate.result

  if (typeof http?.request !== 'function') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'capability-unavailable',
      message: 'Host HTTP capability is unavailable',
    }
  }

  const startMs = Date.now()
  try {
    const httpConfig = {
      method: request.method,
      url: request.url,
      responseType: 'text',
      timeoutMs: DEFAULT_TIMEOUT_MS,
    }
    if (request.headers && Object.keys(request.headers).length > 0)
      httpConfig.headers = { ...request.headers }
    if (request.body !== null && request.body !== undefined && request.body !== '')
      httpConfig.body = request.body

    const response = await http.request(httpConfig)
    const latencyMs = Math.max(0, Date.now() - startMs)
    const snapshot = formatResponseSnapshot(request, response, latencyMs)
    lastResponse = snapshot

    if (actionGeneration === triggerGeneration && plugin?.feature) {
      try {
        const responseItems = buildResponseItems(snapshot, 'live')
        await publishItems(responseItems, actionGeneration)
      }
      catch {
        // Non-fatal if CoreBox already dismissed
      }
    }

    const statusLine = `${snapshot.status}${snapshot.statusText ? ` ${snapshot.statusText}` : ''}`
    return {
      externalAction: true,
      success: true,
      status: 'completed',
      message: `${statusLine} (${snapshot.latencyMs}ms · ${formatByteSize(snapshot.sizeBytes)})`,
    }
  }
  catch (error) {
    logger?.warn?.('[touch-api-lens] HTTP request failed')
    const reason = mapHostErrorReason(error, 'http-request-failed', true)
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason,
      message: reason === 'network-internet-permission-required'
        ? 'Grant network.internet permission to execute HTTP requests'
        : reason === 'timeout'
          ? 'HTTP request timed out'
          : 'HTTP request failed',
    }
  }
}

async function handleSavePreset(presetName, request) {
  const safeName = sanitizePresetName(presetName)
  if (!safeName || !request) {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'invalid-action',
      message: 'Invalid preset name or request payload',
    }
  }

  const gate = await enforcePermissionGate(
    'storage.plugin',
    'Grant storage.plugin permission to save API presets',
  )
  if (!gate.ok)
    return gate.result

  if (typeof plugin?.storage?.getFile !== 'function' || typeof plugin?.storage?.setFile !== 'function') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'capability-unavailable',
      message: 'Plugin storage capability is unavailable',
    }
  }

  const { publicHeaders, sensitiveHeaders, secretHeaderNames } = splitHeaders(request.headers || {})
  const secretKey = secretHeaderNames.length > 0 ? buildSecretKey(safeName) : null

  let presets
  let existingIndex
  let previous
  let nextPreset
  try {
    const existingRaw = await plugin.storage.getFile(COLLECTIONS_FILE)
    presets = parseCollectionsStore(existingRaw).presets
    const now = Date.now()
    existingIndex = presets.findIndex(p => p.name.toLowerCase() === safeName.toLowerCase())
    previous = existingIndex >= 0 ? presets[existingIndex] : null

    nextPreset = sanitizePresetForStorage({
      id: previous?.id || `preset-${fnv1aHex(safeName.toLowerCase())}`,
      name: safeName,
      method: request.method,
      url: request.url,
      headers: publicHeaders,
      secretHeaderNames,
      secretKey,
      body: request.body,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    })
  }
  catch (error) {
    logger?.warn?.('[touch-api-lens] Failed to read collections metadata before save')
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: mapHostErrorReason(error, 'storage-read-failed'),
      message: 'Failed to load existing presets before saving',
    }
  }

  if (!nextPreset) {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'invalid-action',
      message: 'Unable to sanitize preset',
    }
  }

  // CRITICAL: Persist secrets BEFORE touching plugin.storage; fail closed and roll back on metadata write failure.
  let wroteSecret = false
  let previousSecretValue = null
  const replacingSameSecretKey = Boolean(secretKey && previous?.secretKey === secretKey)
  if (secretHeaderNames.length > 0) {
    if (typeof secret?.set !== 'function') {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'capability-unavailable',
        message: 'Secret storage capability is unavailable; preset was not saved',
      }
    }
    if (replacingSameSecretKey && typeof secret?.get === 'function') {
      try {
        previousSecretValue = await secret.get(secretKey)
      }
      catch {
        previousSecretValue = null
      }
    }
    try {
      await secret.set(secretKey, JSON.stringify(sensitiveHeaders))
      wroteSecret = true
    }
    catch (error) {
      logger?.warn?.('[touch-api-lens] Failed to store preset secret')
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: mapHostErrorReason(error, 'secret-write-failed'),
        message: 'Failed to securely store auth headers; preset was not saved',
      }
    }
  }

  try {
    const updated = [...presets]
    if (existingIndex >= 0)
      updated[existingIndex] = nextPreset
    else
      updated.unshift(nextPreset)

    await plugin.storage.setFile(COLLECTIONS_FILE, { presets: updated.slice(0, MAX_PRESETS) })

    // If an updated preset dropped secrets, remove the old secret key cleanly
    if (previous?.secretKey && !secretKey && typeof secret?.delete === 'function') {
      try {
        await secret.delete(previous.secretKey)
      }
      catch {
        // Non-fatal cleanup after metadata commit
      }
    }

    return {
      externalAction: true,
      success: true,
      status: 'saved',
      message: secretHeaderNames.length > 0
        ? `Saved "${safeName}" (${secretHeaderNames.length} secret header(s) isolated)`
        : `Saved preset "${safeName}"`,
    }
  }
  catch (error) {
    if (wroteSecret && secretKey) {
      try {
        if (replacingSameSecretKey && typeof previousSecretValue === 'string') {
          await secret.set(secretKey, previousSecretValue)
        }
        else if (typeof secret?.delete === 'function') {
          await secret.delete(secretKey)
        }
      }
      catch {
        logger?.warn?.('[touch-api-lens] Failed to rollback preset secret after metadata write failure')
      }
    }
    logger?.warn?.('[touch-api-lens] Failed to persist collections metadata')
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: mapHostErrorReason(error, 'storage-write-failed'),
      message: 'Failed to save preset metadata',
    }
  }
}

async function handleRunPreset(presetId, actionGeneration) {
  const storageGate = await enforcePermissionGate(
    'storage.plugin',
    'Grant storage.plugin permission to load saved presets',
  )
  if (!storageGate.ok)
    return storageGate.result

  if (typeof plugin?.storage?.getFile !== 'function') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'capability-unavailable',
      message: 'Plugin storage capability is unavailable',
    }
  }

  let preset
  try {
    const { presets } = parseCollectionsStore(await plugin.storage.getFile(COLLECTIONS_FILE))
    preset = presets.find(item => item.id === presetId)
  }
  catch (error) {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: mapHostErrorReason(error, 'storage-read-failed'),
      message: 'Failed to read saved presets',
    }
  }

  if (!preset) {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'preset-not-found',
      message: 'Saved preset not found',
    }
  }

  const mergedHeaders = { ...preset.headers }
  if (preset.secretHeaderNames.length > 0) {
    if (!preset.secretKey || typeof secret?.get !== 'function') {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'capability-unavailable',
        message: 'Secret capability unavailable; refusing to send unauthenticated request',
      }
    }
    try {
      const secretPayload = await secret.get(preset.secretKey)
      if (!secretPayload) {
        return {
          externalAction: true,
          success: false,
          status: 'blocked',
          reason: 'secret-unavailable',
          message: 'Saved auth secret is missing; re-save preset before running',
        }
      }
      const parsedSecrets = JSON.parse(secretPayload)
      if (!parsedSecrets || typeof parsedSecrets !== 'object' || Array.isArray(parsedSecrets)) {
        return {
          externalAction: true,
          success: false,
          status: 'blocked',
          reason: 'secret-unavailable',
          message: 'Saved auth secret payload is invalid',
        }
      }
      for (const [k, v] of Object.entries(parsedSecrets))
        setHeaderCaseInsensitive(mergedHeaders, k, String(v ?? ''))
    }
    catch (error) {
      logger?.warn?.('[touch-api-lens] Failed to read preset secret')
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: mapHostErrorReason(error, 'secret-unavailable'),
        message: 'Failed to retrieve auth secret',
      }
    }
  }

  return executeHttpRequest({
    method: preset.method,
    url: preset.url,
    headers: mergedHeaders,
    body: preset.body,
  }, actionGeneration)
}

async function handleDeletePreset(presetId) {
  const storageGate = await enforcePermissionGate(
    'storage.plugin',
    'Grant storage.plugin permission to delete presets',
  )
  if (!storageGate.ok)
    return storageGate.result

  if (typeof plugin?.storage?.getFile !== 'function' || typeof plugin?.storage?.setFile !== 'function') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'capability-unavailable',
      message: 'Plugin storage capability is unavailable',
    }
  }

  try {
    const { presets } = parseCollectionsStore(await plugin.storage.getFile(COLLECTIONS_FILE))
    const target = presets.find(item => item.id === presetId)
    if (!target) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'preset-not-found',
        message: 'Saved preset not found',
      }
    }

    if (target.secretKey) {
      if (typeof secret?.delete !== 'function') {
        return {
          externalAction: true,
          success: false,
          status: 'blocked',
          reason: 'capability-unavailable',
          message: 'Secret capability unavailable; cannot safely purge credentials',
        }
      }
      await secret.delete(target.secretKey)
    }

    const remaining = presets.filter(item => item.id !== presetId)
    await plugin.storage.setFile(COLLECTIONS_FILE, { presets: remaining })
    return {
      externalAction: true,
      success: true,
      status: 'deleted',
      message: `Deleted preset "${target.name}"`,
    }
  }
  catch (error) {
    logger?.warn?.('[touch-api-lens] Failed to delete preset')
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: mapHostErrorReason(error, 'delete-preset-failed'),
      message: 'Failed to delete preset',
    }
  }
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId = FEATURE_ID, query) {
    if (featureId !== FEATURE_ID)
      return false

    const generation = ++triggerGeneration
    issuedActions = new Map()

    try {
      const rawQuery = getQueryText(query)
      const intent = parseQueryIntent(rawQuery)
      const [networkPermitted, { presets, storageState }] = await Promise.all([
        checkPermissionNonMutating('network.internet'),
        tryLoadPresetsReadOnly(),
      ])

      if (generation !== triggerGeneration)
        return true

      const items = []

      if (intent.kind === 'last') {
        if (lastResponse) {
          items.push(...buildResponseItems(lastResponse, 'last'))
        }
        else {
          items.push(buildInfoItem({
            id: `${FEATURE_ID}-no-response`,
            title: 'No HTTP Response Yet',
            subtitle: 'Run a cURL command or API request first to inspect status, latency & formatted JSON',
          }))
        }
      }
      else if (intent.kind === 'save') {
        if (!intent.request || !intent.presetName) {
          items.push(buildInfoItem({
            id: `${FEATURE_ID}-save-usage`,
            title: 'Invalid Save Syntax',
            subtitle: 'Usage: save <preset-name> GET https://api.example.com/v1/health  or  save myapi curl ...',
          }))
        }
        else {
          items.push(...buildRequestPreviewItems(intent.request, {
            networkPermitted,
            presetName: intent.presetName,
          }))
        }
      }
      else if (intent.kind === 'request') {
        items.push(...buildRequestPreviewItems(intent.request, { networkPermitted }))
        if (lastResponse && lastResponse.url === intent.request.url && lastResponse.method === intent.request.method)
          items.push(...buildResponseItems(lastResponse, 'recent'))
      }
      else if (intent.kind === 'delete-preset') {
        const needle = intent.keyword.toLowerCase()
        const matched = presets.filter(p => !needle || p.name.toLowerCase().includes(needle) || p.url.toLowerCase().includes(needle))
        if (matched.length > 0) {
          matched.forEach(p => items.push(buildPresetItem(p, { preferDelete: true })))
        }
        else {
          items.push(buildInfoItem({
            id: `${FEATURE_ID}-delete-none`,
            title: 'No Matching Preset to Delete',
            subtitle: `No saved preset matched "${intent.keyword}"`,
          }))
        }
      }
      else if (intent.kind === 'filter-presets') {
        const needle = intent.keyword.toLowerCase()
        const matched = presets.filter(p =>
          p.name.toLowerCase().includes(needle)
          || p.url.toLowerCase().includes(needle)
          || p.method.toLowerCase().includes(needle),
        )
        if (matched.length > 0) {
          matched.forEach(p => items.push(buildPresetItem(p)))
        }
        else {
          items.push(buildInfoItem({
            id: `${FEATURE_ID}-parse-hint`,
            title: 'Paste a cURL Command or HTTP Request',
            subtitle: 'Examples: GET https://api.github.com/zen · curl -X POST https://httpbin.org/post -d \'{"ok":true}\'',
          }))
          if (presets.length > 0)
            presets.slice(0, 6).forEach(p => items.push(buildPresetItem(p)))
        }
      }
      else {
        items.push(buildInfoItem({
          id: `${FEATURE_ID}-home-guide`,
          title: 'API Lens · Quick HTTP & cURL Scratchpad',
          subtitle: 'Try: GET https://api.github.com/zen · curl -H "Authorization: Bearer <token>" https://... · save <name> <req>',
        }))
        if (lastResponse)
          items.push(...buildResponseItems(lastResponse, 'last').slice(0, 1))
        if (presets.length > 0) {
          presets.slice(0, 12).forEach(p => items.push(buildPresetItem(p)))
        }
        else if (storageState === 'denied') {
          items.push(buildInfoItem({
            id: `${FEATURE_ID}-storage-denied`,
            title: 'Saved Collections Locked',
            subtitle: 'Grant storage.plugin permission to load and save named API presets',
          }))
        }
        else {
          items.push(buildInfoItem({
            id: `${FEATURE_ID}-empty-presets`,
            title: 'No Saved API Presets Yet',
            subtitle: 'Save any request with: save <name> GET https://api.example.com/health',
          }))
        }
      }

      await publishItems(items, generation)
      return true
    }
    catch {
      if (generation !== triggerGeneration)
        return true
      logger?.error?.('[touch-api-lens] Failed to render items')
      try {
        await publishItems([
          buildInfoItem({
            id: `${FEATURE_ID}-error`,
            title: 'API Lens Error',
            subtitle: 'Unable to parse input right now',
          }),
        ], generation)
        return true
      }
      catch {
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    if (
      !item
      || typeof item !== 'object'
      || item.source?.type !== 'plugin'
      || ![SOURCE_ID, PLUGIN_NAME].includes(item.source?.id)
      || (item.meta?.pluginName && item.meta.pluginName !== PLUGIN_NAME)
      || item.meta?.featureId !== FEATURE_ID
    ) {
      return
    }

    const actionId = normalizeText(
      context?.actionId || item.meta?.defaultAction || item.actions?.[0]?.id,
    )
    if (!actionId || actionId === 'none')
      return

    const action = Array.isArray(item.actions)
      ? item.actions.find(candidate => candidate?.id === actionId && candidate?.type === 'plugin')
      : null
    const token = normalizeText(action?.payload?.token)
    if (!token) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-action',
        message: 'Action payload is missing or invalid',
      }
    }

    const issued = issuedActions.get(token)
    if (!issued) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'stale-request',
        message: 'This API action expired; re-run your query',
      }
    }

    const actionGeneration = issued.generation

    if (actionId === 'send-request' && issued.kind === 'send-request')
      return executeHttpRequest(issued.request, actionGeneration)

    if (actionId === 'save-preset' && issued.kind === 'save-preset')
      return handleSavePreset(issued.presetName, issued.request)

    if (actionId === 'run-preset' && issued.kind === 'run-preset')
      return handleRunPreset(issued.presetId, actionGeneration)

    if (actionId === 'delete-preset' && issued.kind === 'delete-preset')
      return handleDeletePreset(issued.presetId)

    if (
      ['copy-curl', 'copy-fetch', 'copy-response', 'copy-headers'].includes(actionId)
      && issued.kind === 'copy-text'
    ) {
      return copyTextWithGate(issued.text)
    }

    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'invalid-action',
      message: 'Unsupported API Lens action',
    }
  },

  onDestroy() {
    triggerGeneration += 1
    issuedActions = new Map()
    lastResponse = null
  },
}

module.exports = pluginLifecycle
