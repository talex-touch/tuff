import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import {
  clipboardLegacyApplyToActiveAppEvent,
  clipboardLegacyClearEvent,
  clipboardLegacyClearHistoryEvent,
  clipboardLegacyCopyAndPasteEvent,
  clipboardLegacyDeleteItemEvent,
  clipboardLegacyGetHistoryEvent,
  clipboardLegacyGetImageUrlEvent,
  clipboardLegacyGetLatestEvent,
  clipboardLegacyReadEvent,
  clipboardLegacyReadFilesEvent,
  clipboardLegacyReadImageEvent,
  clipboardLegacySetFavoriteEvent,
  clipboardLegacyWriteEvent,
  clipboardLegacyWriteTextEvent
} from './clipboard/clipboard-legacy-bridge'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    isPackaged: false,
    on: vi.fn(),
    once: vi.fn()
  },
  clipboard: {
    readText: vi.fn(() => ''),
    availableFormats: vi.fn(() => []),
    read: vi.fn(() => Buffer.from('')),
    readBuffer: vi.fn(() => Buffer.from('')),
    readImage: vi.fn(() => ({
      isEmpty: () => true,
      getSize: () => ({ width: 0, height: 0 }),
      resize: () => ({ toDataURL: () => '' })
    })),
    write: vi.fn(),
    writeBuffer: vi.fn(),
    writeImage: vi.fn(),
    clear: vi.fn()
  },
  BrowserWindow: class BrowserWindow {},
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn()
  },
  MessageChannelMain: class MessageChannelMain {
    port1 = {
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn(),
      close: vi.fn()
    }

    port2 = {
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn(),
      close: vi.fn()
    }
  },
  nativeImage: {
    createEmpty: vi.fn(() => ({ isEmpty: () => true })),
    createFromDataURL: vi.fn(() => ({ isEmpty: () => true })),
    createFromPath: vi.fn(() => ({ isEmpty: () => true }))
  },
  powerMonitor: {
    isOnBatteryPower: vi.fn(() => false)
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1280, height: 720 }
    }))
  },
  shell: {
    openExternal: vi.fn()
  }
}))

vi.mock('../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    child: vi.fn(),
    time: vi.fn(() => ({
      end: vi.fn(),
      split: vi.fn()
    }))
  }))
}))

vi.mock('../utils/perf-context', () => ({
  enterPerfContext: vi.fn(() => undefined)
}))

vi.mock('../utils/perf-monitor', () => ({
  perfMonitor: {
    getRecentEventLoopLagSnapshot: vi.fn(() => null),
    recordMainSlowOperation: vi.fn(),
    trackMainPhase: vi.fn(),
    trackRendererBridge: vi.fn()
  }
}))

vi.mock('@talex-touch/utils/common/utils/polling', () => ({
  PollingService: {
    getInstance: vi.fn(() => ({
      register: vi.fn(),
      unregister: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    }))
  }
}))

vi.mock('../db/db-write-scheduler', () => ({
  dbWriteScheduler: {
    getStats: vi.fn(() => ({
      queued: 0,
      currentTaskLabel: null
    }))
  }
}))

vi.mock('../db/startup-degrade', () => ({
  isStartupDegradeActive: vi.fn(() => false)
}))

vi.mock('./database', () => ({
  databaseModule: {
    getDatabase: vi.fn(() => null)
  }
}))

vi.mock('./ocr/ocr-service', () => ({
  ocrService: {
    enqueueClipboardMeta: vi.fn()
  }
}))

vi.mock('./permission', () => ({
  getPermissionModule: vi.fn(() => null)
}))

vi.mock('./plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: null
  }
}))

vi.mock('./storage', () => ({
  getMainConfig: vi.fn(() => ({})),
  isMainStorageReady: vi.fn(() => true),
  subscribeMainConfig: vi.fn(() => () => {})
}))

vi.mock('../service/temp-file.service', () => ({
  tempFileService: {
    allocateFile: vi.fn(),
    releaseFile: vi.fn(),
    cleanupNamespace: vi.fn()
  }
}))

vi.mock('./system/active-app', () => ({
  activeAppService: {
    getActiveApp: vi.fn(async () => null)
  }
}))

vi.mock('./box-tool/core-box/manager', () => ({
  coreBoxManager: {
    isVisible: vi.fn(() => false)
  }
}))

vi.mock('./box-tool/core-box/window', () => ({
  windowManager: {
    getWindows: vi.fn(() => [])
  }
}))

vi.mock('../core/eventbus/touch-event', () => ({
  TalexEvents: {},
  touchEventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  }
}))

import { ClipboardModule } from './clipboard'

type ClipboardModuleTestHandle = {
  transport: {
    on: ReturnType<typeof vi.fn>
    onStream: ReturnType<typeof vi.fn>
  } | null
  registerTypedClipboardQueryHandlers: () => void
  registerTypedClipboardMutationHandlers: (
    writePayload: (payload: unknown) => Promise<void>
  ) => void
  registerTypedClipboardReadHandlers: () => void
  registerTypedClipboardStreamHandlers: () => void
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('ClipboardModule transport registration', () => {
  it('只注册 typed clipboard transport handlers，不再注册 legacy raw bridge', () => {
    const on = vi.fn(() => () => {})
    const onStream = vi.fn(() => () => {})
    const module = new ClipboardModule() as unknown as ClipboardModuleTestHandle

    module.transport = { on, onStream }
    module.registerTypedClipboardQueryHandlers()
    module.registerTypedClipboardMutationHandlers(async () => {})
    module.registerTypedClipboardReadHandlers()
    module.registerTypedClipboardStreamHandlers()

    const registeredEvents = [...on.mock.calls, ...onStream.mock.calls].map((call) =>
      String((call as unknown[])[0])
    )

    expect(registeredEvents).toEqual([
      ClipboardEvents.getLatest.toString(),
      ClipboardEvents.getHistory.toString(),
      ClipboardEvents.getImageUrl.toString(),
      ClipboardEvents.queryMeta.toString(),
      ClipboardEvents.apply.toString(),
      ClipboardEvents.delete.toString(),
      ClipboardEvents.setFavorite.toString(),
      ClipboardEvents.clearHistory.toString(),
      ClipboardEvents.write.toString(),
      ClipboardEvents.clear.toString(),
      ClipboardEvents.copyAndPaste.toString(),
      ClipboardEvents.read.toString(),
      ClipboardEvents.readImage.toString(),
      ClipboardEvents.readFiles.toString(),
      ClipboardEvents.change.toString()
    ])

    const legacyEvents = [
      clipboardLegacyGetLatestEvent,
      clipboardLegacyGetHistoryEvent,
      clipboardLegacySetFavoriteEvent,
      clipboardLegacyDeleteItemEvent,
      clipboardLegacyClearHistoryEvent,
      clipboardLegacyApplyToActiveAppEvent,
      clipboardLegacyCopyAndPasteEvent,
      clipboardLegacyWriteTextEvent,
      clipboardLegacyWriteEvent,
      clipboardLegacyReadEvent,
      clipboardLegacyReadImageEvent,
      clipboardLegacyReadFilesEvent,
      clipboardLegacyClearEvent,
      clipboardLegacyGetImageUrlEvent
    ].map((event) => event.toString())

    for (const legacyEvent of legacyEvents) {
      expect(registeredEvents).not.toContain(legacyEvent)
    }
  })
})
