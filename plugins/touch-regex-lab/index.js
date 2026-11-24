const PLUGIN_NAME = 'touch-regex-lab'
const FEATURE_ID = 'regex-lab'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }

const ACTION_COPY_RAW = 'copy-raw'
const ACTION_COPY_JS = 'copy-js'
const ACTION_COPY_PYTHON = 'copy-python'
const ACTION_COPY_MATCH = 'copy-match'
const ACTION_COPY_GROUPS = 'copy-groups'
const ACTION_COPY_REPLACED = 'copy-replaced'
const ACTION_COPY_TEXT = 'copy-text'

const MAX_PATTERN_LENGTH = 512
const MAX_INPUT_LENGTH = 8192
const MAX_MATCHES = 50
const MAX_EXEC_MS = 25
const MAX_QUANTIFIER_BOUND = 1000
const MAX_DETAIL_MATCH_CARDS = 12
const VALID_FLAGS = new Set(['g', 'i', 'm', 's', 'u', 'v', 'd', 'y'])

const TRIGGER_PREFIXES = [
  'regex-lab',
  'reglab',
  'regexp',
  'regex',
  'rx',
  '正则表达式',
  '正则测试',
  '正则',
]

const REGEX_LIBRARY = [
  {
    id: 'email',
    title: 'Email Address (RFC-practical)',
    zhTitle: '电子邮箱地址',
    category: 'web',
    pattern: '^[a-zA-Z0-9.!#$%&\'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$',
    flags: '',
    description: 'Practical email validator avoiding catastrophic backtracking',
    sample: 'dev.team@tuff.example.com',
    tags: ['email', 'mail', 'contact', '邮箱', '邮件'],
    detect: true,
  },
  {
    id: 'url-http',
    title: 'HTTP / HTTPS URL',
    zhTitle: 'HTTP/HTTPS 网址',
    category: 'web',
    pattern: 'https?:\\/\\/(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,63}(?::\\d{1,5})?(?:\\/[^\\s?#]*)?(?:\\?[^\\s#]*)?(?:#[^\\s]*)?',
    flags: 'gi',
    description: 'Matches HTTP(S) URLs with optional port, path, query, and fragment',
    sample: 'https://docs.tuff.dev:443/guide?tab=sdk#top',
    tags: ['url', 'http', 'https', 'link', 'uri', '网址', '链接'],
    detect: true,
  },
  {
    id: 'ipv4',
    title: 'IPv4 Address',
    zhTitle: 'IPv4 地址',
    category: 'network',
    pattern: '^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$',
    flags: '',
    description: 'Strict dotted-quad IPv4 address (0.0.0.0 – 255.255.255.255)',
    sample: '192.168.10.42',
    tags: ['ip', 'ipv4', 'network', 'host', '地址', '网络'],
    detect: true,
  },
  {
    id: 'ipv4-cidr',
    title: 'IPv4 CIDR Block',
    zhTitle: 'IPv4 CIDR 网段',
    category: 'network',
    pattern: '^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\/(?:3[0-2]|[12]?\\d)$',
    flags: '',
    description: 'Validates IPv4 CIDR notation with prefix length /0 to /32',
    sample: '10.0.0.0/24',
    tags: ['cidr', 'subnet', 'ipv4', 'network', '子网', '网段'],
    detect: true,
  },
  {
    id: 'ipv6',
    title: 'IPv6 Address (Full / Compressed)',
    zhTitle: 'IPv6 地址',
    category: 'network',
    pattern: '^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$|^::$',
    flags: '',
    description: 'Matches standard full and zero-compressed IPv6 addresses',
    sample: '2001:db8::1',
    tags: ['ip', 'ipv6', 'network', '地址', '网络'],
    detect: true,
  },
  {
    id: 'uuid-v4',
    title: 'UUID v4 (RFC 4122)',
    zhTitle: 'UUID v4 唯一标识',
    category: 'identity',
    pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    flags: 'i',
    description: 'Strictly validates version 4 and RFC 4122 variant nibble',
    sample: '550e8400-e29b-41d4-a716-446655440000',
    tags: ['uuid', 'guid', 'id', 'identifier', '标识'],
    detect: true,
  },
  {
    id: 'semver',
    title: 'Semantic Version (SemVer 2.0)',
    zhTitle: '语义化版本号 (SemVer)',
    category: 'code',
    pattern: '^v?(?<major>0|[1-9]\\d*)\\.(?<minor>0|[1-9]\\d*)\\.(?<patch>0|[1-9]\\d*)(?:-(?<prerelease>(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+(?<build>[0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$',
    flags: '',
    description: 'Captures major, minor, patch, prerelease, and build metadata',
    sample: 'v2.4.1-beta.3+build.19',
    tags: ['semver', 'version', 'release', 'tag', '版本', '版本号'],
    detect: true,
  },
  {
    id: 'iso-date',
    title: 'ISO 8601 Date (YYYY-MM-DD)',
    zhTitle: 'ISO 8601 日期',
    category: 'datetime',
    pattern: '^(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])$',
    flags: '',
    description: 'Captures year, month, and day in strict YYYY-MM-DD format',
    sample: '2026-11-23',
    tags: ['date', 'iso', 'ymd', 'calendar', '日期'],
    detect: true,
  },
  {
    id: 'iso-datetime',
    title: 'ISO 8601 Timestamp (UTC / Offset)',
    zhTitle: 'ISO 8601 时间戳',
    category: 'datetime',
    pattern: '^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])[T ](?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,9})?(?:Z|[+-](?:[01]\\d|2[0-3]):?[0-5]\\d)$',
    flags: '',
    description: 'RFC 3339 / ISO 8601 timestamp with fractional seconds and TZ',
    sample: '2026-11-23T15:30:00.123Z',
    tags: ['datetime', 'timestamp', 'iso', 'rfc3339', '时间', '时间戳'],
    detect: true,
  },
  {
    id: 'time-24h',
    title: '24-Hour Time (HH:mm or HH:mm:ss)',
    zhTitle: '24 小时制时间',
    category: 'datetime',
    pattern: '^(?<hour>[01]\\d|2[0-3]):(?<minute>[0-5]\\d)(?::(?<second>[0-5]\\d))?$',
    flags: '',
    description: 'Validates 24-hour clock time with optional seconds',
    sample: '14:35:09',
    tags: ['time', 'clock', '24h', '时间'],
    detect: true,
  },
  {
    id: 'jwt',
    title: 'JWT Compact Token',
    zhTitle: 'JWT 令牌结构',
    category: 'security',
    pattern: '^(?<header>[A-Za-z0-9_-]+)\\.(?<payload>[A-Za-z0-9_-]+)\\.(?<signature>[A-Za-z0-9_-]+)$',
    flags: '',
    description: 'Matches 3-segment Base64URL JWT header.payload.signature',
    sample: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc123_XYZ',
    tags: ['jwt', 'token', 'auth', 'base64url', '令牌'],
    detect: true,
  },
  {
    id: 'hex-color',
    title: 'CSS Hex Color (#RGB / #RRGGBB / #RRGGBBAA)',
    zhTitle: '十六进制颜色值',
    category: 'web',
    pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$',
    flags: '',
    description: 'Matches 3, 4, 6, or 8 digit hexadecimal CSS colors',
    sample: '#38BDF8',
    tags: ['hex', 'color', 'css', 'rgb', '颜色'],
    detect: true,
  },
  {
    id: 'mac-address',
    title: 'MAC Address (Colon / Hyphen)',
    zhTitle: 'MAC 物理地址',
    category: 'network',
    pattern: '^(?:[0-9A-Fa-f]{2}([-:]))(?:[0-9A-Fa-f]{2}\\1){4}[0-9A-Fa-f]{2}$',
    flags: '',
    description: 'Matches 6-octet IEEE 802 MAC address with consistent separator',
    sample: 'AA:BB:CC:11:22:33',
    tags: ['mac', 'ethernet', 'network', 'hardware', '网卡', '物理地址'],
    detect: true,
  },
  {
    id: 'slug-kebab',
    title: 'URL Slug / Kebab-Case Identifier',
    zhTitle: 'URL Slug / 短横线命名',
    category: 'code',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    flags: '',
    description: 'Lowercase alphanumeric segments joined by single hyphens',
    sample: 'touch-regex-lab',
    tags: ['slug', 'kebab', 'url', 'identifier', '命名'],
    detect: false,
  },
  {
    id: 'phone-e164',
    title: 'International Phone (E.164)',
    zhTitle: '国际电话号码 (E.164)',
    category: 'identity',
    pattern: '^\\+[1-9]\\d{6,14}$',
    flags: '',
    description: 'ITU-T E.164 phone number starting with + and 7-15 digits',
    sample: '+14155552671',
    tags: ['phone', 'e164', 'mobile', 'tel', '电话', '手机'],
    detect: true,
  },
  {
    id: 'cn-mobile',
    title: 'China Mainland Mobile Number',
    zhTitle: '中国大陆手机号',
    category: 'identity',
    pattern: '^(?:\\+?86[- ]?)?1[3-9]\\d{9}$',
    flags: '',
    description: '11-digit China mainland mobile with optional +86 prefix',
    sample: '13800138000',
    tags: ['phone', 'mobile', 'cn', 'china', '手机', '手机号'],
    detect: true,
  },
  {
    id: 'strong-password',
    title: 'Strong Password Policy (12+ chars)',
    zhTitle: '强密码策略',
    category: 'security',
    pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s])[^\\s]{12,128}$',
    flags: '',
    description: '12–128 non-space chars with upper, lower, digit, and symbol',
    sample: 'Tuff#Lab2026!',
    tags: ['password', 'auth', 'security', 'policy', '密码'],
    detect: false,
  },
  {
    id: 'conventional-commit',
    title: 'Conventional Commit Header',
    zhTitle: 'Conventional Commits 提交规范',
    category: 'code',
    pattern: '^(?<type>feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\\((?<scope>[a-z0-9._/-]+)\\))?(?<breaking>!)?: (?<subject>[^\\r\\n]{1,100})$',
    flags: '',
    description: 'Parses type, optional scope, breaking marker, and subject',
    sample: 'feat(plugins): add interactive regex lab',
    tags: ['git', 'commit', 'conventional', 'ci', '提交'],
    detect: true,
  },
  {
    id: 'docker-image',
    title: 'Docker / OCI Image Reference',
    zhTitle: 'Docker / OCI 镜像名',
    category: 'code',
    pattern: '^(?:(?<registry>[a-zA-Z0-9.-]+(?::\\d+)?)/)?(?<repo>[a-z0-9]+(?:[._/-][a-z0-9]+)*)(?::(?<tag>[\\w][\\w.-]{0,127}))?(?:@(?<digest>sha256:[a-f0-9]{64}))?$',
    flags: '',
    description: 'Captures optional registry, repository path, tag, and sha256 digest',
    sample: 'ghcr.io/talex-touch/core:1.0.0',
    tags: ['docker', 'oci', 'image', 'container', '镜像'],
    detect: false,
  },
  {
    id: 'env-assignment',
    title: 'Dotenv Assignment (KEY=VALUE)',
    zhTitle: '环境变量配置行',
    category: 'code',
    pattern: '^(?:export\\s+)?(?<key>[A-Z_][A-Z0-9_]*)\\s*=\\s*(?<value>[^#\\r\\n]*?)$',
    flags: 'm',
    description: 'Extracts shell/.env variable name and unquoted or quoted value',
    sample: 'NODE_ENV=production',
    tags: ['env', 'dotenv', 'config', 'shell', '环境变量'],
    detect: false,
  },
  {
    id: 'markdown-link',
    title: 'Markdown Link [label](url)',
    zhTitle: 'Markdown 链接',
    category: 'text',
    pattern: '\\[(?<label>[^\\]]+)\\]\\((?<url>[^)\\s]+)(?:\\s+"(?<title>[^"]*)")?\\)',
    flags: 'g',
    description: 'Captures link label, destination URL, and optional title',
    sample: '[Tuff Docs](https://tuff.dev "Guide")',
    tags: ['markdown', 'md', 'link', 'text', '链接'],
    detect: false,
  },
  {
    id: 'html-tag',
    title: 'HTML / XML Element Tag',
    zhTitle: 'HTML/XML 标签',
    category: 'web',
    pattern: '<(?<closing>\\/)?(?<tag>[a-zA-Z][a-zA-Z0-9:-]*)(?<attrs>\\s[^<>]*)?\\s*(?<selfClosing>\\/)?>',
    flags: 'g',
    description: 'Matches opening, closing, and self-closing HTML/XML tags',
    sample: '<button type="submit" disabled>',
    tags: ['html', 'xml', 'tag', 'dom', '标签'],
    detect: false,
  },
  {
    id: 'cron-5field',
    title: 'Cron 5-Field Expression Shape',
    zhTitle: '5 字段 Cron 表达式',
    category: 'datetime',
    pattern: '^\\s*(?:[\\d*,/-]+)\\s+(?:[\\d*,/-]+)\\s+(?:[\\d*,/-]+)\\s+(?:[\\d*,/-A-Za-z]+)\\s+(?:[\\d*,/-A-Za-z]+)\\s*$',
    flags: '',
    description: 'Quick structural check for standard 5-field crontab schedules',
    sample: '*/15 9-18 * * 1-5',
    tags: ['cron', 'crontab', 'schedule', '定时'],
    detect: false,
  },
  {
    id: 'cjk-chars',
    title: 'CJK Unified Ideographs (Chinese/Kanji)',
    zhTitle: '中文/汉字字符匹配',
    category: 'text',
    pattern: '[\\u4E00-\\u9FFF]+',
    flags: 'g',
    description: 'Matches contiguous CJK Unified Ideograph runs',
    sample: '正则实验室',
    tags: ['cjk', 'chinese', 'hanzi', 'unicode', '中文', '汉字'],
    detect: false,
  },
  {
    id: 'json-string',
    title: 'JSON Double-Quoted String Literal',
    zhTitle: 'JSON 字符串字面量',
    category: 'code',
    pattern: '"(?:[^"\\\\\\x00-\\x1F]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*"',
    flags: 'g',
    description: 'RFC 8259 compliant JSON string with escape sequences',
    sample: '"hello\\nworld"',
    tags: ['json', 'string', 'literal', 'escape', '字符串'],
    detect: false,
  },
  {
    id: 'sha256-hex',
    title: 'SHA-256 Hex Digest',
    zhTitle: 'SHA-256 哈希摘要',
    category: 'security',
    pattern: '^[a-fA-F0-9]{64}$',
    flags: '',
    description: 'Matches 64-character hexadecimal SHA-256 digest',
    sample: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    tags: ['sha256', 'hash', 'digest', 'checksum', '哈希'],
    detect: true,
  },
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

