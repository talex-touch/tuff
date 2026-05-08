const LEGACY_KEYWORD_EXCEPTIONS = [
  {
    file: 'apps/core-app/src/renderer/src/modules/lang/i18n.ts',
    patterns: [/legacy:\s*false/g],
  },
  {
    file: 'apps/nexus/app/i18n.config.ts',
    patterns: [/legacy:\s*false/g],
  },
  {
    file: 'plugins/touch-image/src/main.ts',
    patterns: [/legacy:\s*false/g],
  },
  {
    file: 'packages/tuff-intelligence/src/adapters/deepagent-engine.ts',
    patterns: [/\blegacy protocol\b/g],
  },
  {
    file: 'packages/utils/eslint.config.js',
    patterns: [
      /@talex-touch\/utils\/transport\/legacy/g,
      /@talex-touch\/utils\/permission\/legacy/g,
    ],
  },
]

const EXCEPTION_MAP = new Map(
  LEGACY_KEYWORD_EXCEPTIONS.map(entry => [entry.file, entry.patterns]),
)

function countPatternMatches(content, pattern) {
  const regex = new RegExp(pattern.source, pattern.flags)
  let count = 0
  while (regex.exec(content)) {
    count += 1
  }
  return count
}

export function countLegacyKeywordExceptions(relativePath, content) {
  const patterns = EXCEPTION_MAP.get(relativePath)
  if (!patterns) {
    return 0
  }

  return patterns.reduce((count, pattern) => count + countPatternMatches(content, pattern), 0)
}
