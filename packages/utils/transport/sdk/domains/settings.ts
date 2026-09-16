import type {
  AnalyticsExportPayload,
  AnalyticsExportResult,
  AnalyticsMessage,
  AnalyticsMessageListRequest,
  AnalyticsMessageUpdateRequest,
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsWindowType,
} from "../../../analytics";
import type {
  AppIndexAddPathRequest,
  AppIndexAddPathResult,
  AppIndexDiagnoseRequest,
  AppIndexDiagnoseResult,
  AppIndexEntryMutationResult,
  AppIndexGetAliasesRequest,
  AppIndexGetAliasesResult,
  AppIndexLaunchRequest,
  AppIndexLaunchResult,
  AppIndexSetAliasesRequest,
  AppIndexGetShortcutRequest,
  AppIndexGetShortcutResult,
  AppIndexSetShortcutRequest,
  AppIndexManagedEntry,
  AppIndexReindexRequest,
  AppIndexReindexResult,
  AppIndexRemoveEntryRequest,
  AppIndexSetEntryEnabledRequest,
  AppIndexUsageRequest,
  AppIndexUsageResult,
  AppIndexSettings,
  AppIndexSummariesResult,
  AppIndexUpsertEntryRequest,
} from "../../events/types/app-index";
import type {
  AnalyticsToggleRequest,
  AutoStartUpdateRequest,
  TraySettings,
  TraySettingsUpdateRequest,
} from "../../events/types/app";
import type {
  CatalogVoiceProviderCheckResponse,
  CatalogVoiceProviderRollbackRequest,
  CatalogVoiceProviderRollbackResponse,
  CatalogVoiceProviderStatusResponse,
  CatalogVoiceProviderSyncResponse,
} from "../../events/types/catalog";
import type {
  DeviceIdleDiagnostic,
  DeviceIdleSettings,
} from "../../events/types/device-idle";
import type {
  FileIndexAddPathRequest,
  FileIndexAddPathResult,
  FileIndexBatteryStatus,
  FileIndexFailedFilesResult,
  FileIndexProgress,
  FileIndexRebuildRequest,
  FileIndexRebuildResult,
  FileIndexStats,
  FileIndexStatus,
} from "../../events/types/file-index";
import type {
  IndexedSourceDiagnosticsRequest,
  IndexedSourceDiagnosticsResponse,
  IndexedSourceReconcileRuntimeRequest,
  IndexedSourceReconcileRuntimeResult,
  IndexedSourceResetRuntimeRequest,
  IndexedSourceResetRuntimeResult,
  IndexedSourceScanRuntimeRequest,
  IndexedSourceScanRuntimeResult,
  SearchProviderConfigResponse,
  SearchProviderConfigUpdateRequest,
  SearchProviderConfigUpdateResult,
} from "../../events/types/indexed-source";
import type {
  ITuffTransport,
  StreamController,
  StreamOptions,
} from "../../types";
import { AppEvents, CatalogEvents } from "../../events";
import {
  projectFileIndexAddPathResult,
  projectFileIndexBatteryStatus,
  projectFileIndexFailedFiles,
  projectFileIndexRebuildResult,
  projectFileIndexStats,
  projectFileIndexStatus,
} from "./file-index-projection";