function truncateText(value, max = 96) {
  const text = String(value ?? '')
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max - 1)}…`
}

function stripTriggerPrefix(rawInput) {
  const trimmed = normalizeText(rawInput)
  if (!trimmed) {
    return ''
  }
  const lower = trimmed.toLowerCase()
  for (const prefix of TRIGGER_PREFIXES) {
    const lowerPrefix = prefix.toLowerCase()
    if (lower === lowerPrefix) {
      return ''
    }
    if (lower.startsWith(`${lowerPrefix} `) || lower.startsWith(`${lowerPrefix}:`)) {
      return trimmed.slice(prefix.length + 1).trim()
    }
  }
  return trimmed
}

function escapeSlashesForJs(pattern) {
  let result = ''
  let escaped = false
  let inClass = false
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]
    if (escaped) {
      result += ch
      escaped = false
      continue
    }
    if (ch === '\\') {
      result += ch
      escaped = true
      continue
    }
    if (ch === '[') {
      inClass = true
      result += ch
      continue
    }
    if (ch === ']' && inClass) {
      inClass = false
      result += ch
      continue
    }
    if (ch === '/' && !inClass) {
      result += '\\/'
      continue
    }
    result += ch
  }
  return result
}

function formatJsLiteral(pattern, flags = '') {
  const safePattern = escapeSlashesForJs(pattern || '(?:)')
  return `/${safePattern}/${flags}`
}

function formatPythonRawString(pattern) {
  const text = String(pattern ?? '')
  const needsEscapeTrailingBackslash = /(?:^|[^\\])(?:\\\\)*\\$/.test(text)
  if (needsEscapeTrailingBackslash) {
    return JSON.stringify(text)
  }
  if (!text.includes('"')) {
    return `r"${text}"`
  }
  if (!text.includes('\'')) {
    return `r'${text}'`
  }
  if (!text.includes('"""')) {
    return `r"""${text}"""`
  }
  return JSON.stringify(text)
}

function formatPythonRegex(pattern, flags = '') {
  const rawLiteral = formatPythonRawString(pattern)
  const pyFlags = []
  if (flags.includes('i')) {
    pyFlags.push('re.IGNORECASE')
  }
  if (flags.includes('m')) {
    pyFlags.push('re.MULTILINE')
  }
  if (flags.includes('s')) {
    pyFlags.push('re.DOTALL')
  }
  if (pyFlags.length === 0) {
    return rawLiteral
  }
  return `re.compile(${rawLiteral}, ${pyFlags.join(' | ')})`
}

function convertReplacementToPython(replacement) {
  return String(replacement ?? '')
    .replace(/\$\$/g, '$')
    .replace(/\$<([a-z_]\w*)>/gi, '\\g<$1>')
    .replace(/\$(\d{1,2})/g, '\\g<$1>')
    .replace(/\$&/g, '\\g<0>')
}

function formatJsReplaceSnippet(pattern, replacement, flags) {
  const jsFlags = flags.includes('g') ? flags : `${flags}g`
  return `text.replace(${formatJsLiteral(pattern, jsFlags)}, ${JSON.stringify(replacement)})`
}

function formatPythonSubSnippet(pattern, replacement, flags) {
  const pyPattern = formatPythonRawString(pattern)
  const pyRepl = formatPythonRawString(convertReplacementToPython(replacement))
  const pyFlags = []
  if (flags.includes('i')) {
    pyFlags.push('re.IGNORECASE')
  }
  if (flags.includes('m')) {
    pyFlags.push('re.MULTILINE')
  }
  if (flags.includes('s')) {
    pyFlags.push('re.DOTALL')
  }
  const flagArg = pyFlags.length > 0 ? `, flags=${pyFlags.join(' | ')}` : ''
  const countArg = flags.includes('g') ? '' : ', count=1'
  return `re.sub(${pyPattern}, ${pyRepl}, text${countArg}${flagArg})`
}

function scanRegexDelimiter(input, startIndex) {
  let escaped = false
  let inClass = false
  for (let i = startIndex; i < input.length; i += 1) {
    const ch = input[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '[') {
      inClass = true
      continue
    }
    if (ch === ']' && inClass) {
      inClass = false
      continue
    }
    if (ch === '/' && !inClass) {
      return i
    }
  }
  return -1
}

function scanReplacementDelimiter(input, startIndex) {
  let escaped = false
  for (let i = startIndex; i < input.length; i += 1) {
    const ch = input[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\') {
      escaped = true
      continue
    }
    if (ch === '/') {
      return i
    }
  }
  return -1
}

function unescapeSedSegment(segment) {
  return String(segment ?? '').replace(/\\\//g, '/')
}

function validateFlags(rawFlags) {
  const seen = new Set()
  const invalid = []
  for (const ch of rawFlags) {
    if (!VALID_FLAGS.has(ch)) {
      invalid.push(ch)
    }
    else {
      seen.add(ch)
    }
  }
  if (invalid.length > 0) {
    return { ok: false, error: `Unsupported regex flag(s): ${invalid.join(', ')}` }
  }
  if (seen.has('u') && seen.has('v')) {
    return { ok: false, error: 'Flags "u" and "v" cannot be combined' }
  }
  return { ok: true, flags: Array.from(seen).join('') }
}

function parseRegexQuery(rawText) {
  const input = stripTriggerPrefix(rawText)
  if (!input) {
    return { mode: 'empty' }
  }

  // Sed-style replace: s/pattern/replacement/flags :: sample (or space-separated sample)
  if (input.startsWith('s/')) {
    const patternEnd = scanRegexDelimiter(input, 2)
    if (patternEnd > 1) {
      const replEnd = scanReplacementDelimiter(input, patternEnd + 1)
      if (replEnd > patternEnd) {
        const pattern = input.slice(2, patternEnd)
        const replacement = unescapeSedSegment(input.slice(patternEnd + 1, replEnd))
        const tail = input.slice(replEnd + 1)
        const flagMatch = /^[a-z]*/i.exec(tail)
        const rawFlags = flagMatch ? flagMatch[0] : ''
        const remainder = tail.slice(rawFlags.length).trim()

        let sample = ''
        let hasSample = false
        if (remainder.startsWith('::')) {
          sample = remainder.slice(2).trimStart()
          hasSample = true
        }
        else if (remainder.startsWith('|')) {
          sample = remainder.slice(1).trimStart()
          hasSample = true
        }
        else if (remainder.length > 0) {
          sample = remainder
          hasSample = true
        }

        return {
          mode: 'replace',
          pattern,
          replacement,
          rawFlags,
          sample,
          hasSample,
        }
      }
    }
  }

  // Literal regex: /pattern/flags [=> repl] [:: sample | sample]
  if (input.startsWith('/')) {
    let patternEnd = scanRegexDelimiter(input, 1)
    if (patternEnd < 0) {
      // Fall back to delimiter scan ignoring unclosed `[` so `new RegExp` surfaces syntax errors
      patternEnd = scanReplacementDelimiter(input, 1)
    }
    if (patternEnd > 0) {
      const pattern = input.slice(1, patternEnd)
      const tail = input.slice(patternEnd + 1)
      const flagMatch = /^[a-z]*/i.exec(tail)
      const rawFlags = flagMatch ? flagMatch[0] : ''
      const remainder = tail.slice(rawFlags.length).trim()

      // Arrow replace: /pattern/flags => replacement :: sample
      const arrowMatch = /^(?:=>|->)/.exec(remainder)
      if (arrowMatch) {
        const afterArrow = remainder.slice(arrowMatch[0].length).trimStart()
        const sepIdx = afterArrow.indexOf('::')
        if (sepIdx >= 0) {
          return {
            mode: 'replace',
            pattern,
            replacement: afterArrow.slice(0, sepIdx).trim(),
            rawFlags,
            sample: afterArrow.slice(sepIdx + 2).trimStart(),
            hasSample: true,
          }
        }
        return {
          mode: 'replace',
          pattern,
          replacement: afterArrow.trim(),
          rawFlags,
          sample: '',
          hasSample: false,
        }
      }

      if (!remainder) {
        return {
          mode: 'inspect',
          pattern,
          rawFlags,
          sample: '',
          hasSample: false,
        }
      }

      let sample = remainder
      if (remainder.startsWith('::')) {
        sample = remainder.slice(2).trimStart()
      }
      else if (remainder.startsWith('|')) {
        sample = remainder.slice(1).trimStart()
      }

      return {
        mode: 'test',
        pattern,
        rawFlags,
        sample,
        hasSample: true,
      }
    }
  }

  const lower = input.toLowerCase()
  if (lower === 'lib' || lower === 'library' || lower === 'list' || lower === 'presets' || lower === '库') {
    return { mode: 'library', keyword: '' }
  }
  if (lower.startsWith('lib ') || lower.startsWith('library ')) {
    const keyword = input.slice(input.indexOf(' ') + 1).trim()
    return { mode: 'library', keyword }
  }

  return { mode: 'library', keyword: input }
}

function readQuantifierAt(pattern, index) {
  const ch = pattern[index]
  if (ch === '*' || ch === '+') {
    const lazy = pattern[index + 1] === '?'
    return {
      endIndex: index + (lazy ? 2 : 1),
      unbounded: true,
      maxBound: Infinity,
      raw: pattern.slice(index, index + (lazy ? 2 : 1)),
    }
  }
  if (ch === '?') {
    const lazy = pattern[index + 1] === '?'
    return {
      endIndex: index + (lazy ? 2 : 1),
      unbounded: false,
      maxBound: 1,
      raw: pattern.slice(index, index + (lazy ? 2 : 1)),
    }
  }
  if (ch === '{') {
    const match = /^\{(\d+)(?:,(\d*))?\}\??/.exec(pattern.slice(index))
    if (match) {
      const min = Number.parseInt(match[1], 10)
      const hasComma = match[0].includes(',')
      const max = !hasComma
        ? min
        : (match[2] === '' ? Infinity : Number.parseInt(match[2], 10))
      return {
        endIndex: index + match[0].length,
        unbounded: max === Infinity || max >= 4,
        maxBound: max,
        raw: match[0],
      }
    }
  }
  return null
}

function branchesOverlapRisk(branches) {
  if (branches.length < 2) {
    return false
  }
  const normalized = branches.map(b => b.trim()).filter(Boolean)
  if (normalized.length < 2) {
    return false
  }
  const unique = new Set(normalized)
  if (unique.size < normalized.length) {
    return true
  }
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const a = normalized[i]
      const b = normalized[j]
      if (a.startsWith(b) || b.startsWith(a)) {
        return true
      }
      const pair = [a, b].sort().join('|')
      if (
        a === '.'
        || b === '.'
        || pair === '\\d|\\w'
        || pair === '\\S|\\d'
        || pair === '\\S|\\w'
        || pair === '\\D|\\w'
      ) {
        return true
      }
    }
  }
  return false
}

function readEscapedAtomEnd(pattern, backslashIndex) {
  const next = pattern[backslashIndex + 1]
  if (!next) {
    return backslashIndex
  }
  if ((next === 'p' || next === 'P' || next === 'u') && pattern[backslashIndex + 2] === '{') {
    const closeBrace = pattern.indexOf('}', backslashIndex + 3)
    if (closeBrace > backslashIndex + 2) {
      return closeBrace
    }
  }
  if (next === 'x' && /^[0-9a-f]{2}/i.test(pattern.slice(backslashIndex + 2, backslashIndex + 4))) {
    return backslashIndex + 3
  }
  if (next === 'u' && /^[0-9a-f]{4}/i.test(pattern.slice(backslashIndex + 2, backslashIndex + 6))) {
    return backslashIndex + 5
  }
  return backslashIndex + 1
}

function analyzeRedosRisk(pattern) {
  const issues = []
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      level: 'high',
      safe: false,
      issues: [`Pattern length ${pattern.length} exceeds safe limit (${MAX_PATTERN_LENGTH})`],
    }
  }

  let inClass = false
  const groupStack = []
  let consecutiveWildcardRuns = 0

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]
    if (ch === '\\') {
      const atomEnd = readEscapedAtomEnd(pattern, i)
      const atom = pattern.slice(i, atomEnd + 1)
      i = atomEnd
      if (inClass) {
        continue
      }
      if (groupStack.length > 0) {
        const top = groupStack[groupStack.length - 1]
        top.branches[top.branches.length - 1] += atom
      }
      const nextQ = readQuantifierAt(pattern, i + 1)
      if (nextQ) {
        if (nextQ.maxBound !== Infinity && nextQ.maxBound > MAX_QUANTIFIER_BOUND) {
          issues.push(`Excessive quantifier bound ${nextQ.raw} exceeds ${MAX_QUANTIFIER_BOUND}`)
        }
        if (nextQ.unbounded && groupStack.length > 0) {
          groupStack[groupStack.length - 1].hasInnerQuantifier = true
        }
        i = nextQ.endIndex - 1
      }
      else {
        consecutiveWildcardRuns = 0
      }
      continue
    }
    if (ch === '[' && !inClass) {
      inClass = true
      continue
    }
    if (ch === ']' && inClass) {
      inClass = false
      const q = readQuantifierAt(pattern, i + 1)
      if (q) {
        if (q.maxBound !== Infinity && q.maxBound > MAX_QUANTIFIER_BOUND) {
          issues.push(`Excessive quantifier bound ${q.raw} exceeds ${MAX_QUANTIFIER_BOUND}`)
        }
        if (q.unbounded && groupStack.length > 0) {
          groupStack[groupStack.length - 1].hasInnerQuantifier = true
        }
        i = q.endIndex - 1
      }
      continue
    }
    if (inClass) {
      continue
    }

    if (ch === '(') {
      const isLookaround = /^\(\?(?:=|!|<=|<!)/.test(pattern.slice(i))
      let bodyStart = i + 1
      if (pattern[bodyStart] === '?') {
        const rest = pattern.slice(bodyStart)
        if (rest.startsWith('?<=') || rest.startsWith('?<!')) {
          bodyStart += 3
        }
        else if (rest.startsWith('?:') || rest.startsWith('?=') || rest.startsWith('?!')) {
          bodyStart += 2
        }
        else if (rest.startsWith('?<')) {
          const closeAngle = pattern.indexOf('>', bodyStart + 2)
          if (closeAngle > bodyStart) {
            bodyStart = closeAngle + 1
          }
        }
        else {
          const modMatch = /^\?[a-z-]*:/i.exec(rest)
          if (modMatch) {
            bodyStart += modMatch[0].length
          }
        }
      }
      groupStack.push({
        start: i,
        bodyStart,
        hasInnerQuantifier: false,
        isLookaround,
        branches: [''],
      })
      i = bodyStart - 1
      continue
    }

    if (ch === '|' && groupStack.length > 0) {
      groupStack[groupStack.length - 1].branches.push('')
      continue
    }

    if (ch === ')' && groupStack.length > 0) {
      const group = groupStack.pop()
      const q = readQuantifierAt(pattern, i + 1)
      const groupText = pattern.slice(group.start, i + 1)
      if (q) {
        if (q.maxBound !== Infinity && q.maxBound > MAX_QUANTIFIER_BOUND) {
          issues.push(`Excessive quantifier bound ${q.raw} exceeds ${MAX_QUANTIFIER_BOUND}`)
        }
        if (q.unbounded) {
          if (group.hasInnerQuantifier) {
            issues.push(`Nested quantifier detected: ${truncateText(groupText + q.raw, 40)}`)
          }
          if (branchesOverlapRisk(group.branches)) {
            issues.push(`Overlapping repeated alternation: ${truncateText(groupText + q.raw, 40)}`)
          }
          if (groupStack.length > 0) {
            groupStack[groupStack.length - 1].hasInnerQuantifier = true
          }
        }
        i = q.endIndex - 1
      }
      else if (group.hasInnerQuantifier && groupStack.length > 0) {
        groupStack[groupStack.length - 1].hasInnerQuantifier = true
      }
      if (groupStack.length > 0) {
        const parent = groupStack[groupStack.length - 1]
        parent.branches[parent.branches.length - 1] += groupText
      }
      continue
    }

    if (groupStack.length > 0) {
      const top = groupStack[groupStack.length - 1]
      top.branches[top.branches.length - 1] += ch
    }

    const nextQ = readQuantifierAt(pattern, i + 1)
    if (nextQ) {
      if (nextQ.maxBound !== Infinity && nextQ.maxBound > MAX_QUANTIFIER_BOUND) {
        issues.push(`Excessive quantifier bound ${nextQ.raw} exceeds ${MAX_QUANTIFIER_BOUND}`)
      }
      if (nextQ.unbounded) {
        if (groupStack.length > 0) {
          groupStack[groupStack.length - 1].hasInnerQuantifier = true
        }
        if (ch === '.') {
          consecutiveWildcardRuns += 1
          if (consecutiveWildcardRuns >= 3) {
            issues.push('Chained unbounded wildcard quantifiers (.*.*.*)')
          }
        }
      }
      i = nextQ.endIndex - 1
    }
    else if (ch !== '^' && ch !== '$') {
      consecutiveWildcardRuns = 0
    }
  }

  // Also check adjacent identical unbounded wildcards like `.*.*` or `.+.+`
  if (/(?:\.\*|\.\+){2,}/.test(pattern)) {
    issues.push('Adjacent unbounded dot quantifiers (.*.* / .+.+)')
  }

  const deduped = Array.from(new Set(issues))
  if (deduped.length > 0) {
    return { level: 'high', safe: false, issues: deduped }
  }
  return { level: 'safe', safe: true, issues: [] }
}

function explainPatternTokens(pattern, flags) {
  const hints = []
  if (pattern.startsWith('^')) {
    hints.push('^ start')
  }
  if (/(?:^|[^\\])(?:\\\\)*\$$/.test(pattern)) {
    hints.push('$ end')
  }
  if (/\\d/.test(pattern)) {
    hints.push('\\d digit')
  }
  if (/\\w/.test(pattern)) {
    hints.push('\\w word')
  }
  if (/\\s/.test(pattern)) {
    hints.push('\\s space')
  }
  if (/\\b/.test(pattern)) {
    hints.push('\\b boundary')
  }
  const namedMatches = pattern.match(/\(\?<[a-z_]\w*>/gi)
  if (namedMatches && namedMatches.length > 0) {
    const names = namedMatches.map(m => m.slice(3, -1))
    hints.push(`named(${names.slice(0, 4).join(', ')})`)
  }
  if (/\(\?:/.test(pattern)) {
    hints.push('(?:) non-capturing')
  }
  if (/\(\?=/.test(pattern)) {
    hints.push('(?=) lookahead')
  }
  if (/\(\?!/.test(pattern)) {
    hints.push('(?!) neg-lookahead')
  }
  if (/\(\?<=/.test(pattern)) {
    hints.push('(?<=) lookbehind')
  }
  if (/\(\?<!/.test(pattern)) {
    hints.push('(?<!) neg-lookbehind')
  }
  if (/\\[1-9]/.test(pattern)) {
    hints.push('backref')
  }
  if (flags) {
    const flagMap = {
      g: 'global',
      i: 'ignoreCase',
      m: 'multiline',
      s: 'dotAll',
      u: 'unicode',
      v: 'unicodeSets',
      d: 'indices',
      y: 'sticky',
    }
    const labels = Array.from(flags).map(f => flagMap[f] || f)
    hints.push(`flags[${labels.join(', ')}]`)
  }
  return hints.length > 0 ? hints.join(' · ') : 'Literal / standard regular expression'
}

function expandReplacementTemplate(template, matchRecord, fullInput) {
  const tpl = String(template ?? '')
  let output = ''
  for (let i = 0; i < tpl.length; i += 1) {
    const ch = tpl[i]
    if (ch !== '$' || i + 1 >= tpl.length) {
      output += ch
      continue
    }
    const next = tpl[i + 1]
    if (next === '$') {
      output += '$'
      i += 1
    }
    else if (next === '&') {
      output += matchRecord.fullMatch
      i += 1
    }
    else if (next === '`') {
      output += fullInput.slice(0, matchRecord.index)
      i += 1
    }
    else if (next === '\'') {
      output += fullInput.slice(matchRecord.end)
      i += 1
    }
    else if (next === '<') {
      const closeIdx = tpl.indexOf('>', i + 2)
      if (closeIdx > i + 2) {
        const groupName = tpl.slice(i + 2, closeIdx)
        if (matchRecord.namedGroups && Object.prototype.hasOwnProperty.call(matchRecord.namedGroups, groupName)) {
          output += matchRecord.namedGroups[groupName] ?? ''
        }
        i = closeIdx
      }
      else {
        output += ch
      }
    }
    else if (next >= '0' && next <= '9') {
      const twoDigits = tpl.slice(i + 1, i + 3)
      let num = Number.parseInt(twoDigits, 10)
      let advance = 2
      if (!/^\d{2}$/.test(twoDigits) || num > matchRecord.groups.length || num === 0) {
        num = Number.parseInt(next, 10)
        advance = 1
      }
      if (num >= 1 && num <= matchRecord.groups.length) {
        output += matchRecord.groups[num - 1] ?? ''
        i += advance
      }
      else {
        output += `$${next}`
        i += 1
      }
    }
    else {
      output += ch
    }
  }
  return output
}

