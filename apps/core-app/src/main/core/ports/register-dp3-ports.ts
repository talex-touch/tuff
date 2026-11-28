import { PI_RUNTIME_SERVICE_NAME } from '../../modules/ai/pi-agent-runtime-protocol'
import {
  findCommandInSearchRoots,
  withExecutableDirOnPath
} from '../../modules/ai/providers/cli/cli-executable'
import { resolveAppSemanticAliases } from '../../modules/box-tool/addon/apps/app-semantic-catalog'
import { everythingProvider } from '../../modules/box-tool/addon/files/everything-provider'
import { fileProvider } from '../../modules/box-tool/addon/files/file-provider'
import { getVideoThumbnailSupport } from '../../modules/box-tool/addon/files/thumbnail-service'
import { ThumbnailWorkerClient } from '../../modules/box-tool/addon/files/workers/thumbnail-worker-client'
import { coreBoxManager } from '../../modules/box-tool/core-box/manager'
import { getCoreBoxWindow, windowManager } from '../../modules/box-tool/core-box/window'
import { resolvePreviousAppContext } from '../../modules/box-tool/search-engine/app-launch-recorder'
import {
  recordAcceptedExecute,
  resolveExecuteEventId
} from '../../modules/box-tool/search-engine/execute-recorder'
import { registerClipboardPorts } from '../../modules/clipboard/clipboard-ports'
import { flowBus } from '../../modules/flow-bus/flow-bus'
import { flowTargetRegistry } from '../../modules/flow-bus/target-registry'
import { registerNativeCapabilitiesPorts } from '../../modules/native-capabilities/native-capabilities-ports'
import { OCR_PROCESS_SERVICE_NAME } from '../../modules/ocr/ocr-process-client'
import { ocrService } from '../../modules/ocr/ocr-service'
import { registerPlatformPorts } from '../../modules/platform/platform-ports'
import { PLUGIN_RUNTIME_SERVICE_NAME } from '../../modules/plugin/host/plugin-runtime-electron-process'
import { pluginModule } from '../../modules/plugin/plugin-module'
import { resolvePluginNameByWebContents } from '../../modules/plugin/runtime/plugin-view-registry'
import { registerQuickOpsFlowBusPort } from '../../modules/quick-ops/quick-ops-ports'
import { registerSystemPorts } from '../../modules/system/system-ports'
import { registerTerminalPorts } from '../../modules/terminal/terminal-ports'

let dp3PortDisposers: Array<() => void> | null = null

/**
 * Composition-root registrar that binds DP4..DP6 concrete runtime services into
 * DP3 (Native OS Utilities) typed ports. Idempotent across repeated calls.
 */
