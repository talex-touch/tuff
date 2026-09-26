import type { TuffQuery } from '@talex-touch/utils/core-box'
import type { files as filesSchema } from '../../../../../db/schema'
import type { ScannedAppInfo } from '../app-types'
import path from 'node:path'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  expandSearchLookupVariants,
  foldSearchText,
  normalizeSearchText
} from '@talex-touch/utils/search'
import { resolveAppItemId } from '../app-index-metadata'

const log = getLogger('app-search-catalog')

export type AppCatalogRow = typeof filesSchema.$inferSelect & {
  extensions: Record<string, string | null>
}

/**
 * One application as the search path sees it, derived once per catalog load instead of per
 * keystroke. `row` is exactly what the SQL path used to load per search, so the result builder
 * downstream (`processSearchResults`) is unchanged.
 */
export interface AppCatalogEntry {
  readonly row: AppCatalogRow
  readonly itemId: string
  readonly title: string
  /** Stored keyword forms: cleaned plus the diacritic-folded twin, as `keyword_mappings` holds. */
  readonly keywords: ReadonlySet<string>
  /** Adjacent 2-grams of the single-word keywords, for typo recall. */
  readonly ngrams: ReadonlySet<string>
  /** Tokens the FTS row would carry (title, compact title, keywords, tags, path segments). */
  readonly ftsTokens: ReadonlySet<string>
  /** Tokens of the title alone: the order candidates fill up in mirrors bm25's title bias. */
  readonly titleTokens: ReadonlySet<string>
}

export interface AppCatalogRecallStats {
  precise: number
  prefix: number
  fts: number
  ngram: number
  subsequence: number
  candidates: number
}

export interface AppCatalogRecall {
  rows: AppCatalogRow[]
  /** Same signal the SQL path derived: no exact / phrase / prefix keyword hit at all. */
  isFuzzySearch: boolean
  stats: AppCatalogRecallStats
}

export interface AppSearchCatalogDeps {
  providerId: string
  /** The catalog rows: `files` of type `app` joined with their extensions. */
  loadRows: () => Promise<AppCatalogRow[]>
  toScannedInfo: (row: AppCatalogRow) => ScannedAppInfo
  /** The provider's own keyword generator, so the exact-match set is what the index stores. */
  generateKeywords: (info: ScannedAppInfo) => Promise<Set<string>>
  /** Index commits for this provider are the one signal every write path reaches. */
  subscribeCommits: (listener: (providerIds: readonly string[]) => void) => () => void
  now?: () => number
  debounceMs?: number
  staleAfterMs?: number
}

/** The SQL funnel's constants, kept so the memory path recalls the same candidate set. */
const MAX_CANDIDATE_COUNT = 120
const PREFIX_LOOKUP_MAX_QUERY_LENGTH = 5
const PREFIX_LOOKUP_LIMIT = 200
const NGRAM_RECALL_THRESHOLD = 5
const NGRAM_RECALL_LIMIT = 30
const NGRAM_MIN_QUERY_LENGTH = 3
const SUBSEQ_RECALL_THRESHOLD = 5
const SUBSEQ_RECALL_LIMIT = 50
const SUBSEQ_MIN_QUERY_LENGTH = 2
const FTS_MAX_TOKENS = 5
/** `prepareDocument`'s n-gram budget per document. */
const NGRAM_SOURCE_LIMIT = 96
const NGRAM_PER_DOCUMENT_LIMIT = 256
const NGRAM_MIN_KEYWORD_LENGTH = 3

const DEFAULT_DEBOUNCE_MS = 250
const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000
/** Rows built between two turns of the event loop during a reload. */
const RELOAD_YIELD_EVERY_ROWS = 32

function addKeyword(target: Set<string>, value: string | null | undefined): void {
  const normalized = normalizeSearchText(value)
  if (normalized.length <= 1) return
  target.add(normalized)
  const folded = foldSearchText(normalized)
  if (folded.length > 1) target.add(folded)
}

/**
 * unicode61 splits on anything that is not a letter or digit and folds diacritics; the shared
 * charset does the same and keeps a CJK run as one token, which is how FTS5 tokenizes it too.
 */