function executeBoundedRegex(pattern, rawFlags, sampleText, options = {}) {
  const flagCheck = validateFlags(rawFlags || '')
  if (!flagCheck.ok) {
    return { ok: false, error: flagCheck.error, errorKind: 'flags' }
  }
  const flags = flagCheck.flags

  const safety = analyzeRedosRisk(pattern)
  if (!safety.safe) {
    return {
      ok: false,
      errorKind: 'redos',
      error: safety.issues[0] || 'Catastrophic backtracking risk detected',
      safety,
      flags,
    }
  }

  let input = String(sampleText ?? '')
  let inputTruncated = false
  if (input.length > MAX_INPUT_LENGTH) {
    input = input.slice(0, MAX_INPUT_LENGTH)
    inputTruncated = true
  }

  let regex
  try {
    regex = new RegExp(pattern, flags)
  }
  catch (error) {
    return {
      ok: false,
      errorKind: 'syntax',
      error: error instanceof Error ? error.message : 'Invalid regular expression',
      flags,
    }
  }

  const maxMatches = options.maxMatches || MAX_MATCHES
  const maxExecMs = options.maxExecMs || MAX_EXEC_MS
  const startedAt = Date.now()
  const matches = []
  let truncatedByCount = false
  let truncatedByTime = false

  const iterative = flags.includes('g') || flags.includes('y')
  if (iterative) {
    regex.lastIndex = 0
    while (true) {
      if (Date.now() - startedAt > maxExecMs) {
        truncatedByTime = true
        break
      }
      if (matches.length >= maxMatches) {
        truncatedByCount = true
        break
      }
      const match = regex.exec(input)
      if (!match) {
        break
      }
      const fullMatch = match[0]
      const index = match.index
      const end = index + fullMatch.length
      const groups = []
      for (let g = 1; g < match.length; g += 1) {
        groups.push(match[g])
      }
      const namedGroups = match.groups ? { ...match.groups } : null
      matches.push({ index, end, fullMatch, groups, namedGroups })

      if (fullMatch.length === 0) {
        if (regex.lastIndex >= input.length) {
          break
        }
        regex.lastIndex += 1
      }
    }
  }
  else {
    const match = regex.exec(input)
    if (match) {
      const fullMatch = match[0]
      const index = match.index
      const end = index + fullMatch.length
      const groups = []
      for (let g = 1; g < match.length; g += 1) {
        groups.push(match[g])
      }
      const namedGroups = match.groups ? { ...match.groups } : null
      matches.push({ index, end, fullMatch, groups, namedGroups })
    }
  }

  const elapsedMs = Date.now() - startedAt
  return {
    ok: true,
    pattern,
    flags,
    input,
    inputTruncated,
    matches,
    truncatedByCount,
    truncatedByTime,
    elapsedMs,
    safety,
  }
}

