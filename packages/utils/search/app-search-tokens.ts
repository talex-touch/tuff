import type { FeatureSearchToken, FeatureSearchTokenSource } from './feature-matcher'
import {
  addPinyinSearchTokens,
  addSearchToken,
  addSimpleTextSearchTokens,
  addTitlePinyinSearchTokens,
  addTitleSearchTokens,
  type SearchTokenPinyinOptions
} from './search-token-builder'

export interface AppSearchTokenInput {
  title: string
  name?: string | null
  alternateNames?: readonly string[] | null
  aliases?: readonly string[] | null
  path?: string | null
  displayPath?: string | null
  fileName?: string | null
  bundleId?: string | null
  appIdentity?: string | null
  launchTarget?: string | null
  description?: string | null
}

export interface BuildAppSearchTokensOptions extends SearchTokenPinyinOptions {}

const BUNDLE_ID_PREFIX_PARTS = new Set(['com', 'net', 'org', 'io', 'app', 'dev'])

function normalizeInput(text?: string | null): string {
  return text?.trim() ?? ''
}

function addTitleAliasToken(tokens: FeatureSearchToken[], title: string, value: string): void {
  const normalizedTitle = normalizeInput(title)
  const normalizedValue = normalizeInput(value)
  if (!normalizedTitle || !normalizedValue) return

  const lowerTitle = normalizedTitle.toLowerCase()
  const lowerValue = normalizedValue.toLowerCase()
  if (lowerTitle === lowerValue) return

  const titleIndex = lowerTitle.indexOf(lowerValue)
  if (titleIndex === -1) return

  addSearchToken(tokens, {
    value: normalizedValue,
    source: 'name',
    display: normalizedValue,
    segments: [
      {
        tokenStart: 0,
        tokenEnd: lowerValue.length,
        titleStart: titleIndex,
        titleEnd: titleIndex + normalizedValue.length
      }
    ]
  })
}

function addExternalTextTokens(
  tokens: FeatureSearchToken[],
  text: string | null | undefined,
  source: FeatureSearchTokenSource,
  display?: string
): void {
  addSimpleTextSearchTokens(tokens, text, source, display || normalizeInput(text))
}

function addRawTextToken(
  tokens: FeatureSearchToken[],
  text: string | null | undefined,
  source: FeatureSearchTokenSource,
  display?: string
): void {
  const normalized = normalizeInput(text)
  if (!normalized) return

  addSearchToken(tokens, {
    value: normalized,
    source,
    display: display || normalized
  })
}

function resolveBundleIdSearchText(bundleId: string | null | undefined): string {
  const normalized = normalizeInput(bundleId)
  if (!normalized) return ''

  const parts = normalized
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length <= 1) return normalized

  while (parts.length > 1 && BUNDLE_ID_PREFIX_PARTS.has(parts[0]?.toLowerCase() ?? '')) {
    parts.shift()
  }

  return parts.join('.') || normalized
}

export function buildAppSearchTokens(
  app: AppSearchTokenInput,
  options: BuildAppSearchTokensOptions = {}
): FeatureSearchToken[] {
  const tokens: FeatureSearchToken[] = []
  const title = normalizeInput(app.title)

  addTitleSearchTokens(tokens, title)
  addTitlePinyinSearchTokens(tokens, title, options)

  addTitleAliasToken(tokens, title, app.name ?? '')
  addExternalTextTokens(tokens, app.name, 'name', app.name ?? undefined)

  for (const alternateName of app.alternateNames ?? []) {
    addExternalTextTokens(tokens, alternateName, 'alternate-name', alternateName)
    addPinyinSearchTokens(tokens, alternateName, {
      ...options,
      fullSource: 'alternate-name',
      initialsSource: 'alternate-initials',
      display: alternateName
    })
  }

  for (const alias of app.aliases ?? []) {
    addExternalTextTokens(tokens, alias, 'alias', alias)
    addPinyinSearchTokens(tokens, alias, {
      ...options,
      fullSource: 'alias',
      initialsSource: 'alias',
      display: alias
    })
  }

  addExternalTextTokens(tokens, app.fileName, 'fileName', app.fileName ?? undefined)
  const bundleIdSearchText = resolveBundleIdSearchText(app.bundleId)
  addExternalTextTokens(tokens, bundleIdSearchText, 'bundleId', bundleIdSearchText || undefined)
  addRawTextToken(tokens, app.appIdentity, 'appIdentity', app.appIdentity ?? undefined)
  addRawTextToken(tokens, app.launchTarget, 'launchTarget', app.launchTarget ?? undefined)
  addRawTextToken(tokens, app.displayPath, 'displayPath', app.displayPath ?? undefined)
  addRawTextToken(tokens, app.path, 'path', app.path ?? undefined)
  addExternalTextTokens(tokens, app.description, 'description', app.description ?? undefined)

  return tokens
}
