import type { AppSemanticAliasInput } from './app-semantic-catalog'

const NEEDLE_TOKEN_REGEX = /[a-z0-9]+|[一-鿿]+/g
const CJK_CHAR_REGEX = /[一-鿿]/
const PATH_SEPARATOR_REGEX = /[\\/]/
const KNOWN_APP_EXTENSION_REGEX = /\.(app|exe|lnk|desktop)$/i

function tokenize(value: string): string[] {
  return value.toLowerCase().match(NEEDLE_TOKEN_REGEX) ?? []
}

function collectBasenameVariants(value: string | null | undefined, into: string[]): void {
  const normalized = value?.trim()
  if (!normalized) return

  const baseName = normalized.split(PATH_SEPARATOR_REGEX).filter(Boolean).pop() ?? normalized
  into.push(baseName)

  const withoutExtension = baseName.replace(KNOWN_APP_EXTENSION_REGEX, '')
  if (withoutExtension && withoutExtension !== baseName) into.push(withoutExtension)
}

// Identity evidence only: directory segments and free-text description are excluded,
// so short needles ('tg', 'tim') cannot attach through /Users/<name> or descriptions.
function collectIdentityValues(app: AppSemanticAliasInput): string[] {
  const values: string[] = []
  const directFields = [
    app.name,
    app.displayName,
    app.fileName,
    ...(app.alternateNames ?? []),
    app.bundleId,
    app.uniqueId,
    app.stableId,
    app.appIdentity
  ]

  for (const value of directFields) {
    const normalized = value?.trim()
    if (!normalized) continue
    if (PATH_SEPARATOR_REGEX.test(normalized)) {
      collectBasenameVariants(normalized, values)
    } else {
      values.push(normalized)
    }
  }

  collectBasenameVariants(app.path, values)
  collectBasenameVariants(app.launchTarget, values)
  collectBasenameVariants(app.displayPath, values)
  return values
}

function tokenMatches(candidate: string, needleToken: string): boolean {
  return CJK_CHAR_REGEX.test(needleToken)
    ? candidate.includes(needleToken)
    : candidate === needleToken
}

function containsTokenRun(tokens: string[], needleTokens: string[]): boolean {
  outer: for (let start = 0; start + needleTokens.length <= tokens.length; start += 1) {
    for (let offset = 0; offset < needleTokens.length; offset += 1) {
      const candidate = tokens[start + offset]
      const needleToken = needleTokens[offset]
      if (candidate === undefined || needleToken === undefined) continue outer
      if (!tokenMatches(candidate, needleToken)) continue outer
    }
    return true
  }
  return false
}

export interface AppCatalogNeedleMatcher {
  hasIdentity: boolean
  matchesAny: (needles: readonly string[]) => boolean
}

export function createAppCatalogNeedleMatcher(app: AppSemanticAliasInput): AppCatalogNeedleMatcher {
  const fieldTokenLists: string[][] = []
  const tokenSet = new Set<string>()
  const cjkTokens: string[] = []

  for (const value of collectIdentityValues(app)) {
    const tokens = tokenize(value)
    if (!tokens.length) continue
    fieldTokenLists.push(tokens)
    for (const token of tokens) {
      if (tokenSet.has(token)) continue
      tokenSet.add(token)
      if (CJK_CHAR_REGEX.test(token)) cjkTokens.push(token)
    }
  }

  const matchesNeedle = (needle: string): boolean => {
    const needleTokens = tokenize(needle)
    const first = needleTokens[0]
    if (first === undefined) return false

    if (needleTokens.length === 1) {
      // CJK has no word boundaries; containment within a CJK run is the match unit.
      return CJK_CHAR_REGEX.test(first)
        ? cjkTokens.some((token) => token.includes(first))
        : tokenSet.has(first)
    }

    return fieldTokenLists.some((tokens) => containsTokenRun(tokens, needleTokens))
  }

  return {
    hasIdentity: fieldTokenLists.length > 0,
    matchesAny: (needles) => needles.some(matchesNeedle)
  }
}
