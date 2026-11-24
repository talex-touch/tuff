import YAML from 'yaml'

export interface ParsedMcpProfile {
  rootKey: string
  name: string
  type: 'stdio' | 'http'
  command?: string
  args?: string[]
  cwd?: string
  env: Record<string, string>
  url?: string
  headers: Record<string, string>
  bearerToken?: string
  requiresReauth: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function splitTopLevel(value: string, separator = ','): string[] {
  const parts: string[] = []
  let start = 0
  let quote = ''
  let escaped = false
  let depth = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!
    if (quote) {
      if (escaped) escaped = false
      else if (quote === '"' && char === '\\') escaped = true
      else if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '[' || char === '{') depth += 1
    else if (char === ']' || char === '}') depth -= 1
    else if (char === separator && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

const BASIC_STRING_ESCAPES: Record<string, string> = {
  b: '\b',
  t: '\t',
  n: '\n',
  f: '\f',
  r: '\r',
  '"': '"',
  "'": "'",
  '\\': '\\'
}

function unescapeBasicTomlString(value: string, allowLineContinuation = true): string {
  const pattern = allowLineContinuation
    ? /\\(?:([btnfr"'\\])|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|([ \t]*\r?\n[ \t\r\n]*))/g
    : /\\(?:([btnfr"'\\])|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8}))/g
  return value.replace(pattern, (match, simple?: string, u4?: string, u8?: string) => {
    if (simple) return BASIC_STRING_ESCAPES[simple]!
    if (u4 || u8) {
      try {
        return String.fromCodePoint(Number.parseInt((u4 ?? u8)!, 16))
      } catch {
        return match
      }
    }
    return ''
  })
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"'))
    return unescapeBasicTomlString(trimmed.slice(1, -1), false)
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'"))
    return trimmed.slice(1, -1)
  return trimmed
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']'))
    return splitTopLevel(trimmed.slice(1, -1)).map(parseScalar)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const result: Record<string, unknown> = {}
    for (const entry of splitTopLevel(trimmed.slice(1, -1))) {
      const separator = entry.indexOf('=') >= 0 ? entry.indexOf('=') : entry.indexOf(':')
      if (separator <= 0) return null
      result[unquote(entry.slice(0, separator))] = parseScalar(entry.slice(separator + 1))
    }
    return result
  }
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return unquote(trimmed)
}

function uncommentToml(line: string): string {
  let quote = ''
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!
    if (quote) {
      if (escaped) escaped = false
      else if (quote === '"' && char === '\\') escaped = true
      else if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '#') return line.slice(0, index)
  }
  return line
}

function setPath(root: Record<string, unknown>, path: string[], value: unknown): boolean {
  if (path.length === 0 || path.some((key) => !key)) return false
  let current = root
  for (const key of path.slice(0, -1)) {
    const existing = current[key]
    if (existing === undefined) current[key] = {}
    else if (!isRecord(existing)) return false
    current = current[key] as Record<string, unknown>
  }
  const last = path.at(-1)!
  if (current[last] !== undefined) return false
  current[last] = value
  return true
}

function findClosingTripleQuote(line: string, delimiter: '"""' | "'''", fromIndex: number): number {
  let escaped = false
  for (let index = fromIndex; index < line.length; index += 1) {
    const char = line[index]!
    if (delimiter === '"""') {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
    }
    if (line.startsWith(delimiter, index)) return index
  }
  return -1
}

function parseToml(content: string): Record<string, unknown> | null {
  const root: Record<string, unknown> = {}
  let section: string[] = []
  const lines = content.split(/\r?\n/)
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex]!
    const trimmedStart = rawLine.trimStart()
    if (!trimmedStart || trimmedStart.startsWith('#')) continue
    const equals = rawLine.indexOf('=')
    const firstNonSpace = trimmedStart[0]
    if (firstNonSpace === '[') {
      const line = uncommentToml(rawLine).trim()
      const sectionMatch = /^\[([^\]]+)]$/.exec(line)
      if (!sectionMatch) return null
      section = splitTopLevel(sectionMatch[1]!, '.').map(unquote)
      if (!setPath(root, section, {})) return null
      continue
    }
    if (equals <= 0) return null
    const key = splitTopLevel(rawLine.slice(0, equals), '.').map(unquote)
    const rawValue = rawLine.slice(equals + 1).trimStart()
    if (rawValue.startsWith('"""') || rawValue.startsWith("'''")) {
      const delimiter: '"""' | "'''" = rawValue.startsWith('"""') ? '"""' : "'''"
      const rest = rawValue.slice(3)
      const sameLineClose = findClosingTripleQuote(rest, delimiter, 0)
      let body: string
      let trailing: string
      if (sameLineClose >= 0) {
        body = rest.slice(0, sameLineClose)
        trailing = rest.slice(sameLineClose + 3)
      } else {
        const chunks: string[] = rest ? [rest] : []
        let closed = false
        trailing = ''
        while (++lineIndex < lines.length) {
          const nextLine = lines[lineIndex]!
          const closeIndex = findClosingTripleQuote(nextLine, delimiter, 0)
          if (closeIndex >= 0) {
            chunks.push(nextLine.slice(0, closeIndex))
            trailing = nextLine.slice(closeIndex + 3)
            closed = true
            break
          }
          chunks.push(nextLine)
        }
        if (!closed) return null
        body = chunks.join('\n')
      }
      if (uncommentToml(trailing).trim()) return null
      const parsedValue = delimiter === '"""' ? unescapeBasicTomlString(body) : body
      if (!setPath(root, [...section, ...key], parsedValue)) return null
      continue
    }
    const line = uncommentToml(rawLine).trim()
    const cleanEquals = line.indexOf('=')
    if (cleanEquals <= 0) return null
    if (!setPath(root, [...section, ...key], parseScalar(line.slice(cleanEquals + 1)))) return null
  }
  return root
}

function parseYaml(content: string): Record<string, unknown> | null {
  const root: Record<string, unknown> = {}
  const stack: Array<{ indent: number; value: Record<string, unknown> }> = [
    { indent: -1, value: root }
  ]
  for (const rawLine of content.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#') || /^\s*---\s*$/.test(rawLine))
      continue
    const match = /^(\s*)([^:#][^:]*):(?:\s*(.*))?$/.exec(rawLine)
    if (!match || /\t/.test(match[1]!)) return null
    const indent = match[1]!.length
    while (stack.length > 1 && indent <= stack.at(-1)!.indent) stack.pop()
    const parent = stack.at(-1)!
    if (indent <= parent.indent) return null
    const key = unquote(match[2]!.trim())
    const rawValue = match[3]?.trim() ?? ''
    if (!key || parent.value[key] !== undefined) return null
    if (!rawValue) {
      const child: Record<string, unknown> = {}
      parent.value[key] = child
      stack.push({ indent, value: child })
      continue
    }
    parent.value[key] = parseScalar(rawValue.replace(/\s+#.*$/, ''))
  }
  return root
}

export function stripJsonComments(content: string): string {
  let result = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]!
    const next = content[index + 1]
    if (inString) {
      result += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      result += char
      continue
    }
    if (char === '/' && next === '/') {
      while (index < content.length && content[index] !== '\n') index += 1
      result += '\n'
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < content.length && !(content[index] === '*' && content[index + 1] === '/'))
        index += 1
      index += 1
      continue
    }
    result += char
  }
  return result.replace(/,\s*([}\]])/g, '$1')
}

export function parseConfig(content: string, extension: string): Record<string, unknown> | null {
  try {
    if (extension === '.json' || extension === '.jsonc') {
      const parsed = JSON.parse(stripJsonComments(content))
      return isRecord(parsed) ? parsed : null
    }
    if (extension === '.toml') return parseToml(content)
    if (extension === '.yaml' || extension === '.yml') {
      try {
        const parsed = YAML.parse(content)
        return isRecord(parsed) ? parsed : null
      } catch {
        return parseYaml(content)
      }
    }
    return null
  } catch {
    return null
  }
}

export function parseJsonLikeConfig(
  content: string,
  extension: string
): Record<string, unknown> | null {
  return parseConfig(content, extension)
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    if (url.username || url.password) return false
    for (const key of url.searchParams.keys()) {
      if (/token|api.?key|secret|password|credential|authorization/i.test(key)) return false
    }
    return true
  } catch {
    return false
  }
}

