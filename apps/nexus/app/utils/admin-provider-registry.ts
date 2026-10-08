import type { AdminFormat } from '~/composables/useAdminFormat'
import type { AdminListFetchParams, AdminListFilters, AdminListOptions, AdminListPage } from '~/composables/useAdminList'
import type { ClientListFetcher } from '~/utils/admin-client-list'
import type { AdminStatItem } from '~/utils/admin-kit'
import type {
  HealthCheckFilter,
  ProviderCapabilityRecord,
  ProviderEditPanelState,
  ProviderHealthCheckEntry,
  ProviderObservabilityFilter,
  ProviderObservabilitySummary,
  ProviderRegistryRecord,
  ProviderUsageLedgerEntry,
  SceneEditPanelState,
  SceneObservabilityFilter,
  SceneObservabilitySummary,
  SceneRegistryRecord,
  SceneStrategyBindingRecord,
  UsageLedgerFilter,
} from '~/utils/provider-registry-admin'
import { ADMIN_FORMAT_EMPTY } from '~/composables/useAdminFormat'
import { createClientListFetcher } from '~/utils/admin-client-list'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'
import {
  healthCheckFilters,
  providerMatchesObservability,
  providerObservabilityFilters,
  ProviderRegistryInputError,
  sceneMatchesObservability,
  sceneObservabilityFilters,
  usageLedgerFilters,
} from '~/utils/provider-registry-admin'

/**
 * Pure rules behind the provider registry page (`/admin/provider-registry`) on
 * the console kit: the tab and list addresses, the API query each server list
 * sends, the stat cards, the read-only drawers' fields, what a save is about to
 * delete, and the localized error. Kept out of the SFCs so they are tested
 * directly.
 */

/** vue-i18n's `t`, called as `t(key, fallback)` and as `t(key, named, fallback)`. */
export type RegistryTranslate = ((key: string, fallback: string) => string)
  & ((key: string, named: Record<string, unknown>, fallback: string) => string)

type NumberFormat = Pick<AdminFormat, 'number'>

// ─── Tabs and list addresses ───────────────────────────────────────────────

export const PROVIDER_REGISTRY_TABS = ['providers', 'routes', 'usage', 'health'] as const
export type ProviderRegistryTab = typeof PROVIDER_REGISTRY_TABS[number]

export const PROVIDER_REGISTRY_PAGE_SIZES = [20, 50, 100]

/** The provider drawer's three forms, and the scene drawer's. */
export type ProviderDrawerMode = 'create' | 'edit' | 'quota'
export type SceneDrawerMode = 'create' | 'edit' | 'run'

// Five lists share the route, so each keeps its page, page size and filters
// under its own prefix (`?pv_page=`, `?u_status=` …) and none overwrites another.
export const PROVIDER_LIST_QUERY_PREFIX = 'pv_'
export const ROUTE_LIST_QUERY_PREFIX = 'rt_'
export const CAPABILITY_LIST_QUERY_PREFIX = 'cap_'
export const USAGE_LIST_QUERY_PREFIX = 'u_'
export const HEALTH_LIST_QUERY_PREFIX = 'h_'

/** A filter value from the URL that is not one of the options reads as the default. */
function knownValue<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? value as T : fallback
}

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

// ─── Client lists: providers, routes, capability index ─────────────────────
//
// The registry resource loads every provider, scene and capability at once, so
// these three lists filter and page on the client. Their rows come from the
// resource: when it loads again, invalidate the fetcher and refresh the list.

export interface ProviderListFilters extends AdminListFilters {
  q: string
  status: ProviderObservabilityFilter
}

export const PROVIDER_LIST_DEFAULTS: ProviderListFilters = { q: '', status: 'all' }

