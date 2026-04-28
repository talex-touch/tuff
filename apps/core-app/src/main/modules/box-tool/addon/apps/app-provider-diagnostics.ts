import path from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
import type {
  AppIndexAddPathResult,
  AppIndexDiagnoseRequest,
  AppIndexDiagnoseResult,
  AppIndexDiagnosticApp,
  AppIndexDiagnosticMatch,
  AppIndexDiagnosticStage,
  AppIndexReindexRequest,
  AppIndexReindexResult
} from '@talex-touch/utils/transport/events/types'
import type { SearchIndexService } from '../../search-engine/search-index-service'
import type { createDbUtils } from '../../../../db/utils'
import { files as filesSchema, keywordMappings } from '../../../../db/schema'
import type { ScannedAppInfo } from './app-types'
import { normalizeStringList } from './app-utils'

type DbAppRecord = typeof filesSchema.$inferSelect
type DbAppWithExtensions = DbAppRecord & { extensions: Record<string, string | null> }
type DiagnosticAppMatch = {
  app: DbAppWithExtensions
  score: number
}

export interface AppProviderDiagnosticsContext {
  id: string
  dbUtils: ReturnType<typeof createDbUtils> | null
  searchIndex: SearchIndexService | null
  fetchExtensionsForFiles(files: DbAppRecord[]): Promise<DbAppWithExtensions[]>
  mapDbAppToScannedInfo(app: DbAppWithExtensions): ScannedAppInfo
  generateKeywordsForApp(appInfo: ScannedAppInfo): Promise<Set<string>>
  getAliasesForApp(appInfo: ScannedAppInfo): string[]
  syncKeywordsForApp(appInfo: ScannedAppInfo): Promise<void>
  addAppByPath(rawPath: string): Promise<AppIndexAddPathResult>
  buildFtsQuery(terms: string[]): string
  logError(message: string, meta?: Record<string, unknown>): void
}

const APP_IDENTITY_EXTENSION_KEY = 'appIdentity'
const APP_ENTRY_SOURCE_EXTENSION_KEY = 'entrySource'
const APP_ENTRY_ENABLED_EXTENSION_KEY = 'entryEnabled'

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function resolveAppItemId(value: {
  bundleId?: string | null
  stableId?: string | null
  appIdentity?: string | null
  path: string
}): string {
  return value.appIdentity || value.stableId || value.path || value.bundleId || ''
}

function resolveAppItemIds(value: {
  bundleId?: string | null
  stableId?: string | null
  appIdentity?: string | null
  path: string
}): string[] {
  return normalizeStringList([
    resolveAppItemId(value),
    value.appIdentity,
    value.stableId,
    value.path,
    value.bundleId
  ])
}

function isManagedEntryEnabledExtensionMap(
  extensions: Record<string, string | null> | undefined
): boolean {
  if (extensions?.[APP_ENTRY_SOURCE_EXTENSION_KEY] !== 'manual') {
    return true
  }
  const raw = extensions?.[APP_ENTRY_ENABLED_EXTENSION_KEY]
  return raw !== '0' && raw !== 'false'
}

async function findDiagnosticApp(
  context: AppProviderDiagnosticsContext,
  target: string
): Promise<{ app: DbAppWithExtensions; candidates: DbAppWithExtensions[] } | null> {
  if (!context.dbUtils) return null

  const allApps = await context.dbUtils.getFilesByType('app')
  const appsWithExtensions = await context.fetchExtensionsForFiles(allApps)
  const matches = appsWithExtensions
    .map((app) => ({ app, score: scoreDiagnosticTarget(context, app, target) }))
    .filter((match): match is DiagnosticAppMatch => match.score > 0)
    .sort((left, right) => right.score - left.score)

  const best = matches[0]
  if (!best) return null

  return {
    app: best.app,
    candidates: matches.slice(0, 8).map((match) => match.app)
  }
}