function executeBoundedReplace(pattern, rawFlags, replacement, sampleText, options = {}) {
  const result = executeBoundedRegex(pattern, rawFlags, sampleText, options)
  if (!result.ok) {
    return result
  }
  const input = result.input
  let cursor = 0
  let replaced = ''
  for (const match of result.matches) {
    replaced += input.slice(cursor, match.index)
    replaced += expandReplacementTemplate(replacement, match, input)
    cursor = match.end
  }
  replaced += input.slice(cursor)
  return {
    ...result,
    replacement,
    replaced,
    replacedCount: result.matches.length,
  }
}

function searchRegexLibrary(keyword) {
  const lower = normalizeText(keyword).toLowerCase()
  if (!lower) {
    return REGEX_LIBRARY.slice(0, 14)
  }

  const scored = REGEX_LIBRARY.map((entry, idx) => {
    let score = 0
    if (entry.id === lower) {
      score = 120
    }
    else if (entry.tags.some(t => t.toLowerCase() === lower)) {
      score = 105
    }
    else if (entry.title.toLowerCase().includes(lower) || entry.zhTitle.toLowerCase().includes(lower)) {
      score = 85
    }
    else if (entry.category.toLowerCase() === lower) {
      score = 75
    }
    else if (entry.tags.some(t => t.toLowerCase().includes(lower))) {
      score = 65
    }
    else if (entry.description.toLowerCase().includes(lower)) {
      score = 45
    }
    return { entry, score, idx }
  })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)

  return scored.map(item => item.entry)
}