function tokenize(value: string | null | undefined): string[] {
  const folded = foldSearchText(value)
  if (!folded) return []
  return folded.split(' ').filter((token) => token.length > 0)
}

function buildNgrams(keywords: ReadonlySet<string>): Set<string> {
  const grams = new Set<string>()
  let sources = 0
  for (const keyword of keywords) {
    if (keyword.length < NGRAM_MIN_KEYWORD_LENGTH || keyword.includes(' ')) continue
    sources += 1
    if (sources > NGRAM_SOURCE_LIMIT) break
    for (let index = 0; index + 1 < keyword.length; index += 1) {
      grams.add(keyword.slice(index, index + 2))
      if (grams.size >= NGRAM_PER_DOCUMENT_LIMIT) return grams
    }
  }
  return grams
}

function queryNgrams(text: string): string[] {
  const grams = new Set<string>()
  for (let index = 0; index + 1 < text.length; index += 1) {
    grams.add(text.slice(index, index + 2))
  }
  return Array.from(grams)
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (needle.length === 0) return true
  if (needle.length > haystack.length) return false
  let cursor = 0
  for (let index = 0; index < haystack.length && cursor < needle.length; index += 1) {
    if (haystack[index] === needle[cursor]) cursor += 1
  }
  return cursor === needle.length
}

function intersectEntries(
  left: ReadonlySet<AppCatalogEntry>,
  right: ReadonlySet<AppCatalogEntry>
): Set<AppCatalogEntry> {
  const result = new Set<AppCatalogEntry>()
  for (const entry of left) if (right.has(entry)) result.add(entry)
  return result
}

function unionEntries(
  base: ReadonlySet<AppCatalogEntry> | null,
  additions: Iterable<AppCatalogEntry>
): Set<AppCatalogEntry> {
  const result = new Set<AppCatalogEntry>(base ?? [])
  for (const entry of additions) result.add(entry)
  return result
}

/** Mirrors `AppProvider.buildFtsQuery`: cleaned terms, split on whitespace, at most five tokens. */
export function buildFtsQueryTokens(terms: readonly string[]): string[] {
  const tokens: string[] = []
  for (const term of terms) {
    const cleaned = normalizeSearchText(term)
    if (!cleaned) continue
    tokens.push(...cleaned.split(/\s+/))
  }
  return tokens.slice(0, FTS_MAX_TOKENS)
}

/** The record mapper's `metadata.extension`, which is what the index keys the extension by. */
function resolveIndexedExtension(info: ScannedAppInfo, launchTarget: string): string | undefined {
  if (info.launchKind === 'uwp') return '.uwp'
  if (info.launchKind === 'protocol') return '.protocol'
  return path.extname(launchTarget).toLowerCase() || undefined
}

