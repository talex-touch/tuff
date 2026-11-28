const LANGUAGE_LABELS: Record<string, string> = {
  bash: 'Bash',
  c: 'C',
  cjs: 'JavaScript',
  console: 'Terminal',
  cpp: 'C++',
  cs: 'C#',
  csharp: 'C#',
  css: 'CSS',
  cxx: 'C++',
  diff: 'Diff',
  docker: 'Dockerfile',
  dockerfile: 'Dockerfile',
  dotenv: 'Env',
  env: 'Env',
  go: 'Go',
  golang: 'Go',
  gql: 'GraphQL',
  graphql: 'GraphQL',
  html: 'HTML',
  http: 'HTTP',
  ini: 'INI',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JSON',
  json5: 'JSON5',
  jsonc: 'JSONC',
  jsx: 'JSX',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  less: 'Less',
  markdown: 'Markdown',
  md: 'Markdown',
  mdc: 'MDC',
  mermaid: 'Mermaid',
  mjs: 'JavaScript',
  patch: 'Diff',
  php: 'PHP',
  py: 'Python',
  python: 'Python',
  rb: 'Ruby',
  rs: 'Rust',
  ruby: 'Ruby',
  rust: 'Rust',
  sass: 'Sass',
  scss: 'SCSS',
  sh: 'Shell',
  shell: 'Shell',
  shellsession: 'Terminal',
  sql: 'SQL',
  svg: 'SVG',
  swift: 'Swift',
  terminal: 'Terminal',
  toml: 'TOML',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  vue: 'Vue',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
  zsh: 'Zsh',
}

const PLAIN_LANGUAGES = new Set(['', 'plain', 'plaintext', 'text', 'txt'])

/**
 * Formats a fenced code block language token into a subtle display label
 * (`typescript` -> `TypeScript`, `vue` -> `Vue`, `bash` -> `Bash`, `css` -> `CSS`).
 */
export function formatDocsCodeLanguage(language?: string | null, fallback = 'Text'): string {
  const sanitized = (language ?? '').trim().replace(/[^a-z0-9+#.-]/gi, '')
  const key = sanitized.toLowerCase()
  if (PLAIN_LANGUAGES.has(key))
    return fallback

  if (Object.hasOwn(LANGUAGE_LABELS, key))
    return LANGUAGE_LABELS[key]!

  return sanitized.charAt(0).toUpperCase() + sanitized.slice(1).toLowerCase()
}