function detectMatchingLibraryPatterns(sample) {
  const text = normalizeText(sample)
  if (!text || text.length > 256) {
    return []
  }
  const matched = []
  for (const entry of REGEX_LIBRARY) {
    if (!entry.detect) {
      continue
    }
    try {
      const re = new RegExp(entry.pattern, entry.flags.replace(/g/g, ''))
      const m = re.exec(text)
      if (m && m[0] === text) {
        matched.push(entry)
      }
    }
    catch {
      // ignore invalid library entry
    }
  }
  return matched
}

function buildInfoItem({ id, featureId, title, subtitle, accessory, description }) {
  const Builder = getItemBuilder()
  const builder = new Builder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
    })
  if (accessory) {
    builder.setAccessory(accessory)
  }
  if (description) {
    builder.setDescription(description)
  }
  return builder.build()
}

function buildActionItem({ id, featureId, title, subtitle, accessory, description, actions }) {
  const Builder = getItemBuilder()
  const defaultActionId = actions[0]?.id
  const builder = new Builder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      ...(defaultActionId ? { defaultAction: defaultActionId } : {}),
    })
  if (accessory) {
    builder.setAccessory(accessory)
  }
  if (description) {
    builder.setDescription(description)
  }
  for (const action of actions) {
    builder.createAndAddAction(action.id, 'plugin', action.label, action.payload)
  }
  return builder.build()
}

