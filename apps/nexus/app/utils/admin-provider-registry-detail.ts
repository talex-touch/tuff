import type { AdminFormat } from '~/composables/useAdminFormat'
import type { RegistryTranslate } from '~/utils/admin-provider-registry'
import type {
  ObservabilityActionHint,
  ProviderHealthCheckEntry,
  ProviderObservabilitySummary,
  ProviderQuotaSummary,
  ProviderRegistryRecord,
  ProviderUsageLedgerEntry,
  SceneObservabilitySummary,
  SceneRegistryRecord,
} from '~/utils/provider-registry-admin'
import { ADMIN_FORMAT_EMPTY } from '~/composables/useAdminFormat'
import {
  adapterReasonLabel,
  formatRegistryLatency,
  healthStatusLabel,
  healthStatusTone,
  invalidBindingReasonLabel,
  readinessLabel,
  readinessTone,
} from '~/utils/admin-provider-registry'

/**
 * The read-only drawers of the provider registry page, as data: each record
 * opens as a list of sections that `ProviderRegistryDetailView.vue` draws. Every
 * field the spec lists for a drawer is here, so it is tested without a DOM.
 */

export type RegistryDetailTone = 'success' | 'warning' | 'danger' | 'muted'

export interface RegistryDetailField {
  key: string
  label: string
  /** `''` draws the empty mark. */
  value: string
  /** `code`: an identifier in monospace; `badge`: a status badge; `text`: wraps anywhere. */
  kind?: 'text' | 'code' | 'badge'
  tone?: RegistryDetailTone
  /** An error: drawn in the danger colour. */
  danger?: boolean
}

export interface RegistryDetailItem {
  key: string
  primary: string
  secondary?: string
  /** The primary text is an identifier. */
  code?: boolean
}

export interface RegistryDetailSection {
  key: string
  /** The first section of a drawer has none: its fields are the record itself. */
  title?: string
  fields?: RegistryDetailField[]
  items?: RegistryDetailItem[]
  /** A JSON block, shown as it is. */
  json?: string
  /** What to say when the section has nothing. */
  empty?: string
}

export interface RegistryDetailContext {
  t: RegistryTranslate
  format: Pick<AdminFormat, 'number' | 'dateTime'>
  providerName: (providerId: string | null | undefined) => string
}

function valueLabel(value: string | null | undefined, t: RegistryTranslate): string {
  return value ? t(`dashboard.providerRegistry.values.${value}`, value) : ''
}