function scoreDiagnosticTarget(
  context: AppProviderDiagnosticsContext,
  app: DbAppWithExtensions,
  target: string
): number {
  const normalizedTarget = target.trim().toLowerCase()
  if (!normalizedTarget) return 0

  const appInfo = context.mapDbAppToScannedInfo(app)
  const alternateNames = appInfo.alternateNames ?? []
  const fileBaseName = path.basename(app.path, path.extname(app.path) || undefined)
  const exactCandidates: Array<[string | null | undefined, number]> = [
    [app.path, 100],
    [app.extensions[APP_IDENTITY_EXTENSION_KEY], 98],
    [app.extensions.bundleId, 96],
    [app.displayName, 94],
    [app.name, 92],
    [appInfo.fileName, 90],
    [fileBaseName, 88],
    ...alternateNames.map((name): [string, number] => [name, 86])
  ]

  for (const [value, score] of exactCandidates) {
    if (value?.trim().toLowerCase() === normalizedTarget) {
      return score
    }
  }

  const fuzzyCandidates: Array<[string | null | undefined, number]> = [
    [app.displayName, 70],
    [app.name, 68],
    [appInfo.fileName, 66],
    [fileBaseName, 64],
    ...alternateNames.map((name): [string, number] => [name, 62]),
    [app.path, 48],
    [app.extensions.bundleId, 44],
    [app.extensions[APP_IDENTITY_EXTENSION_KEY], 44]
  ]

  for (const [value, score] of fuzzyCandidates) {
    if (value?.trim().toLowerCase().includes(normalizedTarget)) {
      return score
    }
  }

  return 0
}

function toDiagnosticApp(
  context: AppProviderDiagnosticsContext,
  app: DbAppWithExtensions
): AppIndexDiagnosticApp {
  const appInfo = context.mapDbAppToScannedInfo(app)
  return {
    id: app.id,
    path: app.path,
    name: app.name,
    displayName: app.displayName || undefined,
    fileName: appInfo.fileName,
    bundleId: app.extensions.bundleId || undefined,
    appIdentity: app.extensions[APP_IDENTITY_EXTENSION_KEY] || undefined,
    launchKind: appInfo.launchKind,
    launchTarget: appInfo.launchTarget,
    launchArgs: appInfo.launchArgs,
    workingDirectory: appInfo.workingDirectory,
    displayPath: appInfo.displayPath,
    description: appInfo.description,
    alternateNames: appInfo.alternateNames ?? [],
    entrySource: app.extensions[APP_ENTRY_SOURCE_EXTENSION_KEY] || undefined,
    entryEnabled: isManagedEntryEnabledExtensionMap(app.extensions)
  }
}

async function loadStoredKeywordEntries(
  context: AppProviderDiagnosticsContext,
  itemIds: string[]
): Promise<Array<{ value: string; priority: number }>> {
  if (!context.dbUtils || itemIds.length === 0) return []

  const db = context.dbUtils.getDb()
  const rows = await db
    .select({
      value: keywordMappings.keyword,
      priority: keywordMappings.priority
    })
    .from(keywordMappings)
    .where(
      and(eq(keywordMappings.providerId, context.id), inArray(keywordMappings.itemId, itemIds))
    )
    .limit(800)

  const seen = new Set<string>()
  const entries: Array<{ value: string; priority: number }> = []
  for (const row of rows) {
    const value = row.value
    if (!value || value.startsWith('ng:') || seen.has(value)) continue
    seen.add(value)
    entries.push({ value, priority: row.priority })
  }
  return entries.sort((left, right) => left.value.localeCompare(right.value))
}

async function diagnoseAppQuery(
  context: AppProviderDiagnosticsContext,
  rawQuery: string | undefined,
  itemIds: string[]
): Promise<AppIndexDiagnoseResult['query'] | undefined> {
  const raw = normalizeOptionalString(rawQuery)
  if (!raw) return undefined

  const normalized = raw.toLowerCase()
  const baseTerms = normalized.split(/[\s/]+/).filter(Boolean)
  const terms = baseTerms.length > 0 ? baseTerms : [normalized]
  const stages = {
    precise: await diagnosePreciseStage(context, terms, itemIds),
    phrase: await diagnosePhraseStage(context, normalized, baseTerms, itemIds),
    prefix: await diagnosePrefixStage(context, normalized, itemIds),
    fts: await diagnoseFtsStage(context, terms, itemIds),
    ngram: await diagnoseNgramStage(context, normalized, itemIds),
    subsequence: await diagnoseSubsequenceStage(context, normalized, itemIds)
  }
  const candidateItemIds = Array.from(
    new Set(Object.values(stages).flatMap((stage) => stage.matches.map((match) => match.itemId)))
  )

  return {
    raw,
    normalized,
    terms,
    ftsQuery: context.buildFtsQuery(terms),
    candidateItemIds,
    stages
  }
}