function buildLibraryCard(featureId, entry, prefix = 'lib') {
  const jsLiteral = formatJsLiteral(entry.pattern, entry.flags)
  const pyRegex = formatPythonRegex(entry.pattern, entry.flags)
  return buildActionItem({
    id: `${featureId}-${prefix}-${entry.id}`,
    featureId,
    title: `${entry.title} · ${entry.zhTitle}`,
    subtitle: `${truncateText(entry.pattern, 78)}  |  e.g. ${truncateText(entry.sample, 32)}`,
    accessory: entry.category.toUpperCase(),
    description: entry.description,
    actions: [
      { id: ACTION_COPY_RAW, label: '复制原始正则 / Copy Raw', payload: { text: entry.pattern } },
      { id: ACTION_COPY_JS, label: '复制 JS RegExp', payload: { text: jsLiteral } },
      { id: ACTION_COPY_PYTHON, label: '复制 Python Regex', payload: { text: pyRegex } },
    ],
  })
}

function formatGroupsSummary(match) {
  const parts = []
  if (match.namedGroups) {
    for (const [key, val] of Object.entries(match.namedGroups)) {
      parts.push(`<${key}>=${val === undefined ? 'undefined' : JSON.stringify(val)}`)
    }
  }
  if (match.groups.length > 0) {
    match.groups.forEach((val, idx) => {
      parts.push(`$${idx + 1}=${val === undefined ? 'undefined' : JSON.stringify(val)}`)
    })
  }
  return parts.length > 0 ? parts.join(' · ') : 'No capture groups'
}