export function parseMcpProfiles(config: Record<string, unknown>): ParsedMcpProfile[] {
  const rootEntry = ['mcp_servers', 'mcpServers', 'mcp']
    .map((key) => [key, config[key]] as const)
    .find((entry): entry is readonly [string, Record<string, unknown>] => isRecord(entry[1]))
  if (!rootEntry) return []
  const [rootKey, profiles] = rootEntry
  const result: ParsedMcpProfile[] = []
  for (const [name, rawProfile] of Object.entries(profiles)) {
    if (!name.trim() || !isRecord(rawProfile)) continue
    const command =
      typeof rawProfile.command === 'string' && rawProfile.command.trim()
        ? rawProfile.command.trim()
        : undefined
    // Gemini CLI uses `httpUrl` for streamable HTTP and Antigravity's `mcp_config.json` uses
    // `serverUrl`; honor them only when `url` is absent so an invalid `url` never falls through.
    const rawUrl =
      rawProfile.url !== undefined
        ? rawProfile.url
        : rawProfile.httpUrl !== undefined
          ? rawProfile.httpUrl
          : rawProfile.serverUrl
    const url = isHttpUrl(rawUrl) ? rawUrl : undefined
    if ((command ? 1 : 0) + (url ? 1 : 0) !== 1) continue
    const args = Array.isArray(rawProfile.args)
      ? rawProfile.args.filter((value): value is string => typeof value === 'string')
      : undefined
    const type = command ? 'stdio' : 'http'
    const declaredType = rawProfile.type
    if (
      declaredType !== undefined &&
      (typeof declaredType !== 'string' ||
        !['stdio', 'http', 'streamable-http', 'sse'].includes(declaredType))
    )
      continue
    result.push({
      rootKey,
      name,
      type,
      command,
      args,
      cwd: typeof rawProfile.cwd === 'string' ? rawProfile.cwd : undefined,
      env: stringRecord(rawProfile.env),
      url,
      headers: stringRecord(rawProfile.headers),
      bearerToken:
        typeof rawProfile.bearer_token === 'string'
          ? rawProfile.bearer_token
          : typeof rawProfile.bearerToken === 'string'
            ? rawProfile.bearerToken
            : typeof rawProfile.token === 'string'
              ? rawProfile.token
              : undefined,
      requiresReauth: Boolean(
        rawProfile.oauth ||
        rawProfile.oauth2 ||
        rawProfile.client_secret ||
        rawProfile.clientSecret ||
        rawProfile.client_id ||
        rawProfile.clientId ||
        args?.some((arg) =>
          /token|api.?key|secret|password|credential|authorization|\$reauth-required/i.test(arg)
        )
      )
    })
  }
  return result
}

