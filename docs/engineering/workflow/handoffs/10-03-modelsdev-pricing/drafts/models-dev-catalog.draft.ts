/**
 * DRAFT kept outside the repo: the Comet shape-phase hook blocked writing it to
 * apps/core-app/src/main/modules/ai/pricing/models-dev-catalog.ts at 05:03 PDT 2026-10-03.
 * Not yet typechecked or tested.
 *
 * models.dev pricing catalog: fetch, compact, verify, persist, and the background refresh schedule.
 *
 * Parent design §2.2 and §2.5 (`.trellis/tasks/10-03-intelligence-audit-rebuild/design.md`).
 *
 * - One `system_config` row holds the compact catalog (about 0.5 MB of JSON). Its `sha256` covers a
 *   key-sorted serialization of `providers`; a row that fails the check is treated as absent.
 * - Fetching is background-only: never on the startup path, never while a pricing caller waits, at
 *   most once per 24 h, through the user's proxy settings (`getNetworkService()`). A failed fetch
 *   keeps the previous catalog.
 * - A 304 moves only the row's `updated_at`; the stored JSON is not rewritten. The effective
 *   `checkedAt` is the later of the JSON field and that column.
 * - Writes go through `scheduleDbWrite` at background priority. SQLITE_BUSY retry belongs to the
 *   scheduler, so nothing here wraps `withSqliteRetry` (`database-write-contracts.md` §3–§4).
 */
import { createHash } from 'node:crypto'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import {
  isTimeoutLikeError,
  isTransportFailureError,
  parseHttpStatusCode
} from '@talex-touch/utils/network'
import { eq, sql } from 'drizzle-orm'
import { scheduleDbWrite } from '../../../db/db-write'
import { getStartupDegradeWindowRemainingMs } from '../../../db/runtime-flags'
import { systemConfig } from '../../../db/schema'
import { createLogger } from '../../../utils/logger'
import { databaseModule } from '../../database'
import { getNetworkService } from '../../network'

export const MODELS_DEV_CATALOG_URL = 'https://models.dev/api.json'
export const PRICING_CATALOG_CONFIG_KEY = 'intelligence.pricing.models-dev.catalog'
/**
 * `{ sinceMs }`: audit rows whose `timestamp >= sinceMs` carry an `estimated_cost` computed by this
 * catalog; older rows were priced by the retired fixed table and must be re-priced on read.
 */
export const PRICING_SINCE_CONFIG_KEY = 'intelligence.pricing.models-dev.since'
/** A catalog confirmed within this window is not requested again. */
export const PRICING_CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000

const CATALOG_FETCH_TIMEOUT_MS = 20_000
/** In-memory only: after a failed attempt, scheduled and on-demand checks wait this long. */
const CATALOG_RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000
const CATALOG_FIRST_CHECK_MIN_DELAY_MS = 30_000
/** How often the schedule re-checks staleness; a request is only sent once the catalog is stale. */
const CATALOG_CHECK_INTERVAL_MS = 60 * 60 * 1000
const CATALOG_CHECK_TASK_ID = 'intelligence.pricing.catalog-check'
const FAILURE_LOG_THROTTLE_MS = 6 * 60 * 60 * 1000

const pricingLog = createLogger('Intelligence').child('Pricing')

export interface CompactCatalogModel {
  name?: string
  /** USD per 1M input tokens. */
  input?: number
  /** USD per 1M output tokens. */
  output?: number
  cacheRead?: number
  cacheWrite?: number
  /** Context window in tokens. */
  context?: number
  /** Output limit in tokens. */
  outputLimit?: number
  /** models.dev lists a price (`cost.input` or `cost.output`) for this model. */
  priced: boolean
}

export interface CompactCatalogProvider {
  name: string
  /** Base URL models.dev records for the provider's API; null for SDK-only providers. */
  api: string | null
  models: Record<string, CompactCatalogModel>
}

export interface CompactCatalog {
  version: 1
  source: 'models.dev'
  fetchedAt: number
  checkedAt: number
  etag: string | null
  sha256: string
  /** In models.dev order — base-URL matching breaks ties by it. */
  providers: Record<string, CompactCatalogProvider>
}

export interface PricingCatalogStatus {
  available: boolean
  fetchedAt: number | null
  checkedAt: number | null
}