export async function buildAppCatalogEntry(
  row: AppCatalogRow,
  deps: Pick<AppSearchCatalogDeps, 'toScannedInfo' | 'generateKeywords'>
): Promise<AppCatalogEntry> {
  const info = deps.toScannedInfo(row)
  const title = info.displayName?.trim() || info.name
  const launchTarget = info.launchTarget || row.path

  // The index holds its keywords in two tiers. The provider's keywords (1.1 / 1.5), the alias
  // list the record mapper attaches (1.5) and the title (1.25) sit at or above the 1.1 line that
  // `prepareDocument` requires of an n-gram source, so they are gathered first and the n-grams
  // are cut before anything below the line joins the exact set.
  const keywords = new Set<string>()
  for (const keyword of await deps.generateKeywords(info)) {
    addKeyword(keywords, keyword)
  }
  addKeyword(keywords, title)
  addKeyword(keywords, title.replace(/\s+/g, ''))
  for (const alias of [
    info.displayName,
    info.name,
    info.fileName,
    ...(info.alternateNames ?? []),
    info.bundleId,
    info.uniqueId,
    info.stableId,
    row.path,
    launchTarget,
    info.displayPath,
    path.basename(row.path, path.extname(row.path) || undefined),
    path.basename(launchTarget, path.extname(launchTarget) || undefined)
  ]) {
    addKeyword(keywords, alias)
  }
  const ngrams = buildNgrams(keywords)

  // Below the line: title words (1.0), path pieces (1.0 and 0.7), the extension (1.05) and the
  // description words (0.9). Exact and prefix keys like the rest, but never typo sources: grown
  // from "applications", the 2-grams would recall thirty apps for any slip of that word where
  // the index recalls none. Missing an entry here would only make the exact set smaller and open
  // fuzzy matching where the index would not; a superset errs the quiet way.
  for (const word of normalizeSearchText(title).split(' ')) addKeyword(keywords, word)
  for (const segment of row.path.split(/[\\/]+/).filter(Boolean)) addKeyword(keywords, segment)
  // Cleaning strips the dot, so `.app` and `app` land on one key.
  addKeyword(keywords, resolveIndexedExtension(info, launchTarget))
  const description = info.description || info.displayPath || launchTarget
  for (const word of normalizeSearchText(description).split(' ')) addKeyword(keywords, word)

  const titleTokens = new Set<string>(tokenize(title))
  const ftsTokens = new Set<string>(titleTokens)
  const compactTitle = foldSearchText(title).replace(/\s+/g, '')
  if (compactTitle) ftsTokens.add(compactTitle)
  for (const keyword of keywords) {
    for (const token of tokenize(keyword)) ftsTokens.add(token)
  }
  const tags = [row.extensions.bundleId, row.extensions.appIdentity, row.path, launchTarget]
  for (const tag of tags) {
    for (const token of tokenize(tag)) ftsTokens.add(token)
  }

  return {
    row,
    itemId: resolveAppItemId({
      bundleId: row.extensions.bundleId,
      stableId: info.stableId,
      uniqueId: info.uniqueId,
      appIdentity: row.extensions.appIdentity,
      path: row.path
    }),
    title,
    keywords,
    ngrams,
    ftsTokens,
    titleTokens
  }
}

/**
 * The SQL recall funnel, replayed over the in-memory entries with the same thresholds.
 *
 * Exported on its own so the funnel can be pinned by tests without a catalog lifecycle around it.
 */
