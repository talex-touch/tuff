export interface HighlightApi {
  highlightElement: (element: HTMLElement) => void
  highlight: (code: string, options?: { language?: string }) => { value: string }
}

type HighlightFamily = 'ts' | 'markup' | 'css' | 'json' | 'bash' | 'yaml' | 'plaintext'

interface TokenRule {
  pattern: RegExp
  className: string
}

const TS_KEYWORDS = new Set([
  'abstract',
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'if',
  'implements',
  'import',
  'in',
  'infer',
  'instanceof',
  'interface',
  'is',
  'keyof',
  'let',
  'namespace',
  'new',
  'of',
  'override',
  'private',
  'protected',
  'public',
  'readonly',
  'return',
  'satisfies',
  'set',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'try',
  'type',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

const TS_LITERALS = new Set([
  'false',
  'Infinity',
  'NaN',
  'null',
  'true',
  'undefined',
])

const TS_BUILTINS = new Set([
  'any',
  'Array',
  'bigint',
  'boolean',
  'Component',
  'ComputedRef',
  'console',
  'CSSProperties',
  'Date',
  'document',
  'Error',
  'HTMLElement',
  'JSON',
  'Map',
  'Math',
  'never',
  'number',
  'object',
  'Object',
  'Omit',
  'Partial',
  'Pick',
  'Promise',
  'ReactNode',
  'Readonly',
  'Record',
  'Ref',
  'Required',
  'Set',
  'string',
  'symbol',
  'unknown',
  'window',
])

const BASH_BUILTINS = new Set([
  'brew',
  'bun',
  'cat',
  'cd',
  'chmod',
  'cp',
  'curl',
  'docker',
  'echo',
  'export',
  'git',
  'grep',
  'ls',
  'mkdir',
  'mv',
  'node',
  'npm',
  'npx',
  'nuxt',
  'pnpm',
  'rm',
  'sudo',
  'tsx',
  'vite',
  'vitest',
  'yarn',
])

export function escapeHtml(source: string): string {
  return source
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

export function normalizeHighlightLanguage(language?: string): HighlightFamily {
  const normalized = (language ?? '').trim().toLowerCase()
  switch (normalized) {
    case 'ts':
    case 'tsx':
    case 'typescript':
    case 'js':
    case 'jsx':
    case 'javascript':
    case 'mjs':
    case 'cjs':
      return 'ts'
    case 'vue':
    case 'html':
    case 'xml':
    case 'svg':
    case 'mdc':
      return 'markup'
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css'
    case 'json':
    case 'jsonc':
    case 'json5':
      return 'json'
    case 'bash':
    case 'sh':
    case 'shell':
    case 'zsh':
    case 'console':
    case 'shellsession':
      return 'bash'
    case 'yaml':
    case 'yml':
      return 'yaml'
    default:
      return 'plaintext'
  }
}

function wrapToken(className: string, raw: string): string {
  return `<span class="${className}">${escapeHtml(raw)}</span>`
}

function highlightWithRules(code: string, rules: TokenRule[], customClassifier?: (token: string, nextChar: string) => string | null): string {
  const combined = new RegExp(
    rules.map((rule, index) => `(?<g${index}>${rule.pattern.source})`).join('|'),
    'gm',
  )

  let html = ''
  let lastIndex = 0

  for (const match of code.matchAll(combined)) {
    const start = match.index ?? 0
    if (start > lastIndex)
      html += escapeHtml(code.slice(lastIndex, start))

    const token = match[0]
    const groups = match.groups ?? {}
    let className: string | null = null

    for (let index = 0; index < rules.length; index += 1) {
      if (groups[`g${index}`] !== undefined) {
        const ruleClass = rules[index]!.className
        className = ruleClass === '__custom__' && customClassifier
          ? customClassifier(token, code[start + token.length] ?? '')
          : ruleClass
        break
      }
    }

    html += className ? wrapToken(className, token) : escapeHtml(token)
    lastIndex = start + token.length
  }

  if (lastIndex < code.length)
    html += escapeHtml(code.slice(lastIndex))

  return html
}

const TS_RULES: TokenRule[] = [
  { pattern: /\/\*[\s\S]*?\*\/|\/\/[^\n]*/, className: 'hljs-comment' },
  { pattern: /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, className: 'hljs-string' },
  { pattern: /\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/, className: 'hljs-number' },
  { pattern: /\b[A-Za-z_$][\w$]*\b/, className: '__custom__' },
]

function classifyTsIdentifier(token: string, nextChar: string): string | null {
  if (TS_KEYWORDS.has(token))
    return 'hljs-keyword'
  if (TS_LITERALS.has(token))
    return 'hljs-literal'
  if (TS_BUILTINS.has(token))
    return 'hljs-built_in'
  if (nextChar === '(')
    return 'hljs-title'
  if (/^[A-Z][A-Za-z0-9_]*$/.test(token))
    return 'hljs-type'
  return null
}

const CSS_RULES: TokenRule[] = [
  { pattern: /\/\*[\s\S]*?\*\//, className: 'hljs-comment' },
  { pattern: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, className: 'hljs-string' },
  { pattern: /@[a-z-]+/, className: 'hljs-keyword' },
  { pattern: /--[a-zA-Z0-9-]+/, className: 'hljs-variable' },
  { pattern: /#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|ms|s|deg|fr)?\b/, className: 'hljs-number' },
  { pattern: /\b[a-z-]+(?=\s*:)/, className: 'hljs-attr' },
  { pattern: /\.[a-zA-Z_-][\w-]*/, className: 'hljs-selector-class' },
]

const JSON_RULES: TokenRule[] = [
  { pattern: /"(?:\\.|[^"\\\n])*"(?=\s*:)/, className: 'hljs-attr' },
  { pattern: /"(?:\\.|[^"\\\n])*"/, className: 'hljs-string' },
  { pattern: /\b(?:true|false|null)\b/, className: 'hljs-literal' },
  { pattern: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/, className: 'hljs-number' },
]

const BASH_RULES: TokenRule[] = [
  { pattern: /#[^\n]*/, className: 'hljs-comment' },
  { pattern: /"(?:\\.|[^"\\\n])*"|'[^'\n]*'/, className: 'hljs-string' },
  { pattern: /\$\{?[A-Za-z_]\w*\}?/, className: 'hljs-variable' },
  { pattern: /(?:^|\s)--?[a-zA-Z0-9-]+/, className: 'hljs-attr' },
  { pattern: /\b[A-Za-z][\w-]*\b/, className: '__custom__' },
]

const YAML_RULES: TokenRule[] = [
  { pattern: /#[^\n]*/, className: 'hljs-comment' },
  { pattern: /"(?:\\.|[^"\\\n])*"|'[^'\n]*'/, className: 'hljs-string' },
  { pattern: /^[ \t]*[A-Za-z0-9_.-]+(?=:)/, className: 'hljs-attr' },
  { pattern: /\b(?:true|false|null|yes|no)\b/, className: 'hljs-literal' },
  { pattern: /\b\d+(?:\.\d+)?\b/, className: 'hljs-number' },
]

function highlightMarkupTag(tagSource: string): string {
  const match = tagSource.match(/^(<\/?)([A-Za-z][\w:-]*)([\s\S]*?)(\/?>)$/)
  if (!match)
    return escapeHtml(tagSource)

  const [, open, tagName, attrsRaw, close] = match
  const attrRules: TokenRule[] = [
    { pattern: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, className: 'hljs-string' },
    { pattern: /[@:#]?[A-Za-z_][\w:.-]*/, className: 'hljs-attr' },
  ]
  const attrsHtml = attrsRaw ? highlightWithRules(attrsRaw, attrRules) : ''
  return `${escapeHtml(open!)}${wrapToken('hljs-name', tagName!)}${attrsHtml}${escapeHtml(close!)}`
}

function highlightMarkupFragment(code: string): string {
  const pattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w:-]*(?=\s|\/?>)(?:"[^"]*"|'[^']*'|[^><"'])*\/?>/g
  let html = ''
  let lastIndex = 0

  for (const match of code.matchAll(pattern)) {
    const start = match.index ?? 0
    if (start > lastIndex)
      html += escapeHtml(code.slice(lastIndex, start))

    const token = match[0]
    html += token.startsWith('<!--')
      ? wrapToken('hljs-comment', token)
      : highlightMarkupTag(token)
    lastIndex = start + token.length
  }

  if (lastIndex < code.length)
    html += escapeHtml(code.slice(lastIndex))

  return html
}

function highlightMarkup(code: string): string {
  const blockPattern = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi
  let html = ''
  let lastIndex = 0

  for (const match of code.matchAll(blockPattern)) {
    const start = match.index ?? 0
    if (start > lastIndex)
      html += highlightMarkupFragment(code.slice(lastIndex, start))

    const [, openTag, blockTag, innerCode, closeTag] = match
    const innerFamily: HighlightFamily = blockTag!.toLowerCase() === 'script' ? 'ts' : 'css'
    html += highlightMarkupTag(openTag!)
    html += highlightByFamily(innerCode!, innerFamily)
    html += highlightMarkupTag(closeTag!)
    lastIndex = start + match[0].length
  }

  if (lastIndex < code.length)
    html += highlightMarkupFragment(code.slice(lastIndex))

  return html
}

function highlightByFamily(code: string, family: HighlightFamily): string {
  if (!code)
    return ''

  switch (family) {
    case 'ts':
      return highlightWithRules(code, TS_RULES, classifyTsIdentifier)
    case 'markup':
      return highlightMarkup(code)
    case 'css':
      return highlightWithRules(code, CSS_RULES)
    case 'json':
      return highlightWithRules(code, JSON_RULES)
    case 'bash':
      return highlightWithRules(code, BASH_RULES, token => (BASH_BUILTINS.has(token) ? 'hljs-built_in' : null))
    case 'yaml':
      return highlightWithRules(code, YAML_RULES)
    default:
      return escapeHtml(code)
  }
}

export function highlightCodeToHtml(code: string, language?: string): string {
  if (!code)
    return ''
  return highlightByFamily(code, normalizeHighlightLanguage(language))
}

function detectElementLanguage(element: HTMLElement): string {
  const explicit = element.dataset.language
    ?? element.dataset.lang
    ?? element.parentElement?.dataset.language
  if (explicit)
    return explicit

  const className = `${element.className ?? ''} ${element.parentElement?.className ?? ''}`
  const match = className.match(/(?:language|lang)-([\w-]+)/i)
  return match?.[1] ?? 'plaintext'
}

export function highlightElement(element: HTMLElement): void {
  const source = element.textContent ?? ''
  if (!source)
    return

  const language = detectElementLanguage(element)
  element.innerHTML = highlightCodeToHtml(source, language)
  if (!element.classList.contains('hljs'))
    element.classList.add('hljs')
  element.dataset.highlighted = 'true'
}

const localHighlightApi: HighlightApi = {
  highlightElement,
  highlight: (code, options) => ({
    value: highlightCodeToHtml(code, options?.language),
  }),
}

export function resolveHighlightApi(): Promise<HighlightApi> {
  return Promise.resolve(localHighlightApi)
}