/** Search across what an operator would type: names, id, vendor, endpoint, capabilities. */
export function providerMatchesSearch(provider: ProviderRegistryRecord, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle)
    return true
  const capabilityText = provider.capabilities
    .flatMap(capability => [capability.capability, capability.schemaRef])
    .filter(Boolean)
    .join(' ')
  return [
    provider.displayName,
    provider.id,
    provider.name,
    provider.vendor,
    provider.authType,
    provider.status,
    provider.description,
    provider.endpoint,
    provider.region,
    capabilityText,
  ].some(value => String(value ?? '').toLowerCase().includes(needle))
}

export interface ClientListSetup<Row, F extends AdminListFilters> {
  options: AdminListOptions<Row, F>
  fetcher: ClientListFetcher<Row, F>
}

/**
 * The rows of a client list once the registry has answered. `ready` settles with
 * the registry's first load (`whenRegistryLoaded`): asked earlier, the list would
 * page no rows, and `useAdminList` would move a link's page back to 1 for good.
 */
function registryRows<Row>(rows: () => Row[], ready?: () => Promise<void>): () => Promise<Row[]> {
  return async () => {
    await ready?.()
    return rows()
  }
}

export function createProviderListOptions(
  rows: () => ProviderRegistryRecord[],
  observability: () => Record<string, ProviderObservabilitySummary>,
  ready?: () => Promise<void>,
): ClientListSetup<ProviderRegistryRecord, ProviderListFilters> {
  const fetcher = createClientListFetcher<ProviderRegistryRecord, ProviderListFilters>(
    registryRows(rows, ready),
    (provider, filters) => providerMatchesSearch(provider, filters.q)
      && providerMatchesObservability(
        observability()[provider.id],
        knownValue(filters.status, providerObservabilityFilters, 'all'),
      ),
  )
  return {
    fetcher,
    options: {
      fetch: fetcher,
      defaults: PROVIDER_LIST_DEFAULTS,
      pageSizes: PROVIDER_REGISTRY_PAGE_SIZES,
      debounceKeys: ['q'],
      queryKeyPrefix: PROVIDER_LIST_QUERY_PREFIX,
    },
  }
}

export interface RouteListFilters extends AdminListFilters {
  status: SceneObservabilityFilter
}

export const ROUTE_LIST_DEFAULTS: RouteListFilters = { status: 'all' }

export function createRouteListOptions(
  rows: () => SceneRegistryRecord[],
  observability: () => Record<string, SceneObservabilitySummary>,
  ready?: () => Promise<void>,
): ClientListSetup<SceneRegistryRecord, RouteListFilters> {
  const fetcher = createClientListFetcher<SceneRegistryRecord, RouteListFilters>(
    registryRows(rows, ready),
    (scene, filters) => sceneMatchesObservability(
      observability()[scene.id],
      knownValue(filters.status, sceneObservabilityFilters, 'all'),
    ),
  )
  return {
    fetcher,
    options: {
      fetch: fetcher,
      defaults: ROUTE_LIST_DEFAULTS,
      pageSizes: PROVIDER_REGISTRY_PAGE_SIZES,
      queryKeyPrefix: ROUTE_LIST_QUERY_PREFIX,
    },
  }
}

export type CapabilityListFilters = Record<string, never>

export function createCapabilityListOptions(
  rows: () => ProviderCapabilityRecord[],
  ready?: () => Promise<void>,
): ClientListSetup<ProviderCapabilityRecord, CapabilityListFilters> {
  const fetcher = createClientListFetcher<ProviderCapabilityRecord, CapabilityListFilters>(
    registryRows(rows, ready),
    () => true,
  )
  return {
    fetcher,
    options: {
      fetch: fetcher,
      defaults: {},
      pageSizes: PROVIDER_REGISTRY_PAGE_SIZES,
      queryKeyPrefix: CAPABILITY_LIST_QUERY_PREFIX,
    },
  }
}

// ─── Server lists: usage ledger and health checks ──────────────────────────