function buildMatchResultItems(featureId, parsed, execResult) {
  const items = []
  const jsLiteral = formatJsLiteral(parsed.pattern, execResult.flags || parsed.rawFlags || '')
  const pyRegex = formatPythonRegex(parsed.pattern, execResult.flags || parsed.rawFlags || '')

  if (!execResult.ok) {
    if (execResult.errorKind === 'redos') {
      items.push(buildInfoItem({
        id: `${featureId}-redos-blocked`,
        featureId,
        title: 'ReDoS Safety Guard Blocked Execution / 已拦截潜在回溯风险',
        subtitle: execResult.error,
        accessory: 'ReDoS Guard',
      }))
      items.push(buildActionItem({
        id: `${featureId}-redos-pattern`,
        featureId,
        title: 'Pattern (Not Executed)',
        subtitle: truncateText(parsed.pattern, 88),
        accessory: 'RAW',
        actions: [
          { id: ACTION_COPY_RAW, label: '复制原始正则 / Copy Raw', payload: { text: parsed.pattern } },
          { id: ACTION_COPY_JS, label: '复制 JS RegExp', payload: { text: jsLiteral } },
          { id: ACTION_COPY_PYTHON, label: '复制 Python Regex', payload: { text: pyRegex } },
        ],
      }))
      return items
    }

    items.push(buildInfoItem({
      id: `${featureId}-syntax-error`,
      featureId,
      title: 'Invalid Regular Expression / 正则语法错误',
      subtitle: truncateText(execResult.error, 110),
      accessory: 'ERROR',
    }))
    return items
  }

  const { matches, flags, truncatedByCount, truncatedByTime, inputTruncated } = execResult
  const notes = []
  if (truncatedByCount) {
    notes.push(`capped at ${MAX_MATCHES} matches`)
  }
  if (truncatedByTime) {
    notes.push(`stopped at ${MAX_EXEC_MS}ms budget`)
  }
  if (inputTruncated) {
    notes.push(`input capped at ${MAX_INPUT_LENGTH} chars`)
  }
  const statusTag = matches.length > 0 ? `${matches.length} match${matches.length > 1 ? 'es' : ''}` : 'No match'

  if (parsed.mode === 'replace') {
    items.push(buildActionItem({
      id: `${featureId}-replace-output`,
      featureId,
      title: `Replace Result: ${truncateText(execResult.replaced, 72)}`,
      subtitle: `${execResult.replacedCount} replacement(s) applied · ${jsLiteral} → ${JSON.stringify(execResult.replacement)}${notes.length ? ` (${notes.join(', ')})` : ''}`,
      accessory: 'REPLACED',
      actions: [
        { id: ACTION_COPY_REPLACED, label: '复制替换结果 / Copy Output', payload: { text: execResult.replaced } },
        { id: ACTION_COPY_JS, label: '复制 JS replace()', payload: { text: formatJsReplaceSnippet(parsed.pattern, execResult.replacement, flags) } },
        { id: ACTION_COPY_PYTHON, label: '复制 Python re.sub()', payload: { text: formatPythonSubSnippet(parsed.pattern, execResult.replacement, flags) } },
        { id: ACTION_COPY_RAW, label: '复制原始正则 / Copy Raw', payload: { text: parsed.pattern } },
      ],
    }))
  }

  // Summary + code export card
  items.push(buildActionItem({
    id: `${featureId}-summary`,
    featureId,
    title: `${jsLiteral}  —  ${statusTag}`,
    subtitle: `${explainPatternTokens(parsed.pattern, flags)}${notes.length ? ` · ${notes.join(', ')}` : ''}`,
    accessory: 'SAFE',
    actions: [
      { id: ACTION_COPY_JS, label: '复制 JS RegExp', payload: { text: jsLiteral } },
      { id: ACTION_COPY_PYTHON, label: '复制 Python Regex', payload: { text: pyRegex } },
      { id: ACTION_COPY_RAW, label: '复制原始正则 / Copy Raw', payload: { text: parsed.pattern } },
    ],
  }))

  if (matches.length > 1) {
    const allLines = matches.map(m => m.fullMatch).join('\n')
    const allJson = JSON.stringify(matches.map(m => ({
      match: m.fullMatch,
      index: m.index,
      end: m.end,
      groups: m.groups,
      ...(m.namedGroups ? { namedGroups: m.namedGroups } : {}),
    })), null, 2)
    items.push(buildActionItem({
      id: `${featureId}-all-matches`,
      featureId,
      title: `All Matches (${matches.length})`,
      subtitle: truncateText(matches.map(m => JSON.stringify(m.fullMatch)).join(', '), 92),
      accessory: 'LIST',
      actions: [
        { id: ACTION_COPY_TEXT, label: '复制全部匹配（按行）/ Copy Lines', payload: { text: allLines } },
        { id: ACTION_COPY_GROUPS, label: '复制匹配 JSON / Copy JSON', payload: { text: allJson } },
      ],
    }))
  }

  // Individual match + capture group inspector cards
  const visibleMatches = matches.slice(0, MAX_DETAIL_MATCH_CARDS)
  visibleMatches.forEach((match, idx) => {
    const groupPayload = JSON.stringify({
      match: match.fullMatch,
      index: match.index,
      end: match.end,
      groups: match.groups,
      ...(match.namedGroups ? { namedGroups: match.namedGroups } : {}),
    }, null, 2)
    items.push(buildActionItem({
      id: `${featureId}-match-${idx + 1}`,
      featureId,
      title: `Match #${idx + 1}: ${JSON.stringify(truncateText(match.fullMatch, 64))}`,
      subtitle: formatGroupsSummary(match),
      accessory: `[${match.index}..${match.end}]`,
      actions: [
        { id: ACTION_COPY_MATCH, label: '复制匹配文本 / Copy Match', payload: { text: match.fullMatch } },
        { id: ACTION_COPY_GROUPS, label: '复制捕获组 JSON / Copy Groups', payload: { text: groupPayload } },
      ],
    }))
  })

  // Dedicated JS / Python copy cards for fast keyboard selection
  items.push(buildActionItem({
    id: `${featureId}-export-python`,
    featureId,
    title: `Python: ${truncateText(parsed.mode === 'replace' ? formatPythonSubSnippet(parsed.pattern, execResult.replacement, flags) : pyRegex, 76)}`,
    subtitle: 'Enter to copy Python regex snippet',
    accessory: 'PYTHON',
    actions: [
      {
        id: ACTION_COPY_PYTHON,
        label: '复制 Python 代码',
        payload: {
          text: parsed.mode === 'replace'
            ? formatPythonSubSnippet(parsed.pattern, execResult.replacement, flags)
            : pyRegex,
        },
      },
      { id: ACTION_COPY_RAW, label: '复制原始正则', payload: { text: parsed.pattern } },
    ],
  }))

  return items
}

