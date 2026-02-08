import type {
  AnalyticsExportPayload,
  AnalyticsExportResult,
  AnalyticsMessage,
  AnalyticsMessageListRequest,
  AnalyticsMessageUpdateRequest,
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsWindowType,
} from '../../../analytics'
import type { AppIndexSettings } from '../../events/types/app-index'
import type { AnalyticsToggleRequest, CurrentMetrics, PerformanceHistoryEntry, PerformanceSummary } from '../../events/types/app'
import type { DeviceIdleSettings } from '../../events/types/device-idle'
import type {
  FileIndexBatteryStatus,
  FileIndexProgress,
  FileIndexRebuildRequest,
  FileIndexRebuildResult,
  FileIndexStats,
  FileIndexStatus,
} from '../../events/types/file-index'
import type { ITuffTransport, StreamController, StreamOptions } from '../../types'
import { AppEvents } from '../../events'

export interface SettingsSdk {
  fileIndex: {
    getStatus: () => Promise<FileIndexStatus>
    getStats: () => Promise<FileIndexStats>
    getBatteryLevel: () => Promise<FileIndexBatteryStatus | null>
    rebuild: (request?: FileIndexRebuildRequest) => Promise<FileIndexRebuildResult>
    streamProgress: (
      options: StreamOptions<FileIndexProgress>,
    ) => Promise<StreamController>
  }
  deviceIdle: {
    getSettings: () => Promise<DeviceIdleSettings>
    updateSettings: (settings: Partial<DeviceIdleSettings>) => Promise<DeviceIdleSettings>
  }
  appIndex: {
    getSettings: () => Promise<AppIndexSettings>
    updateSettings: (settings: Partial<AppIndexSettings>) => Promise<AppIndexSettings>
  }
  analytics: {
    getSnapshot: (windowType: AnalyticsWindowType) => Promise<AnalyticsSnapshot>
    getRange: (payload: AnalyticsRangeRequest) => Promise<AnalyticsSnapshot[]>
    export: (payload: AnalyticsExportPayload) => Promise<AnalyticsExportResult>
    toggleReporting: (payload: AnalyticsToggleRequest) => Promise<{ enabled: boolean }>
    getCurrent: () => Promise<CurrentMetrics>
    getHistory: () => Promise<PerformanceHistoryEntry[]>
    getSummary: () => Promise<PerformanceSummary>
    messages: {
      list: (payload?: AnalyticsMessageListRequest) => Promise<AnalyticsMessage[]>
      mark: (payload: AnalyticsMessageUpdateRequest) => Promise<AnalyticsMessage | null>
    }
  }
}

export function createSettingsSdk(transport: ITuffTransport): SettingsSdk {
  return {
    fileIndex: {
      getStatus: () => transport.send(AppEvents.fileIndex.status),
      getStats: () => transport.send(AppEvents.fileIndex.stats),
      getBatteryLevel: () => transport.send(AppEvents.fileIndex.batteryLevel),
      rebuild: request => transport.send(AppEvents.fileIndex.rebuild, request),
      streamProgress: options => transport.stream(AppEvents.fileIndex.progress, undefined, options),
    },
    deviceIdle: {
      getSettings: () => transport.send(AppEvents.deviceIdle.getSettings),
      updateSettings: settings => transport.send(AppEvents.deviceIdle.updateSettings, settings),
    },
    appIndex: {
      getSettings: () => transport.send(AppEvents.appIndex.getSettings),
      updateSettings: settings => transport.send(AppEvents.appIndex.updateSettings, settings),
    },
    analytics: {
      getSnapshot: windowType => transport.send(AppEvents.analytics.getSnapshot, { windowType }),
      getRange: payload => transport.send(AppEvents.analytics.getRange, payload),
      export: payload => transport.send(AppEvents.analytics.export, payload),
      toggleReporting: payload => transport.send(AppEvents.analytics.toggleReporting, payload),
      getCurrent: () => transport.send(AppEvents.analytics.getCurrent),
      getHistory: () => transport.send(AppEvents.analytics.getHistory),
      getSummary: () => transport.send(AppEvents.analytics.getSummary),
      messages: {
        list: payload => transport.send(AppEvents.analytics.messages.list, payload ?? {}),
        mark: payload => transport.send(AppEvents.analytics.messages.mark, payload),
      },
    },
  }
}
