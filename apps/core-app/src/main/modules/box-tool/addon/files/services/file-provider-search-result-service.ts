import type { TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import { TuffSearchResultBuilder } from '@talex-touch/utils'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { DbUtils } from '../../../../../db/utils'
import { fileExtensions, files as filesSchema } from '../../../../../db/schema'
import type { SearchIndexService } from '../../../search-engine/search-index-service'
import { searchLogger } from '../../../search-engine/search-logger'
import { WHITELISTED_EXTENSIONS, getTypeTagsForExtension, type FileTypeTag } from '../constants'
import {
  buildFtsQuery,
  resolveExtensionsForTypeFilters,
  resolveTypeTag
} from './file-provider-search-service'

type FileRecord = typeof filesSchema.$inferSelect
type FileSearchEntry = { file: FileRecord; extensions: Record<string, string> }

export interface FileProviderSearchResultServiceDeps {
  providerId: string
  getDbUtils: () => DbUtils | null
  getSearchIndex: () => SearchIndexService | null
  buildItem: (file: FileRecord, extensions: Record<string, string>) => TuffItem
  normalizeItem: (
    item: TuffItem,
    file: FileRecord,
    extensions: Record<string, string>,
    reason: string
  ) => TuffItem | null
  sanitizeExtensions: (extensions: Record<string, string>) => Record<string, string>
  cleanupStaleCandidates: (paths: string[]) => void
  scheduleSemanticEnrichment: (normalizedQuery: string, candidateCount: number) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  formatDuration: (durationMs: number) => string
  now?: () => number
}

export interface FileProviderSearchFilters {
  text: string
  typeFilters: Set<FileTypeTag>
  extensionFilters: string[]
}

export class FileProviderSearchResultService {
  private readonly now: () => number

  constructor(private readonly deps: FileProviderSearchResultServiceDeps) {
    this.now = deps.now ?? (() => performance.now())
  }

  hasFilters(rawText: string): boolean {
    const { typeFilters, extensionFilters, text } = this.extractFilters(rawText)
    return typeFilters.size > 0 || extensionFilters.length > 0 || text !== rawText.trim()
  }

  extractFilters(rawText: string): FileProviderSearchFilters {
    const retained: string[] = []
    const typeFilters = new Set<FileTypeTag>()
    const extensionFilters: string[] = []

    for (const token of rawText.split(/\s+/).filter(Boolean)) {
      const trimmed = token.trim()
      if (!trimmed) continue
      const normalized = trimmed.toLowerCase()

      if (/^\*\.\w+$/.test(normalized) || /^\*\.\{[\w,]+\}$/.test(normalized)) {
        const extensions = this.parseExtensionGlob(normalized)
        if (extensions.length > 0) {
          extensionFilters.push(...extensions)
          continue
        }
      }
      if (normalized.startsWith('ext:')) {
        const extension = `.${normalized.slice(4)}`
        if (WHITELISTED_EXTENSIONS.has(extension)) {
          extensionFilters.push(extension)
          continue
        }
      }
      if (normalized.startsWith('type:')) {
        const type = resolveTypeTag(normalized.slice(5))
        if (type) {
          typeFilters.add(type)
          continue
        }
      }
      const alias = resolveTypeTag(normalized)
      if (alias) typeFilters.add(alias)
      retained.push(trimmed)
    }

    return { text: retained.join(' ').trim(), typeFilters, extensionFilters }
  }

  async search(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    if (signal.aborted) return this.empty(query)

    searchLogger.logProviderSearch(this.deps.providerId, query.text, 'File System')
    searchLogger.fileSearchStart(query.text)
    const dbUtils = this.deps.getDbUtils()
    const searchIndex = this.deps.getSearchIndex()
    if (!dbUtils || !searchIndex) {
      searchLogger.fileSearchNotInitialized()
      return this.empty(query)
    }

    const searchStart = this.now()
    const rawText = query.text.trim()
    const { text: searchText, typeFilters, extensionFilters } = this.extractFilters(rawText)
    searchLogger.fileSearchText(searchText, typeFilters.size)
    const logTerms = searchText
      .toLowerCase()
      .split(/[\s/]+/)
      .filter(Boolean)
    searchLogger.logKeywordAnalysis(searchText, logTerms, typeFilters.size)

    if (!searchText && typeFilters.size === 0 && extensionFilters.length === 0)
      return this.empty(query)
    if (!searchText && typeFilters.size > 0)
      return await this.buildTypeOnlyResult(query, typeFilters)
    if (!searchText && extensionFilters.length > 0) {
      return await this.buildExtensionOnlyResult(query, extensionFilters)
    }

    const normalizedQuery = searchText.toLowerCase()
    const baseTerms = normalizedQuery.split(/[\s/]+/).filter(Boolean)
    const terms = baseTerms.length > 0 ? baseTerms : [normalizedQuery]
    const shouldCheckPhrase = baseTerms.length > 1 || baseTerms.length === 0
    const preciseLookupTerms = shouldCheckPhrase
      ? Array.from(new Set([...terms, normalizedQuery]))
      : terms
    const preciseSearchLimit = Math.max(200, preciseLookupTerms.length * 200)
    const shouldLookupPrefix = normalizedQuery.length <= 5
    const ftsQuery = buildFtsQuery(terms.length > 0 ? terms : [normalizedQuery])
    searchLogger.filePreciseSearch(terms)
    searchLogger.fileFtsQuery(ftsQuery || '')

    const preciseStart = this.now()
    const prefixStart = this.now()
    const ftsStart = this.now()
    const [preciseResultMap, prefixResults, ftsMatches] = await Promise.all([
      searchIndex.lookupByKeywords(this.deps.providerId, preciseLookupTerms, preciseSearchLimit),
      shouldLookupPrefix
        ? searchIndex.lookupByKeywordPrefix(this.deps.providerId, normalizedQuery, 200)
        : Promise.resolve([]),
      ftsQuery ? searchIndex.search(this.deps.providerId, ftsQuery, 150) : Promise.resolve([])
    ])
    if (signal.aborted) return this.empty(query)

    let preciseMatchPaths: Set<string> | null = null
    const termMatches = terms.map(
      (term) => new Set((preciseResultMap.get(term) ?? []).map((entry) => entry.itemId))
    )
    searchLogger.filePreciseQueries(1)
    searchLogger.filePreciseResults(termMatches.map((matches) => matches.size))
    if (termMatches.length > 0) {
      preciseMatchPaths = termMatches.reduce<Set<string> | null>(
        (matches, current) =>
          matches ? new Set([...matches].filter((path) => current.has(path))) : current,
        null
      )
    }
    this.deps.logDebug('Precise keyword lookup completed', {
      terms: terms.join(', '),
      duration: this.deps.formatDuration(this.now() - preciseStart)
    })

    if (shouldCheckPhrase) {
      const phraseStart = this.now()
      const phraseSet = new Set(
        (preciseResultMap.get(normalizedQuery) ?? []).map((entry) => entry.itemId)
      )
      if (phraseSet.size > 0) {
        preciseMatchPaths = preciseMatchPaths
          ? new Set([...preciseMatchPaths, ...phraseSet])
          : phraseSet
      }
      this.deps.logDebug('Phrase keyword lookup completed', {
        query: normalizedQuery,
        matches: preciseMatchPaths?.size ?? 0,
        duration: this.deps.formatDuration(this.now() - phraseStart)
      })
    }

    if (shouldLookupPrefix) {
      if (prefixResults.length > 0) {
        const prefixSet = new Set(prefixResults.map((entry) => entry.itemId))
        preciseMatchPaths = preciseMatchPaths
          ? new Set([...preciseMatchPaths, ...prefixSet])
          : prefixSet
      }
      this.deps.logDebug('Prefix keyword lookup completed', {
        query: normalizedQuery,
        matches: prefixResults.length,
        duration: this.deps.formatDuration(this.now() - prefixStart)
      })
    }

    searchLogger.fileFtsResults(ftsMatches.length, this.now() - ftsStart)
    if (ftsQuery) {
      this.deps.logDebug('FTS search completed', {
        query: ftsQuery,
        matches: ftsMatches.length,
        duration: this.deps.formatDuration(this.now() - ftsStart)
      })
    }

    const candidateIds = new Set<string>(preciseMatchPaths ? [...preciseMatchPaths] : [])
    for (const match of ftsMatches) {
      if (candidateIds.size >= 120) break
      candidateIds.add(match.itemId)
    }
    this.deps.scheduleSemanticEnrichment(normalizedQuery, candidateIds.size)
    if (candidateIds.size === 0) return this.empty(query)

    const candidatePaths = [...candidateIds].slice(0, 120)
    searchLogger.fileDataFetch(candidatePaths.length)
    const dataFetchStart = this.now()
    const rows = await dbUtils
      .getDb()
      .select({
        file: filesSchema,
        extensionKey: fileExtensions.key,
        extensionValue: fileExtensions.value
      })
      .from(filesSchema)
      .leftJoin(fileExtensions, eq(filesSchema.id, fileExtensions.fileId))
      .where(and(eq(filesSchema.type, 'file'), inArray(filesSchema.path, candidatePaths)))
    if (signal.aborted) return this.empty(query)
    searchLogger.fileDataResults(rows.length, this.now() - dataFetchStart)
    this.deps.logDebug('Loaded candidate rows for scoring', {
      count: rows.length,
      duration: this.deps.formatDuration(this.now() - dataFetchStart)
    })

    const filesMap = this.groupRows(rows)
    const stalePaths = candidatePaths.filter((filePath) => !filesMap.has(filePath))
    if (stalePaths.length > 0) this.deps.cleanupStaleCandidates(stalePaths)
    this.filterByTypes(filesMap, typeFilters)
    this.filterByExtensions(filesMap, extensionFilters)
    if (filesMap.size === 0) return this.empty(query)

    const ftsScoreMap = new Map<string, number>()
    for (const match of ftsMatches) {
      const score = match.score > 0 ? 1 / (match.score + 1) : 1
      if (score > (ftsScoreMap.get(match.itemId) ?? 0)) ftsScoreMap.set(match.itemId, score)
    }

    const now = Date.now()
    const scoredItems = [...filesMap.values()]
      .map(({ file, extensions }) => {
        const keywordScore = preciseMatchPaths?.has(file.path) ? 1 : 0
        const ftsScore = ftsScoreMap.get(file.path) ?? 0
        const lastModifiedScore = Math.exp(
          -0.05 * ((now - new Date(file.mtime).getTime()) / 86_400_000)
        )
        const finalScore =
          0.45 * keywordScore +
          0.35 * ftsScore +
          0.05 * lastModifiedScore +
          (typeFilters.size > 0 ? 0.15 : 0)
        const sanitizedExtensions = this.deps.sanitizeExtensions(extensions)
        const item = this.deps.buildItem(file, sanitizedExtensions)
        item.scoring = {
          final: finalScore,
          match: Math.max(keywordScore, ftsScore),
          recency: 0,
          frequency: 0,
          base: lastModifiedScore,
          match_details:
            keywordScore > 0
              ? { type: 'exact', query: rawText }
              : ftsScore > 0
                ? { type: 'semantic', query: rawText, confidence: ftsScore }
                : undefined
        }
        item.meta ??= {}
        item.meta.usage = { clickCount: 0 }
        item.meta.extension = {
          ...(item.meta.extension ?? {}),
          search: { keywordMatch: keywordScore > 0, ftsScore, semanticScore: 0 }
        }
        return this.deps.normalizeItem(item, file, sanitizedExtensions, 'search-result')
      })
      .filter((item): item is TuffItem => item !== null)
      .sort((left, right) => (right.scoring?.final || 0) - (left.scoring?.final || 0))
      .slice(0, 50)

    this.deps.logDebug('Search completed', {
      query: rawText,
      items: scoredItems.length,
      duration: this.deps.formatDuration(this.now() - searchStart)
    })
    return new TuffSearchResultBuilder(query).setItems(scoredItems).build()
  }

  private async buildTypeOnlyResult(
    query: TuffQuery,
    typeFilters: Set<FileTypeTag>
  ): Promise<TuffSearchResult> {
    const dbUtils = this.deps.getDbUtils()
    const extensions = resolveExtensionsForTypeFilters(typeFilters)
    if (!dbUtils || extensions.length === 0) return this.empty(query)
    const rows = await dbUtils
      .getDb()
      .select({
        file: filesSchema,
        extensionKey: fileExtensions.key,
        extensionValue: fileExtensions.value
      })
      .from(filesSchema)
      .leftJoin(fileExtensions, eq(filesSchema.id, fileExtensions.fileId))
      .where(and(eq(filesSchema.type, 'file'), inArray(filesSchema.extension, extensions)))
      .orderBy(desc(filesSchema.mtime))
      .limit(50)
    const items = [...this.groupRows(rows).values()].flatMap(
      ({ file, extensions: fileExtensions }) => {
        if (!this.matchesTypes(file, typeFilters)) return []
        const extensions = this.deps.sanitizeExtensions(fileExtensions)
        const item = this.deps.buildItem(file, extensions)
        item.scoring = { final: 0.4, match: 0.4, recency: 0, frequency: 0, base: 0 }
        item.meta = {
          ...item.meta,
          file: { path: item.meta?.file?.path || '', ...item.meta?.file }
        }
        const normalized = this.deps.normalizeItem(item, file, extensions, 'type-only-result')
        return normalized ? [normalized] : []
      }
    )
    return new TuffSearchResultBuilder(query).setItems(items).build()
  }

  private async buildExtensionOnlyResult(
    query: TuffQuery,
    extensionFilters: string[]
  ): Promise<TuffSearchResult> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || extensionFilters.length === 0) return this.empty(query)
    const rows = await dbUtils
      .getDb()
      .select({
        file: filesSchema,
        extensionKey: fileExtensions.key,
        extensionValue: fileExtensions.value
      })
      .from(filesSchema)
      .leftJoin(fileExtensions, eq(filesSchema.id, fileExtensions.fileId))
      .where(
        and(
          eq(filesSchema.type, 'file'),
          inArray(
            filesSchema.extension,
            extensionFilters.map((extension) => extension.toLowerCase())
          )
        )
      )
      .orderBy(desc(filesSchema.mtime))
      .limit(50)
    const items = [...this.groupRows(rows).values()].flatMap(
      ({ file, extensions: fileExtensions }) => {
        const extensions = this.deps.sanitizeExtensions(fileExtensions)
        const item = this.deps.buildItem(file, extensions)
        item.scoring = { final: 0.4, match: 0.4, recency: 0, frequency: 0, base: 0 }
        item.meta = {
          ...item.meta,
          file: { path: item.meta?.file?.path || '', ...item.meta?.file }
        }
        const normalized = this.deps.normalizeItem(item, file, extensions, 'extension-only-result')
        return normalized ? [normalized] : []
      }
    )
    return new TuffSearchResultBuilder(query).setItems(items).build()
  }

  private groupRows(
    rows: Array<{ file: FileRecord; extensionKey: string | null; extensionValue: string | null }>
  ): Map<string, FileSearchEntry> {
    const files = new Map<string, FileSearchEntry>()
    for (const row of rows) {
      const entry = files.get(row.file.path) ?? { file: row.file, extensions: {} }
      if (row.extensionKey && row.extensionValue)
        entry.extensions[row.extensionKey] = row.extensionValue
      files.set(row.file.path, entry)
    }
    return files
  }

  private filterByTypes(files: Map<string, FileSearchEntry>, typeFilters: Set<FileTypeTag>): void {
    if (typeFilters.size === 0) return
    for (const [filePath, entry] of files) {
      if (!this.matchesTypes(entry.file, typeFilters)) files.delete(filePath)
    }
  }

  private filterByExtensions(
    files: Map<string, FileSearchEntry>,
    extensionFilters: string[]
  ): void {
    if (extensionFilters.length === 0) return
    const extensions = new Set(extensionFilters.map((extension) => extension.toLowerCase()))
    for (const [filePath, entry] of files) {
      if (!extensions.has((entry.file.extension || '').toLowerCase())) files.delete(filePath)
    }
  }

  private matchesTypes(file: FileRecord, typeFilters: Set<FileTypeTag>): boolean {
    if (typeFilters.size === 0) return true
    const tags = new Set(getTypeTagsForExtension((file.extension || '').toLowerCase()))
    return [...typeFilters].some((type) => tags.has(type))
  }

  private parseExtensionGlob(pattern: string): string[] {
    const simple = pattern.match(/^\*\.(\w+)$/)
    if (simple) {
      const extension = `.${simple[1]}`
      return WHITELISTED_EXTENSIONS.has(extension) ? [extension] : []
    }
    const brace = pattern.match(/^\*\.\{([\w,]+)\}$/)
    return brace
      ? brace[1]
          .split(',')
          .map((extension) => `.${extension.trim()}`)
          .filter((extension) => WHITELISTED_EXTENSIONS.has(extension))
      : []
  }

  private empty(query: TuffQuery): TuffSearchResult {
    return new TuffSearchResultBuilder(query).build()
  }
}