export interface SettingsSdk {
  system: {
    getAutoStart: () => Promise<boolean>;
    updateAutoStart: (enabled: AutoStartUpdateRequest) => Promise<boolean>;
    getTraySettings: () => Promise<TraySettings>;
    updateTraySettings: (
      payload: TraySettingsUpdateRequest,
    ) => Promise<TraySettings>;
  };
  fileIndex: {
    getStatus: () => Promise<FileIndexStatus>;
    getStats: () => Promise<FileIndexStats>;
    getBatteryLevel: () => Promise<FileIndexBatteryStatus | null>;
    rebuild: (
      request?: FileIndexRebuildRequest,
    ) => Promise<FileIndexRebuildResult>;
    streamProgress: (
      options: StreamOptions<FileIndexProgress>,
    ) => Promise<StreamController>;
    getFailedFiles: () => Promise<FileIndexFailedFilesResult>;
    addPath: (
      payload: FileIndexAddPathRequest,
    ) => Promise<FileIndexAddPathResult>;
  };
  indexedSource: {
    getDiagnostics: (
      request?: IndexedSourceDiagnosticsRequest,
    ) => Promise<IndexedSourceDiagnosticsResponse>;
    reset: (
      request: IndexedSourceResetRuntimeRequest,
    ) => Promise<IndexedSourceResetRuntimeResult>;
    reconcile: (
      request: IndexedSourceReconcileRuntimeRequest,
    ) => Promise<IndexedSourceReconcileRuntimeResult>;
    scan: (
      request: IndexedSourceScanRuntimeRequest,
    ) => Promise<IndexedSourceScanRuntimeResult>;
    getProviderConfig: () => Promise<SearchProviderConfigResponse>;
    updateProviderConfig: (
      request: SearchProviderConfigUpdateRequest,
    ) => Promise<SearchProviderConfigUpdateResult>;
  };
  deviceIdle: {
    getSettings: () => Promise<DeviceIdleSettings>;
    updateSettings: (
      settings: Partial<DeviceIdleSettings>,
    ) => Promise<DeviceIdleSettings>;
    getDiagnostic: () => Promise<DeviceIdleDiagnostic>;
  };
  appIndex: {
    getSettings: () => Promise<AppIndexSettings>;
    updateSettings: (
      settings: Partial<AppIndexSettings>,
    ) => Promise<AppIndexSettings>;
    addPath: (
      payload: AppIndexAddPathRequest,
    ) => Promise<AppIndexAddPathResult>;
    listEntries: () => Promise<AppIndexManagedEntry[]>;
    listSummaries: () => Promise<AppIndexSummariesResult>;
    upsertEntry: (
      payload: AppIndexUpsertEntryRequest,
    ) => Promise<AppIndexEntryMutationResult>;
    removeEntry: (
      payload: AppIndexRemoveEntryRequest,
    ) => Promise<AppIndexEntryMutationResult>;
    setEntryEnabled: (
      payload: AppIndexSetEntryEnabledRequest,
    ) => Promise<AppIndexEntryMutationResult>;
    diagnose: (
      payload: AppIndexDiagnoseRequest,
    ) => Promise<AppIndexDiagnoseResult>;
    reindex: (
      payload: AppIndexReindexRequest,
    ) => Promise<AppIndexReindexResult>;
    getAliases: (
      payload: AppIndexGetAliasesRequest,
    ) => Promise<AppIndexGetAliasesResult>;
    getShortcut: (
      payload: AppIndexGetShortcutRequest,
    ) => Promise<AppIndexGetShortcutResult>;
    setShortcut: (
      payload: AppIndexSetShortcutRequest,
    ) => Promise<AppIndexEntryMutationResult>;
    setAliases: (
      payload: AppIndexSetAliasesRequest,
    ) => Promise<AppIndexEntryMutationResult>;
    launch: (payload: AppIndexLaunchRequest) => Promise<AppIndexLaunchResult>;
    usage: (payload: AppIndexUsageRequest) => Promise<AppIndexUsageResult>;
  };
  analytics: {
    getSnapshot: (
      windowType: AnalyticsWindowType,
    ) => Promise<AnalyticsSnapshot>;
    getRange: (payload: AnalyticsRangeRequest) => Promise<AnalyticsSnapshot[]>;
    export: (payload: AnalyticsExportPayload) => Promise<AnalyticsExportResult>;
    toggleReporting: (
      payload: AnalyticsToggleRequest,
    ) => Promise<{ enabled: boolean }>;
    messages: {
      list: (
        payload?: AnalyticsMessageListRequest,
      ) => Promise<AnalyticsMessage[]>;
      mark: (
        payload: AnalyticsMessageUpdateRequest,
      ) => Promise<AnalyticsMessage | null>;
    };
  };
  catalog: {
    getStatus: () => Promise<CatalogVoiceProviderStatusResponse>;
    checkUpdates: () => Promise<CatalogVoiceProviderCheckResponse>;
    sync: () => Promise<CatalogVoiceProviderSyncResponse>;
    rollback: (
      request?: CatalogVoiceProviderRollbackRequest,
    ) => Promise<CatalogVoiceProviderRollbackResponse>;
  };
}