/** `GET …/usage` / `GET …/health` through the observability service; a fake in tests. */
export type ObservabilityPageRequest<Entry> = (query: Record<string, string | number>) => Promise<{
  entries?: Entry[]
  total?: number
} | null | undefined>

export const USAGE_MODE_FILTERS = ['all', 'execute', 'dry_run'] as const
export type UsageModeFilter = typeof USAGE_MODE_FILTERS[number]

export interface UsageListFilters extends AdminListFilters {
  status: UsageLedgerFilter
  mode: UsageModeFilter
  provider: string
  scene: string
}

export const USAGE_LIST_DEFAULTS: UsageListFilters = { status: 'all', mode: 'all', provider: '', scene: '' }

/**
 * The query for one page of the ledger. 需关注 (failed, planned or estimated) and
 * 估算 are flags of their own; a single status, the mode, the provider and the
 * scene map one to one. A filter at its default sends nothing.
 */
export function buildUsageListQuery(params: AdminListFetchParams<UsageListFilters>): Record<string, string | number> {
  const query: Record<string, string | number> = { page: params.page, limit: params.limit }
  const status = knownValue(params.filters.status, usageLedgerFilters, 'all')
  if (status === 'attention')
    query.attention = 'true'
  else if (status === 'estimated')
    query.estimated = 'true'
  else if (status !== 'all')
    query.status = status
  const mode = knownValue(params.filters.mode, USAGE_MODE_FILTERS, 'all')
  if (mode !== 'all')
    query.mode = mode
  if (params.filters.provider)
    query.providerId = params.filters.provider
  if (params.filters.scene)
    query.sceneId = params.filters.scene
  return query
}

export function createUsageListOptions(
  request: ObservabilityPageRequest<ProviderUsageLedgerEntry>,
  t: RegistryTranslate,
): AdminListOptions<ProviderUsageLedgerEntry, UsageListFilters> {
  return {
    async fetch(params): Promise<AdminListPage<ProviderUsageLedgerEntry>> {
      const response = await request(buildUsageListQuery(params))
      return {
        rows: Array.isArray(response?.entries) ? response.entries : [],
        total: toCount(response?.total),
      }
    },
    defaults: USAGE_LIST_DEFAULTS,
    pageSizes: PROVIDER_REGISTRY_PAGE_SIZES,
    queryKeyPrefix: USAGE_LIST_QUERY_PREFIX,
    errorFallback: () => t('dashboard.providerRegistry.usage.loadFailed', 'Failed to load the usage ledger.'),
  }
}

export interface HealthListFilters extends AdminListFilters {
  status: HealthCheckFilter
  provider: string
}

export const HEALTH_LIST_DEFAULTS: HealthListFilters = { status: 'all', provider: '' }

/** Every check that did not pass: what 需关注 sends, and what the health card counts. */
export const HEALTH_ATTENTION_STATUSES = 'degraded,unhealthy'

export function buildHealthListQuery(params: AdminListFetchParams<HealthListFilters>): Record<string, string | number> {
  const query: Record<string, string | number> = { page: params.page, limit: params.limit }
  const status = knownValue(params.filters.status, healthCheckFilters, 'all')
  if (status === 'attention')
    query.status = HEALTH_ATTENTION_STATUSES
  else if (status !== 'all')
    query.status = status
  if (params.filters.provider)
    query.providerId = params.filters.provider
  return query
}

export function createHealthListOptions(
  request: ObservabilityPageRequest<ProviderHealthCheckEntry>,
  t: RegistryTranslate,
): AdminListOptions<ProviderHealthCheckEntry, HealthListFilters> {
  return {
    async fetch(params): Promise<AdminListPage<ProviderHealthCheckEntry>> {
      const response = await request(buildHealthListQuery(params))
      return {
        rows: Array.isArray(response?.entries) ? response.entries : [],
        total: toCount(response?.total),
      }
    },
    defaults: HEALTH_LIST_DEFAULTS,
    pageSizes: PROVIDER_REGISTRY_PAGE_SIZES,
    queryKeyPrefix: HEALTH_LIST_QUERY_PREFIX,
    errorFallback: () => t('dashboard.providerRegistry.health.loadFailed', 'Failed to load the health checks.'),
  }
}