function makeDiagnosticStage(
  ran: boolean,
  matches: AppIndexDiagnosticMatch[],
  itemIds: string[],
  reason?: string
): AppIndexDiagnosticStage {
  const targetIds = new Set(itemIds)
  return {
    ran,
    targetHit: matches.some((match) => targetIds.has(match.itemId)),
    matches: matches.slice(0, 25),
    reason
  }
}

async function diagnosePreciseStage(
  context: AppProviderDiagnosticsContext,
  terms: string[],
  itemIds: string[]
): Promise<AppIndexDiagnosticStage> {
  if (!context.searchIndex || terms.length === 0) {
    return makeDiagnosticStage(false, [], itemIds, 'empty-query')
  }

  const lookupByKeywords = (context.searchIndex as Partial<SearchIndexService>).lookupByKeywords
  if (typeof lookupByKeywords !== 'function') {
    return makeDiagnosticStage(false, [], itemIds, 'lookup-unavailable')
  }

  const lookup = await lookupByKeywords.call(context.searchIndex, context.id, terms, 200)
  const matches = terms.flatMap((term) =>
    (lookup.get(term) ?? []).map((entry) => ({
      itemId: entry.itemId,
      keyword: term,
      priority: entry.priority
    }))
  )
  return makeDiagnosticStage(true, matches, itemIds)
}

async function diagnosePhraseStage(
  context: AppProviderDiagnosticsContext,
  normalizedQuery: string,
  baseTerms: string[],
  itemIds: string[]
): Promise<AppIndexDiagnosticStage> {
  if (baseTerms.length <= 1) {
    return makeDiagnosticStage(false, [], itemIds, 'single-term-query')
  }
  return diagnosePreciseStage(context, [normalizedQuery], itemIds)
}

async function diagnosePrefixStage(
  context: AppProviderDiagnosticsContext,
  normalizedQuery: string,
  itemIds: string[]
): Promise<AppIndexDiagnosticStage> {
  if (!context.searchIndex || !normalizedQuery) {
    return makeDiagnosticStage(false, [], itemIds, 'empty-query')
  }
  if (normalizedQuery.length > 5) {
    return makeDiagnosticStage(false, [], itemIds, 'query-too-long-for-prefix-stage')
  }

  const matches = await context.searchIndex.lookupByKeywordPrefix(context.id, normalizedQuery, 200)
  return makeDiagnosticStage(true, matches, itemIds)
}

async function diagnoseFtsStage(
  context: AppProviderDiagnosticsContext,
  terms: string[],
  itemIds: string[]
): Promise<AppIndexDiagnosticStage> {
  if (!context.searchIndex) {
    return makeDiagnosticStage(false, [], itemIds, 'search-index-not-ready')
  }

  const ftsQuery = context.buildFtsQuery(terms)
  if (!ftsQuery) {
    return makeDiagnosticStage(false, [], itemIds, 'empty-fts-query')
  }

  const matches = await context.searchIndex.search(context.id, ftsQuery, 150)
  return makeDiagnosticStage(true, matches, itemIds)
}

async function diagnoseNgramStage(
  context: AppProviderDiagnosticsContext,
  normalizedQuery: string,
  itemIds: string[]
): Promise<AppIndexDiagnosticStage> {
  if (!context.searchIndex || normalizedQuery.length < 3) {
    return makeDiagnosticStage(false, [], itemIds, 'query-too-short-for-ngram-stage')
  }

  const matches = await context.searchIndex.lookupByNgrams(context.id, normalizedQuery, 30)
  return makeDiagnosticStage(true, matches, itemIds)
}

