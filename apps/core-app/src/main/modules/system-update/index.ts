import type { ModuleDestroyContext, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type * as schema from '../../db/schema'
import { AppPreviewChannel, resolveUpdateChannelLabel, splitUpdateTag } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffBaseUrl } from '@talex-touch/utils/env'
import { eq, sql } from 'drizzle-orm'
import { BaseModule } from '../abstract-base-module'
import { fxRateProvider } from '../box-tool/addon/preview/providers'
import { databaseModule } from '../database'
import { notificationModule } from '../notification'
import {
  SystemConfigUpdatedEvent,
  TalexEvents as TouchEvents,
  touchEventBus
} from '../../core/eventbus/touch-event'
import { createLogger } from '../../utils/logger'
import { getAppVersionSafe } from '../../utils/version-util'

const log = createLogger('SystemUpdate')

const SYSTEM_UPDATE_STATE_ID = 'global'
const SYSTEM_UPDATE_POLL_ID = 'system-update.poll'
const FX_RATE_DEFAULT_TTL_MS = 8 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000

interface LocalizedText {
  zh?: string
  en?: string
}

interface DashboardUpdate {
  id: string
  type: string
  scope?: string
  channels?: string[]
  releaseTag?: string | null
  title: LocalizedText | string
  summary: LocalizedText | string
  timestamp: string
  link: string
  payloadUrl?: string | null
  payloadSha256?: string | null
}

interface FxRatePayload {
  kind: 'fx-rate'
  base: string
  asOf?: string
  providerUpdatedAt?: string | null
  fetchedAt?: string
  providerNextUpdateAt?: string | null
  ttlMs?: number
  source?: string
  rates: Record<string, number>
}

interface ConfigPayload {
  key?: string
  value?: unknown
}