// ─── Stat cards ────────────────────────────────────────────────────────────

export interface ProviderRegistrySummary {
  providerCount: number
  enabledProviderCount: number
  capabilityCount: number
  sceneCount: number
  /** The ledger's own total, not a window's length. */
  usageTotal: number
  /** Checks that did not pass: degraded plus unhealthy. */
  unhealthyTotal: number
}

/** The five cards; only the providers card has a line under its label, its enabled count. */
export function buildProviderRegistryStatItems(
  summary: ProviderRegistrySummary,
  format: NumberFormat,
  t: RegistryTranslate,
): AdminStatItem[] {
  const enabled = format.number(summary.enabledProviderCount)
  return [
    {
      key: 'providers',
      label: t('dashboard.providerRegistry.summary.providers', 'Providers'),
      value: format.number(summary.providerCount),
      meta: t('dashboard.providerRegistry.summary.enabledProviders', { count: enabled }, `${enabled} enabled`),
      iconClass: 'i-carbon-cloud-service-management',
    },
    {
      key: 'capabilities',
      label: t('dashboard.providerRegistry.summary.capabilities', 'Capabilities'),
      value: format.number(summary.capabilityCount),
      iconClass: 'i-carbon-catalog',
    },
    {
      key: 'scenes',
      label: t('dashboard.providerRegistry.summary.scenes', 'Scenes'),
      value: format.number(summary.sceneCount),
      iconClass: 'i-carbon-flow',
    },
    {
      key: 'usage',
      label: t('dashboard.providerRegistry.summary.usage', 'Usage'),
      value: format.number(summary.usageTotal),
      iconClass: 'i-carbon-data-check',
    },
    {
      key: 'health',
      label: t('dashboard.providerRegistry.summary.health', 'Health'),
      value: format.number(summary.unhealthyTotal),
      iconClass: 'i-carbon-activity',
    },
  ]
}

// ─── Labels ────────────────────────────────────────────────────────────────

export interface RegistryOption<Value extends string = string> {
  value: Value
  label: string
}

/** The providers list: by the latest health check, or 需关注 (not healthy, or the latest run failed). */
export function buildProviderStatusFilterOptions(t: RegistryTranslate): RegistryOption<ProviderObservabilityFilter>[] {
  return [
    { value: 'all', label: t('dashboard.providerRegistry.filters.all', 'All') },
    { value: 'attention', label: t('dashboard.providerRegistry.filters.attention', 'Needs attention') },
    { value: 'healthy', label: t('dashboard.providerRegistry.filters.healthy', 'Healthy') },
    { value: 'degraded', label: t('dashboard.providerRegistry.filters.degraded', 'Degraded') },
    { value: 'unhealthy', label: t('dashboard.providerRegistry.filters.unhealthy', 'Unhealthy') },
    { value: 'unknown', label: t('dashboard.providerRegistry.filters.unknown', 'Unknown') },
  ]
}

/** The routes list: by the latest run. */
export function buildRouteStatusFilterOptions(t: RegistryTranslate): RegistryOption<SceneObservabilityFilter>[] {
  return [
    { value: 'all', label: t('dashboard.providerRegistry.filters.all', 'All') },
    { value: 'attention', label: t('dashboard.providerRegistry.filters.attention', 'Needs attention') },
    { value: 'completed', label: t('dashboard.providerRegistry.filters.completed', 'Completed') },
    { value: 'failed', label: t('dashboard.providerRegistry.filters.failed', 'Failed') },
    { value: 'planned', label: t('dashboard.providerRegistry.filters.planned', 'Planned') },
    { value: 'unknown', label: t('dashboard.providerRegistry.filters.unknown', 'Unknown') },
  ]
}