function hintField(hint: ObservabilityActionHint | null | undefined, t: RegistryTranslate): RegistryDetailField[] {
  return hint
    ? [{ key: 'hint', label: t('dashboard.providerRegistry.observability.actionHint', 'Next step'), value: t(hint.labelKey, hint.fallback) }]
    : []
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/** A quota limit as the summary prints it: grouped, or — when it is not set. */
function quotaFigure(value: string, format: Pick<AdminFormat, 'number'>): string {
  const text = value.trim()
  return text && Number.isFinite(Number(text)) ? format.number(Number(text)) : ADMIN_FORMAT_EMPTY
}

/** The quota line in the provider drawer: state, window, limits and how many channels. */
export function providerQuotaSummaryText(quota: ProviderQuotaSummary | null | undefined, ctx: Pick<RegistryDetailContext, 't' | 'format'>): string {
  const { t, format } = ctx
  if (!quota?.configured)
    return t('dashboard.providerRegistry.quota.none', 'No quota configured')
  const state = quota.enabled
    ? t('dashboard.providerRegistry.quota.enabled', 'enabled')
    : t('dashboard.providerRegistry.quota.disabled', 'disabled')
  const days = quotaFigure(quota.windowDays, format)
  const requests = quotaFigure(quota.maxRequests, format)
  const tokens = quotaFigure(quota.maxTokens, format)
  const count = format.number(quota.count)
  return t('dashboard.providerRegistry.quota.summaryLine', { state, days, requests, tokens, count }, `${state} · ${days} days · ${requests} requests · ${tokens} tokens · ${count} channel(s)`)
}

export interface ProviderDetailInput {
  observability: ProviderObservabilitySummary
  hint: ObservabilityActionHint | null
  quota: ProviderQuotaSummary | null
}

/** A provider: what it is and how to reach it, its latest health and usage, its capabilities. */
export function buildProviderDetailSections(
  provider: ProviderRegistryRecord,
  input: ProviderDetailInput,
  ctx: RegistryDetailContext,
): RegistryDetailSection[] {
  const { t, format } = ctx
  const health = input.observability.latestHealth
  const usage = input.observability.latestUsage
  const owner = [valueLabel(provider.ownerScope, t), provider.ownerId ?? ''].filter(Boolean).join(' · ')

  return [
    {
      key: 'provider',
      fields: [
        { key: 'id', label: t('dashboard.providerRegistry.fields.providerId', 'Provider ID'), value: provider.id, kind: 'code' },
        { key: 'status', label: t('dashboard.providerRegistry.fields.status', 'Status'), value: valueLabel(provider.status, t) },
        { key: 'vendor', label: t('dashboard.providerRegistry.fields.vendor', 'Vendor'), value: valueLabel(provider.vendor, t) },
        { key: 'adapter', label: t('dashboard.providerRegistry.fields.adapter', 'Adapter format'), value: readString(provider.metadata?.adapterKey), kind: 'code' },
        { key: 'endpoint', label: t('dashboard.providerRegistry.fields.endpoint', 'Endpoint'), value: provider.endpoint ?? '', kind: 'text' },
        { key: 'region', label: t('dashboard.providerRegistry.fields.region', 'Region'), value: provider.region ?? '' },
        { key: 'authType', label: t('dashboard.providerRegistry.fields.authType', 'Auth type'), value: valueLabel(provider.authType, t) },
        { key: 'owner', label: t('dashboard.providerRegistry.fields.owner', 'Owner'), value: owner },
        { key: 'quota', label: t('dashboard.providerRegistry.quota.title', 'Provider quota'), value: providerQuotaSummaryText(input.quota, ctx) },
        { key: 'updatedAt', label: t('dashboard.providerRegistry.table.updatedAt', 'Updated at'), value: format.dateTime(provider.updatedAt) },
        ...hintField(input.hint, t),
      ],
    },
    {
      key: 'health',
      title: t('dashboard.providerRegistry.observability.latestHealth', 'Latest health'),
      fields: health
        ? [
            { key: 'status', label: t('dashboard.providerRegistry.fields.status', 'Status'), value: healthStatusLabel(health.status, t), kind: 'badge', tone: healthStatusTone(health.status) },
            { key: 'latency', label: t('dashboard.providerRegistry.health.latency', 'Latency'), value: formatRegistryLatency(health.latencyMs, format, t) },
            { key: 'reason', label: t('dashboard.providerRegistry.health.reason', 'Reason'), value: healthReason(health), kind: 'text' },
            { key: 'checkedAt', label: t('dashboard.providerRegistry.table.checkedAt', 'Checked at'), value: format.dateTime(health.checkedAt) },
          ]
        : undefined,
      empty: t('dashboard.providerRegistry.detail.noHealth', 'No check of it among the latest 25.'),
    },
    {
      key: 'usage',
      title: t('dashboard.providerRegistry.observability.latestUsage', 'Latest usage'),
      fields: usage
        ? [
            { key: 'status', label: t('dashboard.providerRegistry.fields.status', 'Status'), value: valueLabel(usage.status, t) },
            { key: 'scene', label: t('dashboard.providerRegistry.detail.scene', 'Scene'), value: usage.sceneId, kind: 'code' },
            { key: 'createdAt', label: t('dashboard.providerRegistry.table.createdAt', 'Created at'), value: format.dateTime(usage.createdAt) },
          ]
        : undefined,
      empty: t('dashboard.providerRegistry.detail.noUsage', 'No usage of it among the latest 25 ledger rows.'),
    },
    {
      key: 'capabilities',
      title: t('dashboard.providerRegistry.providers.capabilitiesTitle', 'Capabilities'),
      items: provider.capabilities.map((capability) => {
        const unit = readString(capability.metering?.unit)
        const adapter = capability.adapter ? adapterReasonLabel(capability.adapter.reason, t) : ''
        return {
          key: capability.id,
          primary: capability.capability,
          secondary: [unit, adapter].filter(Boolean).join(' · ') || undefined,
          code: true,
        }
      }),
      empty: t('dashboard.providerRegistry.detail.noCapabilities', 'This provider declares no capability.'),
    },
  ]
}

/** What went wrong in a check, most specific first: the degraded reason, the error, the request. */
function healthReason(entry: ProviderHealthCheckEntry): string {
  return entry.degradedReason || entry.errorMessage || entry.errorCode || ''
}

export interface RouteDetailInput {
  observability: SceneObservabilitySummary
  hint: ObservabilityActionHint | null
}

/** A capability route: its policy, what it is missing and why, its bindings, its latest run. */
export function buildRouteDetailSections(
  scene: SceneRegistryRecord,
  input: RouteDetailInput,
  ctx: RegistryDetailContext,
): RegistryDetailSection[] {
  const { t, format, providerName } = ctx
  const readiness = scene.readiness
  const run = input.observability.latestUsage
  const owner = [valueLabel(scene.owner, t), valueLabel(scene.ownerScope, t), scene.ownerId ?? ''].filter(Boolean).join(' · ')

  const sections: RegistryDetailSection[] = [
    {
      key: 'route',
      fields: [
        { key: 'id', label: t('dashboard.providerRegistry.fields.routeId', 'Route ID'), value: scene.id, kind: 'code' },
        { key: 'owner', label: t('dashboard.providerRegistry.fields.owner', 'Owner'), value: owner },
        { key: 'status', label: t('dashboard.providerRegistry.fields.status', 'Status'), value: valueLabel(scene.status, t) },
        { key: 'strategy', label: t('dashboard.providerRegistry.fields.strategy', 'Strategy'), value: valueLabel(scene.strategyMode, t) },
        { key: 'fallback', label: t('dashboard.providerRegistry.fields.fallback', 'Fallback'), value: valueLabel(scene.fallback, t) },
        { key: 'requiredCapabilities', label: t('dashboard.providerRegistry.fields.requiredCapabilities', 'Required capabilities'), value: scene.requiredCapabilities.join(', '), kind: 'text' },
        ...(readiness
          ? [{ key: 'readiness', label: t('dashboard.providerRegistry.table.readiness', 'Readiness'), value: readinessLabel(readiness.status, t), kind: 'badge' as const, tone: readinessTone(readiness.status) }]
          : []),
        ...hintField(input.hint, t),
      ],
    },
  ]

  if (readiness?.missingCapabilities.length) {
    sections.push({
      key: 'missing',
      title: t('dashboard.providerRegistry.routes.missingCapabilities', 'Missing capabilities'),
      items: readiness.missingCapabilities.map(capability => ({ key: capability, primary: capability, code: true })),
    })
  }

  if (readiness?.invalidBindings.length) {
    sections.push({
      key: 'invalidBindings',
      title: t('dashboard.providerRegistry.routes.invalidBindings', 'Invalid bindings'),
      items: readiness.invalidBindings.map(binding => ({
        key: binding.bindingId,
        primary: `${providerName(binding.providerId)} · ${binding.capability}`,
        secondary: invalidBindingReasonLabel(binding.code, t),
      })),
    })
  }

  sections.push({
    key: 'bindings',
    title: t('dashboard.providerRegistry.routes.bindingsTitle', 'Provider bindings'),
    items: scene.bindings.map(binding => ({
      key: binding.id,
      primary: `${providerName(binding.providerId)} · ${binding.capability}`,
      secondary: [
        binding.model || t('dashboard.providerRegistry.providers.modelDefault', 'Use default model'),
        t('dashboard.providerRegistry.routes.priorityValue', { value: format.number(binding.priority) }, `priority ${binding.priority}`),
        valueLabel(binding.status, t),
      ].join(' · '),
    })),
    empty: t('dashboard.providerRegistry.detail.noBindings', 'This route binds no provider.'),
  })

  sections.push({
    key: 'latestRun',
    title: t('dashboard.providerRegistry.observability.latestSceneRun', 'Latest scene run'),
    fields: run
      ? [
          { key: 'status', label: t('dashboard.providerRegistry.fields.status', 'Status'), value: valueLabel(run.status, t), kind: 'badge', tone: observabilityTone(run.status) },
          { key: 'provider', label: t('dashboard.providerRegistry.fields.provider', 'Provider'), value: providerName(run.providerId) },
          { key: 'createdAt', label: t('dashboard.providerRegistry.table.createdAt', 'Created at'), value: format.dateTime(run.createdAt) },
        ]
      : undefined,
    empty: t('dashboard.providerRegistry.detail.noRun', 'No run of this route among the latest 25 ledger rows.'),
  })

  return sections
}

function observabilityTone(status: string): RegistryDetailTone {
  if (status === 'completed')
    return 'success'
  if (status === 'planned')
    return 'warning'
  return status === 'failed' ? 'danger' : 'muted'
}

function booleanLabel(value: boolean, t: RegistryTranslate): string {
  return value
    ? t('dashboard.providerRegistry.values.yes', 'Yes')
    : t('dashboard.providerRegistry.values.no', 'No')
}

/** One ledger row: the run, the metering and its references, any error, and the run's trail. */
export function buildUsageDetailSections(
  entry: ProviderUsageLedgerEntry,
  hint: ObservabilityActionHint | null,
  ctx: RegistryDetailContext,
): RegistryDetailSection[] {
  const { t, format, providerName } = ctx
  const error = [entry.errorCode, entry.errorMessage].filter(Boolean).join(' · ')
  return [
    {
      key: 'run',
      fields: [
        { key: 'runId', label: t('dashboard.providerRegistry.detail.runId', 'Run ID'), value: entry.runId, kind: 'code' },
        { key: 'scene', label: t('dashboard.providerRegistry.detail.scene', 'Scene'), value: entry.sceneId, kind: 'code' },
        { key: 'mode', label: t('dashboard.providerRegistry.detail.mode', 'Mode'), value: valueLabel(entry.mode, t) },
        { key: 'capability', label: t('dashboard.providerRegistry.fields.capability', 'Capability'), value: entry.capability ?? '', kind: 'code' },
        { key: 'status', label: t('dashboard.providerRegistry.fields.status', 'Status'), value: valueLabel(entry.status, t), kind: 'badge', tone: observabilityTone(entry.status) },
        { key: 'provider', label: t('dashboard.providerRegistry.fields.provider', 'Provider'), value: providerName(entry.providerId) },
        { key: 'metering', label: t('dashboard.providerRegistry.usage.metering', 'Metering'), value: `${format.number(entry.quantity)} ${entry.unit}` },
        { key: 'billable', label: t('dashboard.providerRegistry.usage.billableLabel', 'Billable'), value: booleanLabel(entry.billable, t) },
        { key: 'estimated', label: t('dashboard.providerRegistry.usage.estimatedLabel', 'Estimated'), value: booleanLabel(entry.estimated, t) },
        { key: 'pricingRef', label: t('dashboard.providerRegistry.usage.pricingRef', 'Pricing ref'), value: entry.pricingRef ?? '', kind: 'code' },
        { key: 'providerRef', label: t('dashboard.providerRegistry.usage.providerRef', 'Provider ref'), value: entry.providerUsageRef ?? '', kind: 'code' },
        ...(error ? [{ key: 'error', label: t('dashboard.providerRegistry.usage.error', 'Error'), value: error, kind: 'text' as const, danger: true }] : []),
        { key: 'createdAt', label: t('dashboard.providerRegistry.table.createdAt', 'Created at'), value: format.dateTime(entry.createdAt) },
        ...hintField(hint, t),
      ],
    },
    { key: 'trace', title: t('dashboard.providerRegistry.routes.trace', 'Trace'), json: json(entry.trace) },
    { key: 'fallbackTrail', title: t('dashboard.providerRegistry.routes.fallbackTrail', 'Fallback trail'), json: json(entry.fallbackTrail) },
    { key: 'selected', title: t('dashboard.providerRegistry.routes.selection', 'Selection'), json: json(entry.selected) },
  ]
}

/** One health check: who was checked where, the outcome, and why. */
export function buildHealthDetailSections(
  entry: ProviderHealthCheckEntry,
  hint: ObservabilityActionHint | null,
  ctx: RegistryDetailContext,
): RegistryDetailSection[] {
  const { t, format } = ctx
  const error = [entry.errorCode, entry.errorMessage].filter(Boolean).join(' · ')
  return [
    {
      key: 'check',
      fields: [
        { key: 'provider', label: t('dashboard.providerRegistry.fields.provider', 'Provider'), value: entry.providerName },
        { key: 'providerId', label: t('dashboard.providerRegistry.fields.providerId', 'Provider ID'), value: entry.providerId, kind: 'code' },
        { key: 'vendor', label: t('dashboard.providerRegistry.fields.vendor', 'Vendor'), value: valueLabel(entry.vendor, t) },
        { key: 'endpoint', label: t('dashboard.providerRegistry.fields.endpoint', 'Endpoint'), value: entry.endpoint, kind: 'text' },
        { key: 'capability', label: t('dashboard.providerRegistry.fields.capability', 'Capability'), value: entry.capability, kind: 'code' },
        { key: 'status', label: t('dashboard.providerRegistry.fields.status', 'Status'), value: healthStatusLabel(entry.status, t), kind: 'badge', tone: healthStatusTone(entry.status) },
        { key: 'latency', label: t('dashboard.providerRegistry.health.latency', 'Latency'), value: formatRegistryLatency(entry.latencyMs, format, t) },
        ...(entry.degradedReason ? [{ key: 'degradedReason', label: t('dashboard.providerRegistry.health.degradedReason', 'Degraded reason'), value: entry.degradedReason, kind: 'text' as const }] : []),
        ...(error ? [{ key: 'error', label: t('dashboard.providerRegistry.usage.error', 'Error'), value: error, kind: 'text' as const, danger: true }] : []),
        { key: 'requestId', label: t('dashboard.providerRegistry.health.request', 'Request'), value: entry.requestId ?? '', kind: 'code' },
        { key: 'checkedAt', label: t('dashboard.providerRegistry.table.checkedAt', 'Checked at'), value: format.dateTime(entry.checkedAt) },
        ...hintField(hint, t),
      ],
    },
  ]
}
