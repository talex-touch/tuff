import type { IntelligenceSDKPersistedConfig } from '@talex-touch/tuff-intelligence'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { OpenersConfig } from '@talex-touch/utils/common/storage/entity/openers'
import type { ShortcutSetting } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import type { StoreSourcesPayload } from '@talex-touch/utils/store'
import type { NotificationInboxEntry } from '@talex-touch/utils/transport/events'
import type { DeviceIdleSettings } from '../../service/device-idle-service'
import type { FileReportQueueItem } from '../analytics/startup-analytics'
import type { StartupHistory } from '../analytics/types'
import type { AppIndexSettings } from '../box-tool/addon/apps/app-provider'
import type { FileIndexSettings } from '../box-tool/addon/files/types'
import type { ThemeStyleConfig } from '../box-tool/core-box/window'
import type { FlowConsentSnapshot } from '../flow-bus/flow-consent'
import type { SentryConfig } from '../sentry/sentry-service'
import { StorageList } from '@talex-touch/utils'
import { appSettingOriginData } from '@talex-touch/utils/common/storage/entity/app-settings'
import { openersOriginData } from '@talex-touch/utils/common/storage/entity/openers'
import { shortcutSettingOriginData } from '@talex-touch/utils/common/storage/entity/shortcut-settings'
import { createDefaultStoreSourcesPayload } from '@talex-touch/utils/store'

export interface EverythingSettings {
  enabled?: boolean
}

export interface NotificationCenterStore {
  entries: NotificationInboxEntry[]
}

export interface TelemetryClientConfig {
  clientId: string
}

export interface AgentStoreState {
  installed: Record<string, string>
}

export interface MainStorageEntry<T> {
  key: StorageList
  defaultValue: T | (() => T)
  normalize?: (value: unknown, fallback: T) => T
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      // fall through
    }
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