async function diagnoseSubsequenceStage(
  context: AppProviderDiagnosticsContext,
  normalizedQuery: string,
  itemIds: string[]
): Promise<AppIndexDiagnosticStage> {
  if (!context.searchIndex || normalizedQuery.length < 2) {
    return makeDiagnosticStage(false, [], itemIds, 'query-too-short-for-subsequence-stage')
  }

  const matches = await context.searchIndex.lookupBySubsequence(context.id, normalizedQuery, 50)
  return makeDiagnosticStage(true, matches, itemIds)
}

export async function diagnoseAppSearch(
  context: AppProviderDiagnosticsContext,
  request: AppIndexDiagnoseRequest
): Promise<AppIndexDiagnoseResult> {
  const target = normalizeOptionalString(request?.target)
  if (!target) {
    return { success: false, status: 'invalid', target: '', reason: 'target-empty' }
  }
  if (!context.dbUtils) {
    return { success: false, status: 'error', target, reason: 'db-not-ready' }
  }

  try {
    const match = await findDiagnosticApp(context, target)
    if (!match) {
      return { success: false, status: 'not-found', target, reason: 'target-not-found' }
    }

    const appInfo = context.mapDbAppToScannedInfo(match.app)
    const itemId = resolveAppItemId(appInfo)
    const itemIds = resolveAppItemIds(appInfo)
    const storedKeywordEntries = await loadStoredKeywordEntries(context, itemIds)
    const generatedKeywords = Array.from(await context.generateKeywordsForApp(appInfo)).sort()
    const query = await diagnoseAppQuery(context, request.query, itemIds)

    return {
      success: true,
      status: 'found',
      target,
      app: toDiagnosticApp(context, match.app),
      candidates: match.candidates.map((candidate) => toDiagnosticApp(context, candidate)),
      index: {
        itemId,
        itemIds,
        aliases: context.getAliasesForApp(appInfo),
        generatedKeywords,
        storedKeywords: storedKeywordEntries.map((entry) => entry.value),
        storedKeywordEntries
      },
      query
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    context.logError('App search diagnostic failed', { error: message })
    return { success: false, status: 'error', target, reason: message }
  }
}

export async function reindexAppSearchTarget(
  context: AppProviderDiagnosticsContext,
  request: AppIndexReindexRequest
): Promise<AppIndexReindexResult> {
  const target = normalizeOptionalString(request?.target)
  if (!target) {
    return { success: false, status: 'invalid', reason: 'target-empty' }
  }
  if (!context.dbUtils) {
    return { success: false, status: 'error', reason: 'db-not-ready', error: 'db-not-ready' }
  }

  const mode = request.mode ?? 'keywords'
  if (mode === 'keywords' && !context.searchIndex) {
    return {
      success: false,
      status: 'error',
      reason: 'search-index-not-ready',
      error: 'search-index-not-ready'
    }
  }

  const match = await findDiagnosticApp(context, target)
  if (!match) {
    return {
      success: false,
      status: 'not-found',
      reason: 'target-not-found',
      error: 'target-not-found'
    }
  }

  if (request.force !== true) {
    return {
      success: false,
      status: mode === 'scan' ? 'updated' : 'reindexed',
      requiresConfirm: true,
      path: match.app.path,
      message: 'App index reindex requires confirmation'
    }
  }

  if (mode === 'scan') {
    const scanTarget = match.app.path
    const result = await context.addAppByPath(scanTarget)
    if (!result.success) {
      return {
        success: false,
        status: result.status === 'invalid' ? 'invalid' : 'error',
        path: result.path,
        reason: result.reason,
        error: result.reason
      }
    }

    return {
      success: true,
      status: result.status === 'added' ? 'added' : 'updated',
      path: result.path ?? scanTarget,
      message: 'App index rescan complete'
    }
  }

  await context.syncKeywordsForApp(context.mapDbAppToScannedInfo(match.app))
  return {
    success: true,
    status: 'reindexed',
    path: match.app.path,
    message: 'App index reindex complete'
  }
}