export function buildUsageStatusFilterOptions(t: RegistryTranslate): RegistryOption<UsageLedgerFilter>[] {
  return [
    { value: 'all', label: t('dashboard.providerRegistry.filters.all', 'All') },
    { value: 'attention', label: t('dashboard.providerRegistry.filters.attention', 'Needs attention') },
    { value: 'completed', label: t('dashboard.providerRegistry.filters.completed', 'Completed') },
    { value: 'failed', label: t('dashboard.providerRegistry.filters.failed', 'Failed') },
    { value: 'planned', label: t('dashboard.providerRegistry.filters.planned', 'Planned') },
    { value: 'estimated', label: t('dashboard.providerRegistry.filters.estimated', 'Estimated') },
  ]
}

export function buildUsageModeFilterOptions(t: RegistryTranslate): RegistryOption<UsageModeFilter>[] {
  return [
    { value: 'all', label: t('dashboard.providerRegistry.filters.all', 'All') },
    { value: 'execute', label: t('dashboard.providerRegistry.values.execute', 'Execute') },
    { value: 'dry_run', label: t('dashboard.providerRegistry.values.dry_run', 'Dry run') },
  ]
}

export function buildHealthStatusFilterOptions(t: RegistryTranslate): RegistryOption<HealthCheckFilter>[] {
  return [
    { value: 'all', label: t('dashboard.providerRegistry.filters.all', 'All') },
    { value: 'attention', label: t('dashboard.providerRegistry.filters.attention', 'Needs attention') },
    { value: 'healthy', label: t('dashboard.providerRegistry.filters.healthy', 'Healthy') },
    { value: 'degraded', label: t('dashboard.providerRegistry.filters.degraded', 'Degraded') },
    { value: 'unhealthy', label: t('dashboard.providerRegistry.filters.unhealthy', 'Unhealthy') },
  ]
}

/** A filter on another record: every one the registry holds, or none picked. */
export function buildRecordFilterOptions(
  records: Array<{ id: string, displayName: string }>,
  allLabel: string,
): RegistryOption[] {
  return [
    { value: '', label: allLabel },
    ...records.map(record => ({ value: record.id, label: record.displayName || record.id })),
  ]
}

/** A provider's or a check's health. `degraded` reads 受限 in Chinese: the provider is marked degraded and the probe failed. */
export function healthStatusLabel(status: ProviderObservabilitySummary['status'], t: RegistryTranslate): string {
  switch (status) {
    case 'healthy':
      return t('dashboard.providerRegistry.values.healthy', 'Healthy')
    case 'degraded':
      return t('dashboard.providerRegistry.values.degraded', 'Degraded')
    case 'unhealthy':
      return t('dashboard.providerRegistry.values.unhealthy', 'Unhealthy')
    case 'unknown':
      return t('dashboard.providerRegistry.values.unknown', 'Unknown')
  }
}

export function healthStatusTone(status: ProviderObservabilitySummary['status']): 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'healthy')
    return 'success'
  if (status === 'degraded')
    return 'warning'
  return status === 'unhealthy' ? 'danger' : 'muted'
}

export type SceneReadinessStatus = NonNullable<SceneRegistryRecord['readiness']>['status']
export type InvalidBindingCode = NonNullable<SceneRegistryRecord['readiness']>['invalidBindings'][number]['code']

/**
 * A scene's readiness. `degraded` here is the one 降级 in the console: a scene
 * missing a required capability. Provider and health `degraded` read 受限.
 */
export function readinessLabel(status: SceneReadinessStatus, t: RegistryTranslate): string {
  switch (status) {
    case 'ready':
      return t('dashboard.providerRegistry.readiness.ready', 'Ready')
    case 'degraded':
      return t('dashboard.providerRegistry.readiness.degraded', 'Degraded')
    case 'disabled':
      return t('dashboard.providerRegistry.readiness.disabled', 'Disabled')
  }
}