function resolveDefault<T>(entry: MainStorageEntry<T>): T {
  if (typeof entry.defaultValue === 'function') {
    return (entry.defaultValue as () => T)()
  }
  return cloneValue(entry.defaultValue)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeObject<T>(value: unknown, fallback: T): T {
  return isPlainObject(value) ? (value as T) : fallback
}

function normalizeAppSetting(value: unknown, fallback: AppSetting): AppSetting {
  return normalizeObject(value, fallback)
}

function normalizeArray<T>(value: unknown, fallback: T): T {
  return Array.isArray(value) ? (value as T) : fallback
}

function normalizeNotificationCenter(
  value: unknown,
  fallback: NotificationCenterStore
): NotificationCenterStore {
  if (Array.isArray(value)) {
    return { entries: value as NotificationInboxEntry[] }
  }
  if (isPlainObject(value) && Array.isArray(value.entries)) {
    return { entries: value.entries as NotificationInboxEntry[] }
  }
  return fallback
}

function normalizeStartupHistory(value: unknown, fallback: StartupHistory): StartupHistory {
  if (!isPlainObject(value)) return fallback
  const entries = Array.isArray(value.entries) ? value.entries : fallback.entries
  const maxEntries = typeof value.maxEntries === 'number' ? value.maxEntries : fallback.maxEntries
  const lastUpdated =
    typeof value.lastUpdated === 'number' ? value.lastUpdated : fallback.lastUpdated
  return { entries, maxEntries, lastUpdated }
}

function normalizeTelemetryClient(
  value: unknown,
  fallback: TelemetryClientConfig
): TelemetryClientConfig {
  if (!isPlainObject(value)) return fallback
  const clientId = typeof value.clientId === 'string' ? value.clientId : fallback.clientId
  return { clientId }
}

function defineEntry<T>(entry: MainStorageEntry<T>): MainStorageEntry<T> {
  return entry
}

export const mainStorageRegistry = {
  [StorageList.APP_SETTING]: defineEntry<AppSetting>({
    key: StorageList.APP_SETTING,
    defaultValue: appSettingOriginData,
    normalize: normalizeAppSetting
  }),
  [StorageList.SHORTCUT_SETTING]: defineEntry<ShortcutSetting>({
    key: StorageList.SHORTCUT_SETTING,
    defaultValue: shortcutSettingOriginData,
    normalize: normalizeArray
  }),
  [StorageList.OPENERS]: defineEntry<OpenersConfig>({
    key: StorageList.OPENERS,
    defaultValue: openersOriginData,
    normalize: normalizeObject
  }),
  [StorageList.FILE_INDEX_SETTINGS]: defineEntry<Partial<FileIndexSettings>>({
    key: StorageList.FILE_INDEX_SETTINGS,
    defaultValue: {},
    normalize: normalizeObject
  }),
  [StorageList.APP_INDEX_SETTINGS]: defineEntry<Partial<AppIndexSettings>>({
    key: StorageList.APP_INDEX_SETTINGS,
    defaultValue: {},
    normalize: normalizeObject
  }),
  [StorageList.DEVICE_IDLE_SETTINGS]: defineEntry<Partial<DeviceIdleSettings>>({
    key: StorageList.DEVICE_IDLE_SETTINGS,
    defaultValue: {},
    normalize: normalizeObject
  }),
  [StorageList.IntelligenceConfig]: defineEntry<IntelligenceSDKPersistedConfig>({
    key: StorageList.IntelligenceConfig,
    defaultValue: {} as IntelligenceSDKPersistedConfig,
    normalize: normalizeObject
  }),
  [StorageList.STORE_SOURCES]: defineEntry<StoreSourcesPayload>({
    key: StorageList.STORE_SOURCES,
    defaultValue: () => createDefaultStoreSourcesPayload(),
    normalize: normalizeObject
  }),
  [StorageList.AGENT_STORE]: defineEntry<AgentStoreState>({
    key: StorageList.AGENT_STORE,
    defaultValue: { installed: {} },
    normalize: normalizeObject
  }),
  [StorageList.THEME_STYLE]: defineEntry<ThemeStyleConfig>({
    key: StorageList.THEME_STYLE,
    defaultValue: {},
    normalize: normalizeObject
  }),
  [StorageList.EVERYTHING_SETTINGS]: defineEntry<EverythingSettings>({
    key: StorageList.EVERYTHING_SETTINGS,
    defaultValue: { enabled: true },
    normalize: normalizeObject
  }),
  [StorageList.FLOW_CONSENT]: defineEntry<FlowConsentSnapshot>({
    key: StorageList.FLOW_CONSENT,
    defaultValue: {},
    normalize: normalizeObject
  }),
  [StorageList.SENTRY_CONFIG]: defineEntry<SentryConfig>({
    key: StorageList.SENTRY_CONFIG,
    defaultValue: { enabled: false, anonymous: false },
    normalize: normalizeObject
  }),
  [StorageList.NOTIFICATION_CENTER]: defineEntry<NotificationCenterStore>({
    key: StorageList.NOTIFICATION_CENTER,
    defaultValue: { entries: [] },
    normalize: normalizeNotificationCenter
  }),
  [StorageList.STARTUP_ANALYTICS]: defineEntry<StartupHistory>({
    key: StorageList.STARTUP_ANALYTICS,
    defaultValue: () => ({
      entries: [],
      maxEntries: 10,
      lastUpdated: Date.now()
    }),
    normalize: normalizeStartupHistory
  }),
  [StorageList.STARTUP_ANALYTICS_REPORT_QUEUE]: defineEntry<FileReportQueueItem[]>({
    key: StorageList.STARTUP_ANALYTICS_REPORT_QUEUE,
    defaultValue: [],
    normalize: normalizeArray
  }),
  [StorageList.TELEMETRY_CLIENT]: defineEntry<TelemetryClientConfig>({
    key: StorageList.TELEMETRY_CLIENT,
    defaultValue: { clientId: '' },
    normalize: normalizeTelemetryClient
  })
} as const

export type MainStorageKey = keyof typeof mainStorageRegistry
export type MainStorageSchema = {
  [K in MainStorageKey]: (typeof mainStorageRegistry)[K] extends MainStorageEntry<infer T>
    ? T
    : never
}

export function resolveMainStorageValue<K extends MainStorageKey>(
  key: K,
  raw: unknown
): MainStorageSchema[K] {
  const entry = mainStorageRegistry[key] as unknown as MainStorageEntry<MainStorageSchema[K]>
  const fallback = resolveDefault(entry)
  if (entry.normalize) {
    return entry.normalize(raw, fallback)
  }
  if (raw === undefined || raw === null) {
    return fallback
  }
  return raw as MainStorageSchema[K]
}
