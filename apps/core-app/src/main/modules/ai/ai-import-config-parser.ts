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
      else if (char === '\\') escaped = true
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

function unquote(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )
    return trimmed.slice(1, -1).replace(/\\(["'\\bnrt])/g, (_match, escaped: string) => {
      const escapes: Record<string, string> = { b: '\b', n: '\n', r: '\r', t: '\t' }
      return escapes[escaped] ?? escaped
    })
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
      else if (char === '\\') escaped = true
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

function parseToml(content: string): Record<string, unknown> | null {
  const root: Record<string, unknown> = {}
  let section: string[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    const line = uncommentToml(rawLine).trim()
    if (!line) continue
    const sectionMatch = /^\[([^\]]+)]$/.exec(line)
    if (sectionMatch) {
      section = splitTopLevel(sectionMatch[1]!, '.').map(unquote)
      if (!setPath(root, section, {})) return null
      continue
    }
    const equals = line.indexOf('=')
    if (equals <= 0) return null
    const key = splitTopLevel(line.slice(0, equals), '.').map(unquote)
    if (!setPath(root, [...section, ...key], parseScalar(line.slice(equals + 1)))) return null
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
    if (extension === '.yaml' || extension === '.yml') return parseYaml(content)
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
    const url = isHttpUrl(rawProfile.url) ? rawProfile.url : undefined
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