export interface ParsedImportedModel {
  id: string
  name?: string
  reasoning?: boolean
  input?: string[]
  contextWindow?: number
  maxTokens?: number
  thinkingLevelMap?: Record<string, string | null>
}

export interface ParsedModelProvider {
  rootKey: string
  id: string
  name: string
  api: 'openai' | 'openai-responses' | 'anthropic' | 'custom'
  baseUrl?: string
  apiKey?: string
  headers: Record<string, string>
  models: ParsedImportedModel[]
  defaultModel?: string
  source: 'pi' | 'omp' | 'codex' | 'claude'
}

export function parseModelProviders(
  config: Record<string, unknown>,
  sourceHint?: string
): ParsedModelProvider[] {
  const result: ParsedModelProvider[] = []

  if (isRecord(config.providers)) {
    for (const [providerKey, providerVal] of Object.entries(config.providers)) {
      if (!providerKey.trim() || !isRecord(providerVal)) continue
      const baseUrl =
        typeof providerVal.baseUrl === 'string' && providerVal.baseUrl.trim()
          ? providerVal.baseUrl.trim()
          : undefined
      const apiKey =
        typeof providerVal.apiKey === 'string' && providerVal.apiKey.trim()
          ? providerVal.apiKey.trim()
          : undefined
      const rawApi = typeof providerVal.api === 'string' ? providerVal.api.trim() : 'openai'
      let api: ParsedModelProvider['api'] = 'openai'
      if (rawApi === 'openai-responses') api = 'openai-responses'
      else if (rawApi === 'anthropic') api = 'anthropic'
      else if (rawApi === 'custom') api = 'custom'

      const headers = isRecord(providerVal.headers) ? stringRecord(providerVal.headers) : {}
      const models: ParsedImportedModel[] = []
      if (Array.isArray(providerVal.models)) {
        for (const m of providerVal.models) {
          if (!isRecord(m) || typeof m.id !== 'string' || !m.id.trim()) continue
          models.push({
            id: m.id.trim(),
            name: typeof m.name === 'string' ? m.name.trim() : m.id.trim(),
            reasoning: typeof m.reasoning === 'boolean' ? m.reasoning : undefined,
            input: Array.isArray(m.input)
              ? m.input.filter((i): i is string => typeof i === 'string')
              : undefined,
            contextWindow: typeof m.contextWindow === 'number' ? m.contextWindow : undefined,
            maxTokens: typeof m.maxTokens === 'number' ? m.maxTokens : undefined,
            thinkingLevelMap: isRecord(m.thinkingLevelMap)
              ? (m.thinkingLevelMap as Record<string, string | null>)
              : undefined
          })
        }
      }

      result.push({
        rootKey: 'providers',
        id: providerKey.trim(),
        name:
          typeof providerVal.name === 'string' && providerVal.name.trim()
            ? providerVal.name.trim()
            : providerKey.trim(),
        api,
        baseUrl,
        apiKey,
        headers,
        models,
        source: sourceHint === 'oh-my-pi' || sourceHint === 'omp' ? 'omp' : 'pi'
      })
    }
  }

  if (isRecord(config.model_providers)) {
    const defaultModel = typeof config.model === 'string' ? config.model.trim() : undefined
    const activeProvider =
      typeof config.model_provider === 'string' ? config.model_provider.trim() : undefined
    for (const [providerKey, providerVal] of Object.entries(config.model_providers)) {
      if (!providerKey.trim() || !isRecord(providerVal)) continue
      const baseUrl =
        typeof providerVal.base_url === 'string' && providerVal.base_url.trim()
          ? providerVal.base_url.trim()
          : typeof config.openai_base_url === 'string' && config.openai_base_url.trim()
            ? config.openai_base_url.trim()
            : undefined
      const apiKey =
        typeof providerVal.experimental_bearer_token === 'string' &&
        providerVal.experimental_bearer_token.trim()
          ? providerVal.experimental_bearer_token.trim()
          : undefined
      const wireApi =
        typeof providerVal.wire_api === 'string' ? providerVal.wire_api.trim() : 'responses'
      const headers = isRecord(providerVal.http_headers)
        ? stringRecord(providerVal.http_headers)
        : {}
      const name =
        typeof providerVal.name === 'string' && providerVal.name.trim()
          ? providerVal.name.trim()
          : providerKey.trim()
      const models: ParsedImportedModel[] = []
      if (defaultModel && (providerKey === activeProvider || !activeProvider)) {
        models.push({ id: defaultModel, name: defaultModel })
      }

      result.push({
        rootKey: 'model_providers',
        id: `codex-${providerKey.trim()}`,
        name: `Codex ${name}`,
        api: wireApi === 'responses' ? 'openai-responses' : 'openai',
        baseUrl,
        apiKey,
        headers,
        models,
        defaultModel: providerKey === activeProvider ? defaultModel : undefined,
        source: 'codex'
      })
    }
  }

  if (
    isRecord(config.env) &&
    (typeof config.env.ANTHROPIC_BASE_URL === 'string' ||
      typeof config.env.ANTHROPIC_AUTH_TOKEN === 'string')
  ) {
    const baseUrl =
      typeof config.env.ANTHROPIC_BASE_URL === 'string' && config.env.ANTHROPIC_BASE_URL.trim()
        ? config.env.ANTHROPIC_BASE_URL.trim()
        : undefined
    const apiKey =
      typeof config.env.ANTHROPIC_AUTH_TOKEN === 'string' && config.env.ANTHROPIC_AUTH_TOKEN.trim()
        ? config.env.ANTHROPIC_AUTH_TOKEN.trim()
        : undefined
    const defaultModel = typeof config.model === 'string' ? config.model.trim() : undefined
    const models: ParsedImportedModel[] = []
    if (defaultModel) models.push({ id: defaultModel, name: defaultModel })
    for (const key of [
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL'
    ]) {
      const modelVal = config.env[key]
      if (
        typeof modelVal === 'string' &&
        modelVal.trim() &&
        !models.some((m) => m.id === modelVal.trim())
      ) {
        models.push({ id: modelVal.trim(), name: modelVal.trim() })
      }
    }

    result.push({
      rootKey: 'env',
      id: 'claude-settings',
      name: 'Claude Code Settings',
      api: 'anthropic',
      baseUrl,
      apiKey,
      headers: {},
      models,
      defaultModel,
      source: 'claude'
    })
  }

  return result
}