function buildResultItems(featureId, rawQuery) {
  const parsed = parseRegexQuery(rawQuery)

  if (parsed.mode === 'empty') {
    const items = [
      buildInfoItem({
        id: `${featureId}-guide`,
        featureId,
        title: 'Regex Lab — Live Test · Replace · 26 Patterns',
        subtitle: 'Test: /(?<k>\\w+)=(\\d+)/g :: a=1 b=2  |  Replace: s/foo/bar/gi :: Foo foo  |  Search: email / semver / ipv4',
        accessory: 'GUIDE',
      }),
    ]
    for (const entry of REGEX_LIBRARY.slice(0, 12)) {
      items.push(buildLibraryCard(featureId, entry))
    }
    return items
  }

  if (parsed.mode === 'inspect') {
    const flagCheck = validateFlags(parsed.rawFlags || '')
    if (!flagCheck.ok) {
      return [
        buildInfoItem({
          id: `${featureId}-flag-error`,
          featureId,
          title: 'Invalid Regex Flags / 标志位无效',
          subtitle: flagCheck.error,
          accessory: 'ERROR',
        }),
      ]
    }
    const safety = analyzeRedosRisk(parsed.pattern)
    try {
      // Syntax validation only (no execution on input)
      void new RegExp(parsed.pattern, flagCheck.flags)
    }
    catch (error) {
      return [
        buildInfoItem({
          id: `${featureId}-inspect-error`,
          featureId,
          title: 'Invalid Regular Expression / 正则语法错误',
          subtitle: truncateText(error instanceof Error ? error.message : 'Syntax error', 110),
          accessory: 'ERROR',
        }),
      ]
    }
    const jsLiteral = formatJsLiteral(parsed.pattern, flagCheck.flags)
    const pyRegex = formatPythonRegex(parsed.pattern, flagCheck.flags)
    const items = [
      buildActionItem({
        id: `${featureId}-inspect-summary`,
        featureId,
        title: `${jsLiteral}  ${safety.safe ? '· ReDoS Safe' : '· ReDoS Warning'}`,
        subtitle: safety.safe
          ? `${explainPatternTokens(parsed.pattern, flagCheck.flags)}  (append ":: sample text" to test)`
          : safety.issues[0],
        accessory: safety.safe ? 'VALID' : 'ReDoS RISK',
        actions: [
          { id: ACTION_COPY_RAW, label: '复制原始正则 / Copy Raw', payload: { text: parsed.pattern } },
          { id: ACTION_COPY_JS, label: '复制 JS RegExp', payload: { text: jsLiteral } },
          { id: ACTION_COPY_PYTHON, label: '复制 Python Regex', payload: { text: pyRegex } },
        ],
      }),
      buildActionItem({
        id: `${featureId}-inspect-js`,
        featureId,
        title: `JavaScript: ${truncateText(jsLiteral, 78)}`,
        subtitle: 'Copy JavaScript RegExp literal',
        accessory: 'JS',
        actions: [{ id: ACTION_COPY_JS, label: '复制 JS RegExp', payload: { text: jsLiteral } }],
      }),
      buildActionItem({
        id: `${featureId}-inspect-python`,
        featureId,
        title: `Python: ${truncateText(pyRegex, 78)}`,
        subtitle: 'Copy Python regex expression',
        accessory: 'PYTHON',
        actions: [{ id: ACTION_COPY_PYTHON, label: '复制 Python Regex', payload: { text: pyRegex } }],
      }),
    ]
    return items
  }

  if (parsed.mode === 'test') {
    const execResult = executeBoundedRegex(parsed.pattern, parsed.rawFlags, parsed.sample)
    return buildMatchResultItems(featureId, parsed, execResult)
  }

  if (parsed.mode === 'replace') {
    if (!parsed.hasSample) {
      const flagCheck = validateFlags(parsed.rawFlags || '')
      if (!flagCheck.ok) {
        return [
          buildInfoItem({
            id: `${featureId}-replace-flag-err`,
            featureId,
            title: 'Invalid Regex Flags / 标志位无效',
            subtitle: flagCheck.error,
            accessory: 'ERROR',
          }),
        ]
      }
      const jsSnippet = formatJsReplaceSnippet(parsed.pattern, parsed.replacement, flagCheck.flags)
      const pySnippet = formatPythonSubSnippet(parsed.pattern, parsed.replacement, flagCheck.flags)
      return [
        buildActionItem({
          id: `${featureId}-replace-hint`,
          featureId,
          title: `Replace Ready: /${parsed.pattern}/${flagCheck.flags} → ${JSON.stringify(parsed.replacement)}`,
          subtitle: 'Append ":: sample text" to preview live replacement',
          accessory: 'REPLACE',
          actions: [
            { id: ACTION_COPY_JS, label: '复制 JS replace()', payload: { text: jsSnippet } },
            { id: ACTION_COPY_PYTHON, label: '复制 Python re.sub()', payload: { text: pySnippet } },
            { id: ACTION_COPY_RAW, label: '复制原始正则', payload: { text: parsed.pattern } },
          ],
        }),
      ]
    }
    const execResult = executeBoundedReplace(parsed.pattern, parsed.rawFlags, parsed.replacement, parsed.sample)
    return buildMatchResultItems(featureId, parsed, execResult)
  }

  // Library search + smart auto-detection for literal samples
  const libMatches = searchRegexLibrary(parsed.keyword)
  const detected = parsed.keyword ? detectMatchingLibraryPatterns(parsed.keyword) : []
  const items = []
  const seenIds = new Set()

  for (const entry of detected) {
    seenIds.add(entry.id)
    const jsLiteral = formatJsLiteral(entry.pattern, entry.flags)
    const pyRegex = formatPythonRegex(entry.pattern, entry.flags)
    items.push(buildActionItem({
      id: `${featureId}-detected-${entry.id}`,
      featureId,
      title: `Matches ${entry.title} (${entry.zhTitle})`,
      subtitle: `Pattern: ${truncateText(entry.pattern, 82)}`,
      accessory: 'MATCHED',
      actions: [
        { id: ACTION_COPY_RAW, label: '复制原始正则 / Copy Raw', payload: { text: entry.pattern } },
        { id: ACTION_COPY_JS, label: '复制 JS RegExp', payload: { text: jsLiteral } },
        { id: ACTION_COPY_PYTHON, label: '复制 Python Regex', payload: { text: pyRegex } },
      ],
    }))
  }

  for (const entry of libMatches) {
    if (seenIds.has(entry.id)) {
      continue
    }
    seenIds.add(entry.id)
    items.push(buildLibraryCard(featureId, entry))
  }

  if (items.length === 0) {
    items.push(buildInfoItem({
      id: `${featureId}-empty`,
      featureId,
      title: 'No Matching Pattern Found / 未找到匹配正则',
      subtitle: 'Try "/\\d+/g :: order-42", "s/a/b/g :: banana", or keywords like email, ipv4, semver, jwt, uuid',
      accessory: 'HINT',
    }))
  }

  return items
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
            title: 'Regex Lab Error / 正则实验室运行异常',
            subtitle: '请检查表达式格式后重试',
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