export function createSettingsSdk(transport: ITuffTransport): SettingsSdk {
  return {
    system: {
      getAutoStart: () => transport.send(AppEvents.system.autoStartGet),
      updateAutoStart: (enabled) =>
        transport.send(AppEvents.system.autoStartUpdate, enabled),
      getTraySettings: () => transport.send(AppEvents.system.traySettingsGet),
      updateTraySettings: (payload) =>
        transport.send(AppEvents.system.traySettingsUpdate, payload),
    },
    fileIndex: {
      getStatus: async () =>
        projectFileIndexStatus(await transport.send(AppEvents.fileIndex.status)),
      getStats: async () =>
        projectFileIndexStats(await transport.send(AppEvents.fileIndex.stats)),
      getBatteryLevel: async () =>
        projectFileIndexBatteryStatus(
          await transport.send(AppEvents.fileIndex.batteryLevel),
        ),
      rebuild: async (request) =>
        projectFileIndexRebuildResult(
          await transport.send(AppEvents.fileIndex.rebuild, request),
        ),
      streamProgress: (options) =>
        transport.stream(AppEvents.fileIndex.progress, undefined, options),
      getFailedFiles: async () =>
        projectFileIndexFailedFiles(
          await transport.send(AppEvents.fileIndex.failedFiles),
        ),
      addPath: async (payload) =>
        projectFileIndexAddPathResult(
          await transport.send(AppEvents.fileIndex.addPath, payload),
        ),
    },
    indexedSource: {
      getDiagnostics: (request) =>
        transport.send(AppEvents.indexedSource.diagnostics, request),
      reset: (request) =>
        transport.send(AppEvents.indexedSource.reset, request),
      reconcile: (request) =>
        transport.send(AppEvents.indexedSource.reconcile, request),
      scan: (request) => transport.send(AppEvents.indexedSource.scan, request),
      getProviderConfig: () =>
        transport.send(AppEvents.indexedSource.providerConfigGet),
      updateProviderConfig: (request) =>
        transport.send(AppEvents.indexedSource.providerConfigUpdate, request),
    },
    deviceIdle: {
      getSettings: () => transport.send(AppEvents.deviceIdle.getSettings),
      updateSettings: (settings) =>
        transport.send(AppEvents.deviceIdle.updateSettings, settings),
      getDiagnostic: () => transport.send(AppEvents.deviceIdle.getDiagnostic),
    },
    appIndex: {
      getSettings: () => transport.send(AppEvents.appIndex.getSettings),
      updateSettings: (settings) =>
        transport.send(AppEvents.appIndex.updateSettings, settings),
      addPath: (payload) => transport.send(AppEvents.appIndex.addPath, payload),
      listEntries: () => transport.send(AppEvents.appIndex.listEntries),
      listSummaries: () => transport.send(AppEvents.appIndex.listSummaries),
      upsertEntry: (payload) =>
        transport.send(AppEvents.appIndex.upsertEntry, payload),
      removeEntry: (payload) =>
        transport.send(AppEvents.appIndex.removeEntry, payload),
      setEntryEnabled: (payload) =>
        transport.send(AppEvents.appIndex.setEntryEnabled, payload),
      diagnose: (payload) =>
        transport.send(AppEvents.appIndex.diagnose, payload),
      reindex: (payload) => transport.send(AppEvents.appIndex.reindex, payload),
      launch: (payload) => transport.send(AppEvents.appIndex.launch, payload),
      usage: (payload) => transport.send(AppEvents.appIndex.usage, payload),
      getAliases: (payload) =>
        transport.send(AppEvents.appIndex.getAliases, payload),
      setAliases: (payload) =>
        transport.send(AppEvents.appIndex.setAliases, payload),
      getShortcut: (payload) =>
        transport.send(AppEvents.appIndex.getShortcut, payload),
      setShortcut: (payload) =>
        transport.send(AppEvents.appIndex.setShortcut, payload),
    },
    analytics: {
      getSnapshot: (windowType) =>
        transport.send(AppEvents.analytics.getSnapshot, { windowType }),
      getRange: (payload) =>
        transport.send(AppEvents.analytics.getRange, payload),
      export: (payload) => transport.send(AppEvents.analytics.export, payload),
      toggleReporting: (payload) =>
        transport.send(AppEvents.analytics.toggleReporting, payload),
      messages: {
        list: (payload) =>
          transport.send(AppEvents.analytics.messages.list, payload ?? {}),
        mark: (payload) =>
          transport.send(AppEvents.analytics.messages.mark, payload),
      },
    },
    catalog: {
      getStatus: () => transport.send(CatalogEvents.voiceProvider.getStatus),
      checkUpdates: () => transport.send(CatalogEvents.voiceProvider.checkUpdates),
      sync: () => transport.send(CatalogEvents.voiceProvider.sync),
      rollback: (request) =>
        transport.send(CatalogEvents.voiceProvider.rollback, request ?? {}),
    },
  };
}