export class SystemUpdateModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('SystemUpdate')
  name: ModuleKey = SystemUpdateModule.key

  private readonly pollingService = PollingService.getInstance()
  private db: LibSQLDatabase<typeof schema> | null = null
  private baseUrl = getTuffBaseUrl()
  private channel: AppPreviewChannel = this.resolveChannel()

  constructor() {
    super(SystemUpdateModule.key, { create: true, dirName: 'system-update' })
  }

  async onInit(_ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    this.db = databaseModule.getDb()
    await this.ensureState()
    await this.hydrateFxRates()
    fxRateProvider.start()

    if (this.pollingService.isRegistered(SYSTEM_UPDATE_POLL_ID)) {
      this.pollingService.unregister(SYSTEM_UPDATE_POLL_ID)
    }

    this.pollingService.register(
      SYSTEM_UPDATE_POLL_ID,
      async () => {
        await this.refreshUpdates()
      },
      { interval: 60 * 60 * 1000, unit: 'milliseconds' }
    )

    this.pollingService.start()
    await this.refreshUpdates()
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): void {
    this.pollingService.unregister(SYSTEM_UPDATE_POLL_ID)
    fxRateProvider.stop()
  }

  private resolveChannel(): AppPreviewChannel {
    const { channelLabel } = splitUpdateTag(getAppVersionSafe())
    return resolveUpdateChannelLabel(channelLabel)
  }

  private resolveBaseUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path
    const trimmed = path.startsWith('/') ? path : `/${path}`
    return `${this.baseUrl}${trimmed}`
  }

  private resolveLocalizedText(text: LocalizedText | string): string {
    if (typeof text === 'string') return text
    if (text && typeof text === 'object') {
      return text.zh || text.en || ''
    }
    return ''
  }

  private async ensureState(): Promise<void> {
    if (!this.db) return
    await this.db
      .insert(schema.systemUpdateState)
      .values({
        id: SYSTEM_UPDATE_STATE_ID,
        etag: null,
        lastFetchedAt: 0,
        lastProcessedId: null,
        updatedAt: 0
      })
      .onConflictDoNothing()
  }

  private async loadState() {
    if (!this.db) return null
    return this.db
      .select()
      .from(schema.systemUpdateState)
      .where(eq(schema.systemUpdateState.id, SYSTEM_UPDATE_STATE_ID))
      .get()
  }

  private async saveState(
    patch: Partial<typeof schema.systemUpdateState.$inferInsert>
  ): Promise<void> {
    if (!this.db) return
    await this.db
      .update(schema.systemUpdateState)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(schema.systemUpdateState.id, SYSTEM_UPDATE_STATE_ID))
  }

  private async refreshUpdates(): Promise<void> {
    if (!this.db) return

    const state = await this.loadState()
    const headers: Record<string, string> = {}
    if (state?.etag) {
      headers['If-None-Match'] = state.etag
    }

    const url = new URL('/api/updates', this.baseUrl)
    url.searchParams.set('scope', 'system')
    url.searchParams.set('channel', this.channel)

    let response: Response
    try {
      response = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      })
    } catch (error) {
      log.warn('Failed to fetch system updates', { error })
      return
    }

    const now = Date.now()
    if (response.status === 304) {
      await this.saveState({ lastFetchedAt: now })
      return
    }

    if (!response.ok) {
      log.warn('System update request failed', { meta: { status: response.status } })
      return
    }

    let payload: { updates?: DashboardUpdate[] } | null = null
    try {
      payload = (await response.json()) as { updates?: DashboardUpdate[] }
    } catch (error) {
      log.warn('System update response invalid', { error })
      return
    }

    const updates = Array.isArray(payload?.updates) ? (payload?.updates ?? []) : []
    const newEtag = response.headers.get('etag') ?? undefined
    const processedId = await this.applyUpdates(updates, state?.lastProcessedId ?? null)

    await this.saveState({
      etag: newEtag ?? state?.etag ?? null,
      lastFetchedAt: now,
      lastProcessedId: processedId ?? state?.lastProcessedId ?? null
    })
  }

  private resolvePendingUpdates(updates: DashboardUpdate[], lastProcessedId: string | null) {
    const ordered = updates.slice().reverse()
    if (!lastProcessedId) return ordered
    const index = ordered.findIndex((update) => update.id === lastProcessedId)
    if (index < 0) return ordered
    return ordered.slice(index + 1)
  }

  private async applyUpdates(
    updates: DashboardUpdate[],
    lastProcessedId: string | null
  ): Promise<string | null> {
    if (!updates.length) return null
    const pending = this.resolvePendingUpdates(updates, lastProcessedId)
    if (!pending.length) return null

    for (const update of pending) {
      await this.applyUpdate(update)
    }

    return pending[pending.length - 1]?.id ?? null
  }

  private async applyUpdate(update: DashboardUpdate): Promise<void> {
    if (update.type === 'announcement') {
      this.applyAnnouncement(update)
      return
    }

    if (update.type === 'config') {
      const payload = await this.fetchPayload(update)
      if (payload) {
        await this.applyConfig(update, payload as ConfigPayload)
      }
      return
    }

    if (update.type === 'data') {
      const payload = await this.fetchPayload(update)
      if (payload && (payload as FxRatePayload).kind === 'fx-rate') {
        await this.applyFxRate(update, payload as FxRatePayload)
      }
    }
  }

  private applyAnnouncement(update: DashboardUpdate): void {
    const title = this.resolveLocalizedText(update.title)
    const message = this.resolveLocalizedText(update.summary)
    notificationModule.pushInboxEntry({
      title,
      message,
      level: 'info',
      dedupeKey: update.id,
      payload: {
        updateId: update.id,
        link: update.link,
        type: update.type,
        timestamp: update.timestamp
      }
    })
  }

  private async applyConfig(update: DashboardUpdate, payload: ConfigPayload): Promise<void> {
    if (!this.db) return
    const key =
      typeof payload?.key === 'string' && payload.key.trim() ? payload.key.trim() : update.id
    const value =
      payload && Object.prototype.hasOwnProperty.call(payload, 'value') ? payload.value : payload
    const serialized = JSON.stringify(value ?? null)
    const updatedAt = Date.parse(update.timestamp) || Date.now()

    await this.db
      .insert(schema.systemConfig)
      .values({
        key,
        value: serialized,
        updatedAt
      })
      .onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: {
          value: sql`excluded.value`,
          updatedAt: sql`excluded.updated_at`
        }
      })

    touchEventBus.emit(
      TouchEvents.SYSTEM_CONFIG_UPDATED,
      new SystemConfigUpdatedEvent(key, value, updatedAt)
    )
  }

  private async applyFxRate(_update: DashboardUpdate, payload: FxRatePayload): Promise<void> {
    if (!this.db) return
    const base = (payload.base || 'USD').toUpperCase()
    const fetchedAt = payload.fetchedAt ? Date.parse(payload.fetchedAt) : Date.now()
    const providerUpdatedAt = payload.providerUpdatedAt
      ? Date.parse(payload.providerUpdatedAt)
      : null
    const updatedAt = providerUpdatedAt || fetchedAt
    const source = payload.source || 'nexus'
    const ttlMs = typeof payload.ttlMs === 'number' ? payload.ttlMs : FX_RATE_DEFAULT_TTL_MS

    const rates = payload.rates || {}
    if (!rates[base]) {
      rates[base] = 1
    }

    const rows = Object.entries(rates)
      .map(([quote, rate]) => ({
        base,
        quote: quote.toUpperCase(),
        rate: Number(rate),
        updatedAt,
        source,
        providerUpdatedAt,
        fetchedAt
      }))
      .filter((row) => Number.isFinite(row.rate))

    if (rows.length === 0) return

    await this.db
      .insert(schema.fxRates)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.fxRates.base, schema.fxRates.quote],
        set: {
          rate: sql`excluded.rate`,
          updatedAt: sql`excluded.updated_at`,
          source: sql`excluded.source`,
          providerUpdatedAt: sql`excluded.provider_updated_at`,
          fetchedAt: sql`excluded.fetched_at`
        }
      })

    fxRateProvider.applyExternalRates({
      base,
      rates,
      fetchedAt,
      providerUpdatedAt,
      ttlMs,
      source
    })
  }

  private async fetchPayload(update: DashboardUpdate): Promise<unknown | null> {
    if (!update.payloadUrl) return null
    const url = this.resolveBaseUrl(update.payloadUrl)
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    } catch (error) {
      log.warn('Failed to fetch update payload', { error })
      return null
    }
    if (!response.ok) {
      log.warn('Update payload request failed', { meta: { status: response.status } })
      return null
    }
    try {
      const text = await response.text()
      return JSON.parse(text)
    } catch (error) {
      log.warn('Update payload JSON parse failed', { error })
      return null
    }
  }

  private async hydrateFxRates(): Promise<void> {
    if (!this.db) return
    const rows = await this.db.select().from(schema.fxRates).where(eq(schema.fxRates.base, 'USD'))
    if (!rows.length) return

    const rates: Record<string, number> = {}
    let latestFetchedAt = 0
    let latestProviderUpdatedAt: number | null = null
    let source = rows[0]?.source ?? 'nexus'

    for (const row of rows) {
      rates[row.quote] = row.rate
      if (row.fetchedAt > latestFetchedAt) {
        latestFetchedAt = row.fetchedAt
      }
      if (
        row.providerUpdatedAt &&
        (!latestProviderUpdatedAt || row.providerUpdatedAt > latestProviderUpdatedAt)
      ) {
        latestProviderUpdatedAt = row.providerUpdatedAt
      }
      if (row.source) {
        source = row.source
      }
    }

    if (!rates.USD) {
      rates.USD = 1
    }

    fxRateProvider.applyExternalRates({
      base: 'USD',
      rates,
      fetchedAt: latestFetchedAt || Date.now(),
      providerUpdatedAt: latestProviderUpdatedAt ?? undefined,
      ttlMs: FX_RATE_DEFAULT_TTL_MS,
      source
    })
  }
}

export const systemUpdateModule = new SystemUpdateModule()