export type PricingRefreshOutcome =
  /** New catalog fetched and stored. */
  | 'updated'
  /** 304: the stored catalog was confirmed current. */
  | 'not-modified'
  /** Checked within the last 24 h; no request sent. */
  | 'fresh'
  /** A recent attempt failed; no request sent. */
  | 'backoff'
  /** Request, payload or storage failed; the previous catalog stays. */
  | 'failed'

interface CatalogState {
  catalog: CompactCatalog | null
  /** The stored row has been read (present, absent or invalid). Read errors leave it false. */
  loaded: boolean
  /** Bumped by every in-memory replacement, so a slower read cannot overwrite a newer catalog. */
  generation: number
  loading: Promise<CompactCatalog | null> | null
  refreshing: Promise<PricingRefreshOutcome> | null
  retryNotBefore: number
  sinceMarkerEnsured: boolean
  lastFailureLogAt: number
  suppressedFailureLogs: number
}

function createCatalogState(): CatalogState {
  return {
    catalog: null,
    loaded: false,
    generation: 0,
    loading: null,
    refreshing: null,
    retryNotBefore: 0,
    sinceMarkerEnsured: false,
    lastFailureLogAt: Number.NEGATIVE_INFINITY,
    suppressedFailureLogs: 0
  }
}

let state = createCatalogState()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** Key-sorted JSON, so the hash does not depend on property order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item === undefined ? null : item)).join(',')}]`
  }
  if (isRecord(value)) {
    const parts: string[] = []
    for (const key of Object.keys(value).sort()) {
      const item = value[key]
      if (item === undefined) continue
      parts.push(`${JSON.stringify(key)}:${stableStringify(item)}`)
    }
    return `{${parts.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function hashCatalogProviders(providers: unknown): string {
  return createHash('sha256').update(stableStringify(providers)).digest('hex')
}

function compactModel(raw: Record<string, unknown>): CompactCatalogModel {
  const model: CompactCatalogModel = { priced: false }
  const name = nonEmptyString(raw.name)
  if (name) model.name = name

  const cost = isRecord(raw.cost) ? raw.cost : null
  if (cost) {
    const input = finiteNumber(cost.input)
    const output = finiteNumber(cost.output)
    const cacheRead = finiteNumber(cost.cache_read)
    const cacheWrite = finiteNumber(cost.cache_write)
    if (input !== undefined) model.input = input
    if (output !== undefined) model.output = output
    if (cacheRead !== undefined) model.cacheRead = cacheRead
    if (cacheWrite !== undefined) model.cacheWrite = cacheWrite
    model.priced = input !== undefined || output !== undefined
  }

  const limit = isRecord(raw.limit) ? raw.limit : null
  if (limit) {
    const context = finiteNumber(limit.context)
    const outputLimit = finiteNumber(limit.output)
    if (context !== undefined) model.context = context
    if (outputLimit !== undefined) model.outputLimit = outputLimit
  }
  return model
}

/**
 * Reduces models.dev `api.json` to what pricing reads: per provider its name and API base, per
 * model its base input/output/cache prices and context/output limits. Tiered and
 * `context_over_200k` prices are dropped — usage only carries input and output token counts.
 *
 * Returns null when the payload has no usable provider.
 */
export function compactModelsDevCatalog(
  raw: unknown,
  meta: { fetchedAt?: number; checkedAt?: number; etag?: string | null } = {}
): CompactCatalog | null {
  if (!isRecord(raw)) return null

  // Built through entries + fromEntries so an id such as `__proto__` stays an own key.
  const providerEntries: Array<[string, CompactCatalogProvider]> = []
  for (const [providerId, rawProvider] of Object.entries(raw)) {
    if (!isRecord(rawProvider) || !isRecord(rawProvider.models)) continue
    const modelEntries: Array<[string, CompactCatalogModel]> = []
    for (const [modelId, rawModel] of Object.entries(rawProvider.models)) {
      if (isRecord(rawModel)) modelEntries.push([modelId, compactModel(rawModel)])
    }
    providerEntries.push([
      providerId,
      {
        name: nonEmptyString(rawProvider.name) ?? providerId,
        api: nonEmptyString(rawProvider.api) ?? null,
        models: Object.fromEntries(modelEntries)
      }
    ])
  }
  if (providerEntries.length === 0) return null

  const providers = Object.fromEntries(providerEntries)
  const fetchedAt = meta.fetchedAt ?? Date.now()
  return {
    version: 1,
    source: 'models.dev',
    fetchedAt,
    checkedAt: meta.checkedAt ?? fetchedAt,
    etag: meta.etag ?? null,
    sha256: hashCatalogProviders(providers),
    providers
  }
}

const COMPACT_MODEL_NUMBER_FIELDS = [
  'input',
  'output',
  'cacheRead',
  'cacheWrite',
  'context',
  'outputLimit'
] as const

function isCompactModel(value: unknown): value is CompactCatalogModel {
  if (!isRecord(value) || typeof value.priced !== 'boolean') return false
  if (value.name !== undefined && typeof value.name !== 'string') return false
  return COMPACT_MODEL_NUMBER_FIELDS.every(
    (field) => value[field] === undefined || finiteNumber(value[field]) !== undefined
  )
}

function isProviderTable(value: unknown): value is Record<string, CompactCatalogProvider> {
  if (!isRecord(value)) return false
  for (const provider of Object.values(value)) {
    if (
      !isRecord(provider) ||
      typeof provider.name !== 'string' ||
      !(provider.api === null || typeof provider.api === 'string') ||
      !isRecord(provider.models)
    ) {
      return false
    }
    for (const model of Object.values(provider.models)) {
      if (!isCompactModel(model)) return false
    }
  }
  return true
}

/** Shape and hash check of a stored catalog. Anything else is treated as no catalog. */
export function verifyCompactCatalog(value: unknown): CompactCatalog | null {
  if (!isRecord(value) || value.version !== 1 || value.source !== 'models.dev') return null
  const fetchedAt = finiteNumber(value.fetchedAt)
  const checkedAt = finiteNumber(value.checkedAt)
  if (fetchedAt === undefined || checkedAt === undefined) return null
  const etag = value.etag
  if (etag !== null && typeof etag !== 'string') return null
  const sha256 = value.sha256
  if (typeof sha256 !== 'string' || !isProviderTable(value.providers)) return null
  if (hashCatalogProviders(value.providers) !== sha256) return null
  return {
    version: 1,
    source: 'models.dev',
    fetchedAt,
    checkedAt,
    etag,
    sha256,
    providers: value.providers
  }
}

function parseStoredCatalog(value: string, updatedAt: number): CompactCatalog | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  const catalog = verifyCompactCatalog(parsed)
  if (!catalog) return null
  // A 304 only touches `updated_at` (see header), so that column can be the later check.
  return { ...catalog, checkedAt: Math.max(catalog.checkedAt, finiteNumber(updatedAt) ?? 0) }
}

async function readStoredCatalog(): Promise<CompactCatalog | null> {
  const rows = await databaseModule
    .getDb()
    .select({ value: systemConfig.value, updatedAt: systemConfig.updatedAt })
    .from(systemConfig)
    .where(eq(systemConfig.key, PRICING_CATALOG_CONFIG_KEY))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const catalog = parseStoredCatalog(row.value, row.updatedAt)
  if (!catalog) {
    pricingLog.warn('Stored models.dev catalog failed verification; pricing treats it as absent', {
      meta: { code: 'INTELLIGENCE_PRICING_CATALOG_INVALID' }
    })
  }
  return catalog
}

function replaceCatalog(catalog: CompactCatalog | null): void {
  state.catalog = catalog
  state.loaded = true
  state.generation += 1
}

/** The catalog currently in memory; null until `loadPricingCatalog()` has read one. */
export function getLoadedPricingCatalog(): CompactCatalog | null {
  return state.catalog
}

/**
 * Reads the stored catalog once per process (read-only; never touches the network). Concurrent
 * callers share one read. A read error resolves to whatever is in memory and is retried next call.
 */
export function loadPricingCatalog(): Promise<CompactCatalog | null> {
  if (state.loaded) return Promise.resolve(state.catalog)
  if (state.loading) return state.loading

  const owner = state
  const generation = owner.generation
  const task: Promise<CompactCatalog | null> = readStoredCatalog()
    .then((catalog) => {
      if (owner.generation === generation) {
        owner.catalog = catalog
        owner.loaded = true
      }
      return owner.catalog
    })
    .catch(() => {
      pricingLog.warn('Could not read the stored models.dev catalog', {
        meta: { code: 'INTELLIGENCE_PRICING_CATALOG_READ_FAILED' }
      })
      return owner.catalog
    })
    .finally(() => {
      if (owner.loading === task) owner.loading = null
    })
  owner.loading = task
  return task
}

/** Status of the in-memory catalog; call `loadPricingCatalog()` first for an accurate answer. */
export function getPricingCatalogStatus(): PricingCatalogStatus {
  const catalog = state.catalog
  return {
    available: catalog !== null,
    fetchedAt: catalog?.fetchedAt ?? null,
    checkedAt: catalog?.checkedAt ?? null
  }
}

function describeFailure(error: unknown): { failure?: string; status?: number } {
  if (error === undefined) return {}
  const status = parseHttpStatusCode(error)
  if (status !== null) return { failure: 'http', status }
  if (isTimeoutLikeError(error)) return { failure: 'timeout' }
  if (isTransportFailureError(error)) return { failure: 'transport' }
  return { failure: 'other' }
}

function failRefresh(reason: string, error?: unknown): PricingRefreshOutcome {
  const now = Date.now()
  state.retryNotBefore = now + CATALOG_RETRY_AFTER_FAILURE_MS
  if (now - state.lastFailureLogAt < FAILURE_LOG_THROTTLE_MS) {
    state.suppressedFailureLogs += 1
    return 'failed'
  }
  pricingLog.warn('models.dev pricing catalog refresh failed; keeping the previous catalog', {
    meta: {
      code: 'INTELLIGENCE_PRICING_REFRESH_FAILED',
      reason,
      ...describeFailure(error),
      suppressed: state.suppressedFailureLogs > 0 ? state.suppressedFailureLogs : undefined
    }
  })
  state.lastFailureLogAt = now
  state.suppressedFailureLogs = 0
  return 'failed'
}

async function writeStoredCatalog(catalog: CompactCatalog): Promise<void> {
  const db = databaseModule.getDb()
  const value = JSON.stringify(catalog)
  await scheduleDbWrite(
    'intelligence.pricing.catalog.write',
    () =>
      db
        .insert(systemConfig)
        .values({ key: PRICING_CATALOG_CONFIG_KEY, value, updatedAt: catalog.checkedAt })
        .onConflictDoUpdate({
          target: systemConfig.key,
          set: { value: sql`excluded.value`, updatedAt: sql`excluded.updated_at` }
        }),
    { priority: 'background' }
  )
}

async function touchStoredCatalog(checkedAt: number): Promise<void> {
  const db = databaseModule.getDb()
  await scheduleDbWrite(
    'intelligence.pricing.catalog.touch',
    () =>
      db
        .update(systemConfig)
        .set({ updatedAt: checkedAt })
        .where(eq(systemConfig.key, PRICING_CATALOG_CONFIG_KEY)),
    { priority: 'background' }
  )
}

async function runRefresh(force: boolean): Promise<PricingRefreshOutcome> {
  const current = await loadPricingCatalog()
  const startedAt = Date.now()
  if (!force) {
    const age = current ? startedAt - current.checkedAt : Number.POSITIVE_INFINITY
    // A negative age means the clock moved back; treat it as stale rather than fresh for days.
    if (age >= 0 && age < PRICING_CATALOG_MAX_AGE_MS) return 'fresh'
    if (startedAt < state.retryNotBefore) return 'backoff'
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (current?.etag) headers['If-None-Match'] = current.etag

  let response: Awaited<ReturnType<ReturnType<typeof getNetworkService>['request']>>
  try {
    response = await getNetworkService().request<string>({
      method: 'GET',
      url: MODELS_DEV_CATALOG_URL,
      headers,
      timeoutMs: CATALOG_FETCH_TIMEOUT_MS,
      responseType: 'text',
      validateStatus: [200, 304]
    })
  } catch (error) {
    return failRefresh('request', error)
  }

  const checkedAt = Date.now()
  if (response.status === 304) {
    if (!current) return failRefresh('not-modified-without-catalog')
    try {
      await touchStoredCatalog(checkedAt)
    } catch (error) {
      return failRefresh('persist', error)
    }
    replaceCatalog({ ...current, checkedAt })
    state.retryNotBefore = 0
    return 'not-modified'
  }

  let raw: unknown
  try {
    raw = JSON.parse(typeof response.data === 'string' ? response.data : '')
  } catch {
    return failRefresh('invalid-payload')
  }
  const catalog = compactModelsDevCatalog(raw, {
    fetchedAt: checkedAt,
    checkedAt,
    etag: nonEmptyString(response.headers.etag) ?? null
  })
  if (!catalog) return failRefresh('invalid-payload')

  try {
    await writeStoredCatalog(catalog)
  } catch (error) {
    return failRefresh('persist', error)
  }
  replaceCatalog(catalog)
  state.retryNotBefore = 0
  pricingLog.info('models.dev pricing catalog updated', {
    meta: {
      providers: Object.keys(catalog.providers).length,
      models: Object.values(catalog.providers).reduce(
        (total, provider) => total + Object.keys(provider.models).length,
        0
      )
    }
  })
  return 'updated'
}

/**
 * Brings the stored catalog up to date. Without `force`, sends nothing while the catalog was
 * checked within 24 h or while a recent failure is backing off. Never rejects; concurrent callers
 * share one attempt.
 */
export function refreshPricingCatalog(
  options: { force?: boolean } = {}
): Promise<PricingRefreshOutcome> {
  if (state.refreshing) return state.refreshing
  const owner = state
  const task: Promise<PricingRefreshOutcome> = runRefresh(options.force === true)
    .catch((error: unknown) => failRefresh('unexpected', error))
    .finally(() => {
      if (owner.refreshing === task) owner.refreshing = null
    })
  owner.refreshing = task
  return task
}

/** Fire-and-forget refresh for read paths: only fetches when stale, and never waits. */
export function requestPricingRefresh(): void {
  void refreshPricingCatalog()
}

function parseSinceMarker(value: string | undefined): number | null {
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return (isRecord(parsed) ? finiteNumber(parsed.sinceMs) : undefined) ?? null
  } catch {
    return null
  }
}

/** When models.dev pricing started writing audit costs; null before the first start with it. */
export async function readPricingSinceMs(): Promise<number | null> {
  const rows = await databaseModule
    .getDb()
    .select({ value: systemConfig.value })
    .from(systemConfig)
    .where(eq(systemConfig.key, PRICING_SINCE_CONFIG_KEY))
    .limit(1)
  return parseSinceMarker(rows[0]?.value)
}

/** Writes the since marker on the first start with models.dev pricing; never moves an existing one. */
export async function ensurePricingSinceMarker(nowMs: number = Date.now()): Promise<void> {
  if (state.sinceMarkerEnsured) return
  const owner = state
  const existing = await readPricingSinceMs()
  if (existing === null) {
    const db = databaseModule.getDb()
    await scheduleDbWrite(
      'intelligence.pricing.since',
      () =>
        db
          .insert(systemConfig)
          .values({
            key: PRICING_SINCE_CONFIG_KEY,
            value: JSON.stringify({ sinceMs: nowMs }),
            updatedAt: nowMs
          })
          .onConflictDoNothing({ target: systemConfig.key }),
      { priority: 'background' }
    )
  }
  owner.sinceMarkerEnsured = true
}

/**
 * Registers the background staleness check: first run at least 30 s after module start and past
 * the startup write window (`database-write-contracts.md` §7), then hourly. Each run only sends a
 * request when the catalog is older than 24 h, and returns at once so it holds no polling slot.
 */
export function startPricingCatalogSchedule(): void {
  const polling = PollingService.getInstance()
  if (polling.isRegistered(CATALOG_CHECK_TASK_ID)) polling.unregister(CATALOG_CHECK_TASK_ID)
  polling.register(CATALOG_CHECK_TASK_ID, () => requestPricingRefresh(), {
    interval: CATALOG_CHECK_INTERVAL_MS,
    unit: 'milliseconds',
    initialDelayMs: Math.max(CATALOG_FIRST_CHECK_MIN_DELAY_MS, getStartupDegradeWindowRemainingMs()),
    lane: 'maintenance'
  })
  polling.start()
}

export function stopPricingCatalogSchedule(): void {
  const polling = PollingService.getInstance()
  if (polling.isRegistered(CATALOG_CHECK_TASK_ID)) polling.unregister(CATALOG_CHECK_TASK_ID)
}

/** Test seam: install a catalog as if it had been read from storage. */
export function primePricingCatalogForTest(catalog: CompactCatalog | null): void {
  replaceCatalog(catalog)
}

/** Test seam: forget all in-memory catalog state. */
export function resetPricingCatalogForTest(): void {
  state = createCatalogState()
}