export function registerDp3Ports(): void {
  if (dp3PortDisposers) {
    return
  }

  let thumbnailWorker: ThumbnailWorkerClient | null = null
  const getThumbnailWorker = (): ThumbnailWorkerClient => {
    if (!thumbnailWorker) {
      thumbnailWorker = new ThumbnailWorkerClient()
    }
    return thumbnailWorker
  }

  const disposers: Array<() => void> = [
    registerClipboardPorts({
      coreBox: {
        hideCoreBox: () => {
          coreBoxManager.trigger(false)
        },
        isCoreBoxWindowVisible: () => {
          const coreBoxWindow = windowManager.current?.window
          return Boolean(coreBoxWindow && !coreBoxWindow.isDestroyed() && coreBoxWindow.isVisible())
        },
        getAttachedPlugin: () => windowManager.getAttachedPlugin(),
        shouldForwardClipboardChange: (itemType) =>
          windowManager.shouldForwardClipboardChange(itemType)
      },
      search: {
        resolveAppSemanticAliases: (app) =>
          resolveAppSemanticAliases({
            name: app.name ?? undefined,
            displayName: app.displayName ?? undefined,
            bundleId: app.bundleId ?? undefined,
            path: app.path ?? undefined
          }),
        resolvePreviousAppContext: () => resolvePreviousAppContext(),
        resolveExecuteEventId: (eventId) => resolveExecuteEventId(eventId),
        recordAcceptedExecute: (record) => recordAcceptedExecute(record)
      },
      ocr: {
        setTransportChannel: (channel) => {
          ocrService.setTransportChannel(channel)
        },
        start: () => ocrService.start(),
        registerClipboardMetaListener: (listener) => {
          ocrService.registerClipboardMetaListener(listener)
        },
        enqueueFromClipboard: (payload) => ocrService.enqueueFromClipboard(payload)
      },
      plugin: {
        getPluginSdkApi: (pluginId) => {
          const plugin = pluginModule.pluginManager?.getPluginByName(pluginId) as
            | { sdkapi?: number }
            | undefined
          return typeof plugin?.sdkapi === 'number' ? plugin.sdkapi : undefined
        }
      }
    }),

    registerNativeCapabilitiesPorts({
      fileIndex: {
        getIndexingStatus: () => fileProvider.getIndexingStatus(),
        getIndexStats: () => fileProvider.getIndexStats(),
        onSearch: (query, signal) => fileProvider.onSearch(query, signal),
        rebuildIndex: (request) => fileProvider.rebuildIndex(request),
        addWatchPath: (rawPath) => fileProvider.addWatchPath(rawPath),
        registerProgressStream: (context) => {
          fileProvider.registerProgressStream(context)
        }
      },
      everything: {
        getStatusSnapshot: () => everythingProvider.getStatusSnapshot(),
        isSearchReady: () => everythingProvider.isSearchReady(),
        onSearch: (query, signal) => everythingProvider.onSearch(query, signal)
      },
      thumbnail: {
        generate: (filePath, options) => getThumbnailWorker().generate(filePath, options),
        getVideoThumbnailSupport: () => getVideoThumbnailSupport()
      }
    }),

    registerPlatformPorts({
      everything: {
        getStatusSnapshot: () => everythingProvider.getStatusSnapshot()
      }
    }),

    registerQuickOpsFlowBusPort({
      registerTarget: (pluginId, target, options) =>
        flowTargetRegistry.registerTarget(pluginId, target, options),
      unregisterTarget: (fullTargetId) => flowTargetRegistry.unregisterTarget(fullTargetId),
      registerDeliveryHandler: (pluginId, handler) =>
        flowBus.registerDeliveryHandler(pluginId, handler),
      acknowledge: (sessionId, ackPayload) => flowBus.acknowledge(sessionId, ackPayload)
    }),

    registerSystemPorts({
      performance: {
        resolveUtilityProcessRole: (metric) => {
          if (metric.name === PLUGIN_RUNTIME_SERVICE_NAME) return 'plugin-runtime'
          if (metric.name === PI_RUNTIME_SERVICE_NAME) return 'pi-agent-runtime'
          if (metric.name === OCR_PROCESS_SERVICE_NAME) return 'ocr-runtime'
          return null
        },
        getCoreBoxWindow: () => getCoreBoxWindow()?.window ?? null,
        resolvePluginNameByWebContents: (webContentsId) =>
          resolvePluginNameByWebContents(webContentsId) ?? null
      },
      dashboard: {
        getIndexingProgress: () => fileProvider.getIndexingProgress(),
        getWatchedPaths: () => fileProvider.getWatchedPaths(),
        getWorkerStatusSnapshot: () => fileProvider.getWorkerStatusSnapshot(),
        getOcrDashboardSnapshot: (limit) => ocrService.getDashboardSnapshot(limit)
      }
    }),

    registerTerminalPorts({
      executable: {
        findCommandInSearchRoots: (command) => findCommandInSearchRoots(command),
        withExecutableDirOnPath: (env, executable) => withExecutableDirOnPath(env, executable)
      }
    })
  ]

  dp3PortDisposers = disposers
}

export function resetDp3PortsForTests(): void {
  if (!dp3PortDisposers) {
    return
  }
  const disposers = dp3PortDisposers
  dp3PortDisposers = null
  for (const dispose of disposers.reverse()) {
    dispose()
  }
}