export function recallAppCatalogEntries(
  entries: readonly AppCatalogEntry[],
  rawText: string
): AppCatalogRecall {
  const normalizedQuery = rawText.normalize('NFC').toLowerCase()
  const baseTerms = normalizedQuery.split(/[\s/]+/).filter(Boolean)
  const terms = baseTerms.length > 0 ? baseTerms : [normalizedQuery]
  const cleanedQuery = normalizeSearchText(rawText)
  const shouldCheckPhrase = baseTerms.length > 1 || baseTerms.length === 0

  // A term's lookup forms are expanded once, not once per entry: the expansion normalizes and
  // folds text, and this runs on every keystroke.
  const hasAnyKeyword = (entry: AppCatalogEntry, variants: readonly string[]): boolean =>
    variants.some((variant) => entry.keywords.has(variant))

  // Exact: every term has to hit one of the entry's keywords (the SQL path intersected per-term
  // hit sets); a multi-word query is also tried whole, which is what reaches spaced aliases.
  let precise: Set<AppCatalogEntry> | null = null
  for (const term of terms) {
    const variants = expandSearchLookupVariants(term)
    const hits = new Set(entries.filter((entry) => hasAnyKeyword(entry, variants)))
    const previous: Set<AppCatalogEntry> | null = precise
    precise = previous === null ? hits : intersectEntries(previous, hits)
  }
  if (shouldCheckPhrase) {
    const phraseVariants = expandSearchLookupVariants(normalizedQuery)
    const phraseHits = entries.filter((entry) => hasAnyKeyword(entry, phraseVariants))
    if (phraseHits.length > 0) {
      precise = unionEntries(precise, phraseHits)
    }
  }
  const preciseCount = precise?.size ?? 0

  let prefixCount = 0
  if (normalizedQuery.length <= PREFIX_LOOKUP_MAX_QUERY_LENGTH) {
    const needle = cleanedQuery || normalizedQuery
    const prefixHits: AppCatalogEntry[] = []
    for (const entry of entries) {
      if (prefixHits.length >= PREFIX_LOOKUP_LIMIT) break
      for (const keyword of entry.keywords) {
        if (keyword.startsWith(needle)) {
          prefixHits.push(entry)
          break
        }
      }
    }
    prefixCount = prefixHits.length
    if (prefixHits.length > 0) {
      precise = unionEntries(precise, prefixHits)
    }
  }

  const isFuzzySearch = !precise || precise.size === 0
  const candidates = new Set<AppCatalogEntry>(precise ?? [])

  // FTS: one to three tokens are prefix-matched and ANDed; four or five are an exact NEAR, which
  // "every token present" approximates. Title hits fill first, as bm25 ranked them.
  const ftsTokens = buildFtsQueryTokens(terms)
  let ftsCount = 0
  if (ftsTokens.length > 0) {
    const prefixMode = ftsTokens.length <= 3
    const matches = (entry: AppCatalogEntry, token: string): boolean => {
      for (const candidate of entry.ftsTokens) {
        if (prefixMode ? candidate.startsWith(token) : candidate === token) return true
      }
      return false
    }
    const scored: Array<{ entry: AppCatalogEntry; titleHits: number }> = []
    for (const entry of entries) {
      if (!ftsTokens.every((token) => matches(entry, token))) continue
      let titleHits = 0
      for (const token of ftsTokens) {
        for (const candidate of entry.titleTokens) {
          if (prefixMode ? candidate.startsWith(token) : candidate === token) {
            titleHits += 1
            break
          }
        }
      }
      scored.push({ entry, titleHits })
    }
    scored.sort((left, right) => right.titleHits - left.titleHits)
    ftsCount = scored.length
    for (const { entry } of scored) {
      if (candidates.size >= MAX_CANDIDATE_COUNT) break
      candidates.add(entry)
    }
  }

  let ngramCount = 0
  if (
    candidates.size < NGRAM_RECALL_THRESHOLD &&
    normalizedQuery.length >= NGRAM_MIN_QUERY_LENGTH
  ) {
    const grams = queryNgrams(normalizedQuery)
    // The SQL lookup sized its floor from the query's gram list before de-duplication, one gram
    // per adjacent pair, so a query with a repeated pair has to clear the same bar here.
    const minimum = Math.max(1, Math.floor((normalizedQuery.length - 1) * 0.4))
    const scored: Array<{ entry: AppCatalogEntry; count: number }> = []
    for (const entry of entries) {
      let count = 0
      for (const gram of grams) if (entry.ngrams.has(gram)) count += 1
      if (count >= minimum) scored.push({ entry, count })
    }
    scored.sort((left, right) => right.count - left.count)
    const top = scored.slice(0, NGRAM_RECALL_LIMIT)
    ngramCount = top.length
    for (const { entry } of top) {
      if (candidates.size >= MAX_CANDIDATE_COUNT) break
      candidates.add(entry)
    }
  }

  let subsequenceCount = 0
  if (
    candidates.size < SUBSEQ_RECALL_THRESHOLD &&
    normalizedQuery.length >= SUBSEQ_MIN_QUERY_LENGTH
  ) {
    const scored: Array<{ entry: AppCatalogEntry; length: number }> = []
    for (const entry of entries) {
      let best = Number.POSITIVE_INFINITY
      for (const keyword of entry.keywords) {
        if (keyword.length < normalizedQuery.length || keyword.length >= best) continue
        if (isSubsequence(normalizedQuery, keyword)) best = keyword.length
      }
      if (Number.isFinite(best)) scored.push({ entry, length: best })
    }
    scored.sort((left, right) => left.length - right.length)
    const top = scored.slice(0, SUBSEQ_RECALL_LIMIT)
    subsequenceCount = top.length
    for (const { entry } of top) {
      if (candidates.size >= MAX_CANDIDATE_COUNT) break
      candidates.add(entry)
    }
  }

  return {
    rows: Array.from(candidates, (entry) => entry.row),
    isFuzzySearch,
    stats: {
      precise: preciseCount,
      prefix: prefixCount,
      fts: ftsCount,
      ngram: ngramCount,
      subsequence: subsequenceCount,
      candidates: candidates.size
    }
  }
}

