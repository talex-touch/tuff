// The repository baseline intentionally permits legacy style variance. This explicit
// markdownlint rule rejects embedded NUL bytes, which corrupt Markdown consumers.
// Scope exclusions live only in verify-docs.mjs; this config has no path exceptions.
export const MARKDOWNLINT_CONFIG = Object.freeze({
  default: false,
  MD900: true,
  // These legacy style rules are explicitly disabled; no path-level rule skips exist.
  MD013: false,
  MD060: false,
})

export const MARKDOWNLINT_CUSTOM_RULES = Object.freeze([
  {
    names: ['MD900', 'tuff-no-nul'],
    parsers: ['none'],
    description: 'Markdown must not contain NUL bytes',
    tags: ['tuff', 'integrity'],
    function: (params, onError) => {
      for (const [index, line] of params.lines.entries()) {
        const column = line.indexOf('\0')
        if (column >= 0)
          onError({ lineNumber: index + 1, detail: 'NUL byte', range: [column + 1, 1] })
      }
    },
  },
])