export interface ParsedGeminiTomlCommand {
  description?: string
  prompt?: string
  ignoredFields: string[]
  blockingIssues: string[]
}

const GEMINI_SHELL_INJECTION_REGEX = /!\{[\s\S]*?\}/
const GEMINI_FILE_INJECTION_REGEX = /@\{[\s\S]*?\}/
const GEMINI_TEMPLATE_PLACEHOLDER_REGEX = /\{\{([\s\S]*?)\}\}/g

/**
 * Parses and normalizes a Gemini CLI TOML custom command file.
 *
 * Gemini CLI commands store their template in `prompt` with `{{args}}` placeholders and optional
 * `!{...}` shell / `@{...}` file injections. Tuff's command runtime expands `$ARGUMENTS` and
 * positional placeholders only, so supported `{{args}}` placeholders are translated to
 * `$ARGUMENTS` while unsupported constructs are blocked explicitly instead of being injected raw.
 */
export function parseGeminiTomlCommand(content: string): ParsedGeminiTomlCommand {
  const parsed = parseConfig(content, '.toml')
  if (!parsed) {
    return {
      ignoredFields: [],
      blockingIssues: ['Gemini TOML command could not be parsed']
    }
  }
  const ignoredFields = Object.keys(parsed)
    .filter((key) => key !== 'prompt' && key !== 'description')
    .sort()
  const description = typeof parsed.description === 'string' ? parsed.description.trim() : undefined
  const blockingIssues: string[] = []
  if (typeof parsed.prompt !== 'string' || !parsed.prompt.trim()) {
    blockingIssues.push('Gemini TOML command must define a non-empty string prompt')
    return { description, ignoredFields, blockingIssues }
  }
  const rawPrompt = parsed.prompt
  if (GEMINI_SHELL_INJECTION_REGEX.test(rawPrompt)) {
    blockingIssues.push('Gemini TOML command uses unsupported !{...} shell injection')
  }
  if (GEMINI_FILE_INJECTION_REGEX.test(rawPrompt)) {
    blockingIssues.push('Gemini TOML command uses unsupported @{...} file injection')
  }
  const unsupportedPlaceholders = new Set<string>()
  for (const match of rawPrompt.matchAll(GEMINI_TEMPLATE_PLACEHOLDER_REGEX)) {
    const inner = match[1]?.trim() ?? ''
    if (inner !== 'args') {
      unsupportedPlaceholders.add(match[0])
    }
  }
  if (unsupportedPlaceholders.size > 0) {
    blockingIssues.push(
      `Gemini TOML command uses unsupported template placeholder(s): ${[...unsupportedPlaceholders].join(', ')}`
    )
  }
  if (blockingIssues.length > 0) {
    return { description, ignoredFields, blockingIssues }
  }
  const normalizedPrompt = rawPrompt.replace(/\{\{\s*args\s*\}\}/g, () => '$ARGUMENTS')
  return {
    description,
    prompt: normalizedPrompt,
    ignoredFields,
    blockingIssues: []
  }
}