/**
 * The application catalog held in memory for the search path.
 *
 * Why it exists: app search used to issue three SQL lookups per keystroke through the read worker
 * it shares with the file provider. The FTS one scanned the whole shared table (the `provider`
 * column is UNINDEXED) — 0.4–0.5s for 156 apps on a 276k-file index — so apps missed the 80ms fast
 * window on every keystroke and arrived as a late batch under rows already on screen. With ~150
 * entries the whole funnel fits in memory and costs well under a millisecond.
 *
 * The database stays the source of truth. The catalog reloads from it, debounced, whenever an
 * index commit names this provider (every write path ends in one), when the user edits aliases,
 * and as a safety net when a search finds it older than `staleAfterMs`. A failed reload keeps the
 * previous snapshot; nothing here can make apps disappear.
 */
export class AppSearchCatalogService {
  private entries: readonly AppCatalogEntry[] = []
  private ready = false
  private loadedAt = 0
  private reloading: Promise<void> | null = null
  private reloadRequestedDuringRun: string | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private unsubscribeCommits: (() => void) | null = null
  private disposed = false
  private readonly now: () => number
  private readonly debounceMs: number
  private readonly staleAfterMs: number

  constructor(private readonly deps: AppSearchCatalogDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.staleAfterMs = deps.staleAfterMs ?? DEFAULT_STALE_AFTER_MS
    this.unsubscribeCommits = deps.subscribeCommits((providerIds) => {
      if (providerIds.includes(deps.providerId)) this.scheduleReload('index-commit')
    })
  }

  isReady(): boolean {
    return this.ready
  }

  size(): number {
    return this.entries.length
  }

  /** Runs the funnel over the current snapshot; arranges a background reload when it has aged. */
  recall(query: TuffQuery): AppCatalogRecall {
    if (
      this.ready &&
      !this.reloading &&
      this.debounceTimer === null &&
      this.now() - this.loadedAt > this.staleAfterMs
    ) {
      this.scheduleReload('stale')
    }
    return recallAppCatalogEntries(this.entries, query.text.trim())
  }

  /** Coalesces bursts of writes into one reload; a reload already running is followed by one more. */
  scheduleReload(reason: string): void {
    if (this.disposed) return
    if (this.debounceTimer !== null) return
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.reload(reason)
    }, this.debounceMs)
    this.debounceTimer.unref?.()
  }

  async reload(reason: string): Promise<void> {
    if (this.disposed) return
    if (this.reloading) {
      this.reloadRequestedDuringRun = reason
      return await this.reloading
    }
    this.reloading = this.runReload(reason).finally(() => {
      this.reloading = null
      const followUp = this.reloadRequestedDuringRun
      this.reloadRequestedDuringRun = null
      if (followUp) this.scheduleReload(followUp)
    })
    return await this.reloading
  }

  dispose(): void {
    this.disposed = true
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.unsubscribeCommits?.()
    this.unsubscribeCommits = null
  }

  private async runReload(reason: string): Promise<void> {
    const startedAt = this.now()
    try {
      const rows = await this.deps.loadRows()
      const entries: AppCatalogEntry[] = []
      for (const row of rows) {
        if (this.disposed) return
        entries.push(await buildAppCatalogEntry(row, this.deps))
        // Building an entry is synchronous string work; ~150 back to back would hold the main
        // thread for tens of milliseconds while CoreBox may be mid-keystroke, so the loop hands
        // the event loop back every few dozen rows. The snapshot swaps in whole once complete.
        if (entries.length % RELOAD_YIELD_EVERY_ROWS === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
      }
      this.entries = entries
      this.loadedAt = this.now()
      this.ready = true
      log.debug('App search catalog loaded', {
        meta: { reason, entries: entries.length, durationMs: this.loadedAt - startedAt }
      })
    } catch (error) {
      // The previous snapshot stays in service; a catalog that failed to refresh is still a
      // better answer than the SQL path it replaced going back onto the shared reader.
      log.warn('App search catalog reload failed; keeping the previous snapshot', {
        error,
        meta: { reason, ready: this.ready, entries: this.entries.length }
      })
    }
  }
}
