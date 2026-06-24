import type { FeatureSearchToken } from './feature-matcher'

export const SEMANTIC_ALIAS_SDK_MIN_VERSION = 260626
export const APP_SEMANTIC_ALIAS_CATALOG_MARKER = 'App Semantic Alias Catalog'
export const APP_SEMANTIC_ALIAS_CATALOG_MARKER_ZH = '应用语义别名目录'

export type SemanticAliasLocale = 'any' | 'en' | 'zh-CN' | 'zh-Hans' | 'zh-Hant'

export interface SemanticAliasDefinition {
  id?: string
  label?: string
  aliases?: readonly string[]
  categories?: readonly string[]
  synonyms?: readonly string[]
  keywords?: readonly string[]
  locale?: SemanticAliasLocale
}

export interface SemanticAliasManifestEntry extends SemanticAliasDefinition {
  /**
   * Optional manifest target, for example a feature id or provider id.
   * Runtime registration is still owned by the plugin loader.
   */
  target?: string
}

export interface BuildSemanticAliasPayloadInput {
  existingAliases?: readonly string[] | null
  existingKeywords?: readonly string[] | null
  aliases?: readonly string[] | null
  categories?: readonly string[] | null
  synonyms?: readonly string[] | null
  keywords?: readonly string[] | null
  entries?: readonly SemanticAliasDefinition[] | null
}

export interface SemanticAliasPayload {
  aliases: string[]
  keywords: string[]
  searchTokens: FeatureSearchToken[]
}

function normalizeSemanticAlias(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ')
}

function addDeduped(target: string[], seen: Set<string>, value: unknown): void {
  const normalized = normalizeSemanticAlias(value)
  if (!normalized) return

  const key = normalized.toLocaleLowerCase()
  if (seen.has(key)) return

  seen.add(key)
  target.push(normalized)
}

function mergeAliases(...groups: Array<readonly string[] | null | undefined>): string[] {
  const values: string[] = []
  const seen = new Set<string>()

  for (const group of groups) {
    for (const value of group ?? []) {
      addDeduped(values, seen, value)
    }
  }

  return values
}

function collectEntryTerms(entries: readonly SemanticAliasDefinition[] | null | undefined): string[] {
  const values: string[] = []

  for (const entry of entries ?? []) {
    values.push(
      ...(entry.aliases ?? []),
      ...(entry.categories ?? []),
      ...(entry.synonyms ?? []),
      ...(entry.keywords ?? []),
    )
  }

  return normalizeSemanticAliases(values)
}

export function normalizeSemanticAliases(values: readonly string[] | null | undefined): string[] {
  return mergeAliases(values)
}

export function defineSemanticAliases<T extends readonly SemanticAliasDefinition[]>(entries: T): T {
  return entries
}

export function buildSemanticAliasSearchTokens(
  aliases: readonly string[] | null | undefined,
): FeatureSearchToken[] {
  return normalizeSemanticAliases(aliases).map(alias => ({
    value: alias,
    source: 'alias',
    display: alias,
  }))
}

export function buildSemanticAliasPayload(input: BuildSemanticAliasPayloadInput): SemanticAliasPayload {
  const entryTerms = collectEntryTerms(input.entries)
  const semanticTerms = mergeAliases(
    input.aliases,
    input.categories,
    input.synonyms,
    input.keywords,
    entryTerms,
  )

  return {
    aliases: mergeAliases(input.existingAliases, semanticTerms),
    keywords: mergeAliases(input.existingKeywords, semanticTerms),
    searchTokens: buildSemanticAliasSearchTokens(semanticTerms),
  }
}

export class SemanticAliasSDK {
  readonly marker = APP_SEMANTIC_ALIAS_CATALOG_MARKER
  readonly markerZh = APP_SEMANTIC_ALIAS_CATALOG_MARKER_ZH
  readonly minSdkApi = SEMANTIC_ALIAS_SDK_MIN_VERSION

  normalize(values: readonly string[] | null | undefined): string[] {
    return normalizeSemanticAliases(values)
  }

  define<T extends readonly SemanticAliasDefinition[]>(entries: T): T {
    return defineSemanticAliases(entries)
  }

  build(input: BuildSemanticAliasPayloadInput): SemanticAliasPayload {
    return buildSemanticAliasPayload(input)
  }

  tokens(aliases: readonly string[] | null | undefined): FeatureSearchToken[] {
    return buildSemanticAliasSearchTokens(aliases)
  }
}

export function createSemanticAliasSDK(): SemanticAliasSDK {
  return new SemanticAliasSDK()
}

export const semanticAliasSDK = createSemanticAliasSDK()