export function readinessTone(status: SceneReadinessStatus): 'success' | 'warning' | 'muted' {
  if (status === 'ready')
    return 'success'
  return status === 'degraded' ? 'warning' : 'muted'
}

export function invalidBindingReasonLabel(code: InvalidBindingCode, t: RegistryTranslate): string {
  switch (code) {
    case 'PROVIDER_MISSING':
      return t('dashboard.providerRegistry.invalidBinding.providerMissing', 'Provider not found')
    case 'CAPABILITY_MISSING':
      return t('dashboard.providerRegistry.invalidBinding.capabilityMissing', 'Capability missing')
    case 'ADAPTER_MISSING':
      return t('dashboard.providerRegistry.invalidBinding.adapterMissing', 'Adapter missing')
    case 'MODEL_INVALID':
      return t('dashboard.providerRegistry.invalidBinding.modelInvalid', 'Model not in the provider list')
  }
}

export type AdapterReadinessReason = NonNullable<ProviderCapabilityRecord['adapter']>['reason']

export function adapterReasonLabel(reason: AdapterReadinessReason, t: RegistryTranslate): string {
  switch (reason) {
    case 'adapter-ready':
      return t('dashboard.providerRegistry.adapterReason.ready', 'Adapter ready')
    case 'provider-capability-missing':
      return t('dashboard.providerRegistry.adapterReason.capabilityMissing', 'The provider does not declare this capability')
    case 'adapter-key-missing':
      return t('dashboard.providerRegistry.adapterReason.keyMissing', 'The provider has no adapter format')
    case 'adapter-missing':
      return t('dashboard.providerRegistry.adapterReason.missing', 'No adapter handles this capability')
  }
}

/** Milliseconds with grouping (「1,850 ms」); no figure reads —. */
export function formatRegistryLatency(milliseconds: number | null | undefined, format: NumberFormat, t: RegistryTranslate): string {
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds))
    return ADMIN_FORMAT_EMPTY
  const value = format.number(milliseconds)
  return t('dashboard.sections.intelligence.latencyMs', { value }, `${value} ms`)
}

// ─── What a save is about to delete ────────────────────────────────────────

/**
 * The declared capabilities a provider save will delete: rows removed from the
 * editor, and existing rows whose capability was blanked (the save skips them
 * and deletes what they were).
 */
export function capabilitiesRemovedBySave(
  provider: ProviderRegistryRecord,
  panel: Pick<ProviderEditPanelState, 'capabilities' | 'removedCapabilityIds'>,
): ProviderCapabilityRecord[] {
  const ids = new Set(panel.removedCapabilityIds)
  for (const row of panel.capabilities) {
    if (row.id && !row.capability.trim())
      ids.add(row.id)
  }
  return provider.capabilities.filter(capability => ids.has(capability.id))
}

// The server keys a binding by provider and capability (`sceneRegistryStore`
// rejects a second row with both): a new model on the same pair is an edit.
function bindingKey(providerId: string, capability: string): string {
  return [providerId, capability.trim()].join('\u0000')
}

/**
 * The bindings a scene save will delete. The save replaces the scene's bindings
 * with the editor's rows, so an existing binding is gone when no kept row has
 * its provider and capability: removed, blanked, or moved to another provider
 * or capability. A changed model, weight or status is an edit, not a deletion.
 */
export function bindingsRemovedBySave(
  scene: Pick<SceneRegistryRecord, 'bindings'>,
  panel: Pick<SceneEditPanelState, 'bindings'>,
): SceneStrategyBindingRecord[] {
  const kept = new Set(
    panel.bindings
      .filter(row => row.providerId && row.capability.trim())
      .map(row => bindingKey(row.providerId, row.capability)),
  )
  return scene.bindings.filter(binding => !kept.has(bindingKey(binding.providerId, binding.capability)))
}

// ─── Errors ────────────────────────────────────────────────────────────────

/** The form label of a JSON or number field: what the operator sees, not the request path. */
function fieldLabel(name: string, t: RegistryTranslate): string {
  switch (name) {
    case 'provider.metadata':
    case 'scene.metadata':
    case 'metadata':
      return t('dashboard.providerRegistry.fields.metadataJson', 'Metadata JSON')
    case 'scene.meteringPolicy':
      return t('dashboard.providerRegistry.fields.meteringPolicyJson', 'Metering policy JSON')
    case 'scene.auditPolicy':
      return t('dashboard.providerRegistry.fields.auditPolicyJson', 'Audit policy JSON')
    case 'constraints':
      return t('dashboard.providerRegistry.fields.constraintsJson', 'Constraints JSON')
    case 'metering':
      return t('dashboard.providerRegistry.fields.meteringJson', 'Metering JSON')
    case 'maxImageBytes':
      return t('dashboard.providerRegistry.fields.maxImageBytes', 'Max image bytes')
    case 'windowDays':
      return t('dashboard.providerRegistry.quota.windowDays', 'Window days')
    case 'maxRequests':
      return t('dashboard.providerRegistry.quota.maxRequests', 'Max requests')
    case 'maxTokens':
      return t('dashboard.providerRegistry.quota.maxTokens', 'Max tokens')
    case 'warningThreshold':
      return t('dashboard.providerRegistry.quota.warningThreshold', 'Warning threshold')
    case 'input':
      return t('dashboard.providerRegistry.routes.inputJson', 'Input JSON')
    default:
      return name
  }
}

/**
 * The label a validation message names: a row editor's field reads as
 * "Constraints JSON, row 2" (`capabilities[1].constraints`); a name it does not
 * know stays as it is.
 */
export function validationFieldLabel(field: unknown, t: RegistryTranslate): string {
  const name = String(field ?? '')
  const row = /^(?:capabilities|bindings)\[(\d+)\]\.(\w+)$/.exec(name)
  if (!row)
    return fieldLabel(name, t)
  const label = fieldLabel(row[2]!, t)
  const index = Number(row[1]) + 1
  return t('dashboard.providerRegistry.form.rowField', { field: label, row: index }, `${label}, row ${index}`)
}

/**
 * The line to show for a failed registry action: a value the operator typed
 * reads its localized message; anything else goes through
 * `resolveAdminErrorMessage`, which never shows ofetch's request line.
 */
export function resolveProviderRegistryError(error: unknown, t: RegistryTranslate, fallback: string): string {
  if (!(error instanceof ProviderRegistryInputError))
    return resolveAdminErrorMessage(error, fallback)
  const { params } = error
  const field = validationFieldLabel(params.field, t)
  switch (error.code) {
    case 'json-invalid':
      return t('dashboard.providerRegistry.validation.jsonInvalid', { field }, `${field} is not valid JSON.`)
    case 'json-not-object':
      return t('dashboard.providerRegistry.validation.jsonNotObject', { field }, `${field} must be a JSON object.`)
    case 'capability-duplicated':
      return t('dashboard.providerRegistry.validation.capabilityDuplicated', { capability: params.capability }, error.message)
    case 'number-non-negative':
      return t('dashboard.providerRegistry.validation.numberNonNegative', { field }, `${field} must be a non-negative number.`)
    case 'number-min':
      return t('dashboard.providerRegistry.validation.numberMin', { field, min: params.min }, `${field} must be a number greater than or equal to ${params.min}.`)
    case 'number-range':
      return t('dashboard.providerRegistry.validation.numberRange', { field, min: params.min, max: params.max }, `${field} must be a number between ${params.min} and ${params.max}.`)
    case 'default-model-missing':
      return t('dashboard.providerRegistry.validation.defaultModelMissing', error.message)
  }
}
