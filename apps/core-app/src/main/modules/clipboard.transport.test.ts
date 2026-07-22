import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'

const RETIRED_CLIPBOARD_EVENT_NAMES = [
  'clipboard:get-latest',
  'clipboard:get-history',
  'clipboard:set-favorite',
  'clipboard:delete-item',
  'clipboard:clear-history',
  'clipboard:apply-to-active-app',
  'clipboard:copy-and-paste',
  'clipboard:write-text',
  'clipboard:write',
  'clipboard:read',
  'clipboard:read-image',
  'clipboard:read-files',
  'clipboard:clear',
  'clipboard:get-image-url',
  'clipboard:query'
] as const

const notificationModuleMock = vi.hoisted(() => ({
  showInternalSystemNotification: vi.fn()
}))

const permissionModuleMock = vi.hoisted(() => ({
  getPermissionModule: vi.fn(() => null as null | { enforcePermission: ReturnType<typeof vi.fn> })
}))

const clipboardRuntimeMocks = vi.hoisted(() => ({
  transportOn: vi.fn(),
  transportOnStream: vi.fn(),
  pollingService: {
    isRegistered: vi.fn(() => false),
    register: vi.fn(),
    unregister: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  },
  appTaskGate: {
    waitForIdle: vi.fn(async () => undefined),
    isActive: vi.fn(() => false)
  },
  coreBoxWindowVisible: false
}))

async function flushMicrotasks(count = 1): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve()
  }
}

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => ({
    on: clipboardRuntimeMocks.transportOn,
    onStream: clipboardRuntimeMocks.transportOnStream
  }))
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    getVersion: vi.fn(() => '0.0.0-test'),
    isPackaged: false,
    commandLine: {
      appendSwitch: vi.fn()
    },
    addListener: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    quit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    setPath: vi.fn()
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
  crashReporter: {
    start: vi.fn()
  },
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

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((filePath: string) => filePath.startsWith('/tmp/clipboard/images/'))
    },
    existsSync: vi.fn((filePath: string) => filePath.startsWith('/tmp/clipboard/images/'))
  }
})

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
  })),
  mainLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  appLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  channelLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  moduleLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  pluginLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  windowLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  dbLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  eventLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  shortcutLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  storageLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  notificationLog: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
  },
  LogManager: {
    getInstance: vi.fn(() => ({
      getLogger: vi.fn(() => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        success: vi.fn()
      }))
    }))
  }
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
    getInstance: vi.fn(() => clipboardRuntimeMocks.pollingService)
  }
}))

vi.mock('../service/app-task-gate', () => ({
  appTaskGate: clipboardRuntimeMocks.appTaskGate
}))

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  close: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  addBreadcrumb: vi.fn(),
  startSpan: vi.fn((_options, callback) => callback?.()),
  getCurrentScope: vi.fn(() => ({
    setUser: vi.fn(),
    setTag: vi.fn(),
    setContext: vi.fn()
  }))
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
  getPermissionModule: permissionModuleMock.getPermissionModule
}))

vi.mock('./notification', () => ({
  notificationModule: notificationModuleMock
}))

vi.mock('./platform/capability-adapter', () => ({
  getAutoPasteCapabilityPatch: vi.fn(async () => ({
    supportLevel: 'supported'
  }))
}))

vi.mock('./plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: null
  }
}))

vi.mock('./storage', () => ({
  getMainConfig: vi.fn(() => ({})),
  isMainStorageReady: vi.fn(() => true),
  saveMainConfig: vi.fn(),
  subscribeMainConfig: vi.fn(() => () => {})
}))

vi.mock('../service/temp-file.service', () => ({
  tempFileService: {
    allocateFile: vi.fn(),
    releaseFile: vi.fn(),
    cleanupNamespace: vi.fn(),
    isWithinBaseDir: vi.fn(() => true)
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
    get current() {
      return {
        window: {
          isDestroyed: vi.fn(() => false),
          isVisible: vi.fn(() => clipboardRuntimeMocks.coreBoxWindowVisible)
        }
      }
    },
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
import { tempFileService } from '../service/temp-file.service'
import { ClipboardAutopasteAutomation } from './clipboard/clipboard-autopaste-automation'

type ClipboardModuleTestHandle = {
  transport: {
    on: ReturnType<typeof vi.fn>
    onStream: ReturnType<typeof vi.fn>
  } | null
  transportChannel: unknown
  registerTransportHandlers: () => void
}

afterEach(() => {
  vi.clearAllMocks()
  permissionModuleMock.getPermissionModule.mockReturnValue(null)
  clipboardRuntimeMocks.transportOn.mockImplementation(() => () => {})
  clipboardRuntimeMocks.transportOnStream.mockImplementation(() => () => {})
  clipboardRuntimeMocks.pollingService.isRegistered.mockReturnValue(false)
  clipboardRuntimeMocks.appTaskGate.waitForIdle.mockResolvedValue(undefined)
  clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(false)
  clipboardRuntimeMocks.coreBoxWindowVisible = false
})

describe('ClipboardModule transport registration', () => {
  it('只注册 typed clipboard transport handlers，不再注册 retired raw bridge', () => {
    const on = clipboardRuntimeMocks.transportOn
    const onStream = clipboardRuntimeMocks.transportOnStream
    const module = new ClipboardModule() as unknown as ClipboardModuleTestHandle

    module.transportChannel = {
      keyManager: {}
    }
    module.registerTransportHandlers()

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
      ClipboardEvents.getStatus.toString(),
      ClipboardEvents.change.toString()
    ])
    expect(ClipboardEvents.queryMeta.toString()).toBe('clipboard:history:query-meta')

    for (const retiredEvent of RETIRED_CLIPBOARD_EVENT_NAMES) {
      expect(registeredEvents).not.toContain(retiredEvent)
    }
  })

  it('blocks plugin clipboard write transport before mutating clipboard when permission is denied', async () => {
    const permissionError = new Error('clipboard.write denied') as Error & {
      code?: string
      permissionId?: string
      pluginId?: string
      showRequest?: boolean
    }
    permissionError.code = 'PERMISSION_DENIED'
    permissionError.permissionId = 'clipboard.write'
    permissionError.pluginId = 'touch-translation'
    permissionError.showRequest = true

    const enforcePermission = vi.fn(() => {
      throw permissionError
    })
    permissionModuleMock.getPermissionModule.mockReturnValue({ enforcePermission })

    const module = new ClipboardModule() as unknown as ClipboardModuleTestHandle
    module.transportChannel = {
      keyManager: {}
    }
    module.registerTransportHandlers()

    const writeHandlerCall = clipboardRuntimeMocks.transportOn.mock.calls.find(
      ([eventName]) => String(eventName) === ClipboardEvents.write.toString()
    )
    expect(writeHandlerCall).toBeTruthy()

    const writeHandler = writeHandlerCall?.[1] as (
      request: { text: string; _sdkapi: number },
      context: { plugin?: { name?: string } }
    ) => Promise<void>

    await expect(
      writeHandler(
        { text: 'translated text', _sdkapi: 260428 },
        { plugin: { name: 'touch-translation' } }
      )
    ).rejects.toMatchObject({
      code: 'CLIPBOARD_CAPABILITY_UNAVAILABLE',
      permissionId: 'clipboard:write',
      pluginId: 'touch-translation',
      showRequest: true
    })

    expect(enforcePermission).toHaveBeenCalledWith('touch-translation', 'clipboard:write', 260428)
    const { clipboard } = await import('electron')
    expect(clipboard.write).not.toHaveBeenCalled()
  })
})

describe('ClipboardModule startup tasks', () => {
  it('starts native clipboard watcher after idle while polling is registered immediately', async () => {
    const nativeStart = vi.fn(async () => undefined)
    const module = new ClipboardModule() as unknown as {
      clipboardHelper: { bootstrap: ReturnType<typeof vi.fn> } | null
      clipboardService: { start: typeof nativeStart }
      startClipboardMonitoring: () => void
    }

    module.clipboardHelper = { bootstrap: vi.fn() }
    module.clipboardService.start = nativeStart

    module.startClipboardMonitoring()

    expect(clipboardRuntimeMocks.pollingService.register).toHaveBeenCalledWith(
      'clipboard.monitor',
      expect.any(Function),
      expect.any(Object)
    )
    expect(nativeStart).not.toHaveBeenCalled()

    await flushMicrotasks(2)

    expect(clipboardRuntimeMocks.appTaskGate.waitForIdle).toHaveBeenCalled()
    expect(nativeStart).toHaveBeenCalledTimes(1)
  })

  it('runs CoreBox baseline capture after idle when the CoreBox window is already visible', async () => {
    const nativeStart = vi.fn(async () => undefined)
    const runClipboardMonitor = vi.fn(async () => undefined)
    const module = new ClipboardModule() as unknown as {
      clipboardHelper: { bootstrap: ReturnType<typeof vi.fn> } | null
      clipboardService: { start: typeof nativeStart }
      startClipboardMonitoring: () => void
      runClipboardMonitor: typeof runClipboardMonitor
      coreBoxVisible: boolean
    }

    clipboardRuntimeMocks.coreBoxWindowVisible = true
    module.clipboardHelper = { bootstrap: vi.fn() }
    module.clipboardService.start = nativeStart
    module.runClipboardMonitor = runClipboardMonitor

    module.startClipboardMonitoring()

    await flushMicrotasks(4)

    expect(module.coreBoxVisible).toBe(true)
    expect(runClipboardMonitor).toHaveBeenCalledWith({
      source: 'corebox-show-baseline',
      bypassCooldown: true
    })
  })

  it('waits for pending CoreBox baseline refresh when a clipboard check is already in flight', async () => {
    const releaseFirstChecks: Array<() => void> = []
    const checkClipboard = vi.fn(async () => {
      if (checkClipboard.mock.calls.length > 1) return
      await new Promise<void>((resolve) => {
        releaseFirstChecks.push(resolve)
      })
    })
    const module = new ClipboardModule() as unknown as {
      checkClipboard: typeof checkClipboard
      runClipboardMonitor: (options?: {
        bypassCooldown?: boolean
        source?: string
      }) => Promise<void>
    }

    module.checkClipboard = checkClipboard

    const firstRun = module.runClipboardMonitor({ source: 'background-poll' })
    await flushMicrotasks(2)

    const refreshRun = module.runClipboardMonitor({
      source: 'corebox-show-baseline',
      bypassCooldown: true
    })
    await flushMicrotasks(2)

    expect(checkClipboard).toHaveBeenCalledTimes(1)
    releaseFirstChecks[0]?.()
    await firstRun
    await refreshRun

    expect(checkClipboard).toHaveBeenNthCalledWith(1, {
      source: 'background-poll',
      bypassCooldown: false
    })
    expect(checkClipboard).toHaveBeenNthCalledWith(2, {
      source: 'corebox-show-baseline',
      bypassCooldown: true
    })
  })
})

describe('ClipboardModule auto-paste failure notification', () => {
  it('sends a deduped system notification when auto-paste fails', async () => {
    const error = new Error('Command failed: osascript')
    Object.assign(error, {
      stderr: 'execution error: 未获得授权将Apple事件发送给System Events。 (-1743)'
    })
    const automation = new ClipboardAutopasteAutomation({
      hasDatabase: () => true,
      getItemById: vi.fn(async () => null),
      rememberFreshness: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
      logDebug: vi.fn()
    })

    const result = automation.toActionFailureResult(
      error,
      'Clipboard apply failed',
      { platform: 'darwin' },
      undefined,
      { notify: true }
    )

    expect(result).toMatchObject({
      success: false,
      code: 'MACOS_AUTOMATION_PERMISSION_DENIED',
      message:
        '自动粘贴失败：需要在“系统设置 -> 隐私与安全性 -> 自动化”中允许 Tuff 控制 System Events。'
    })
    expect(notificationModuleMock.showInternalSystemNotification).toHaveBeenCalledWith({
      id: 'clipboard-auto-paste-failed:MACOS_AUTOMATION_PERMISSION_DENIED',
      title: '自动粘贴失败',
      message:
        '自动粘贴失败：需要在“系统设置 -> 隐私与安全性 -> 自动化”中允许 Tuff 控制 System Events。',
      level: 'error',
      dedupeKey: 'clipboard-auto-paste-failed:MACOS_AUTOMATION_PERMISSION_DENIED',
      system: { silent: false }
    })
  })
})

describe('ClipboardModule image transport payload', () => {
  it('列表值继续走 thumbnail，同时在 meta 暴露原始 tfile URL', () => {
    const module = new ClipboardModule() as unknown as {
      toTransportItem: (item: Record<string, unknown>) => Record<string, unknown> | null
    }

    const item = module.toTransportItem({
      id: 1,
      type: 'image',
      content: '/tmp/clipboard/images/original image.png',
      thumbnail: 'data:image/png;base64,thumb',
      timestamp: new Date('2026-04-22T10:00:00.000Z'),
      meta: {
        image_size: { width: 1920, height: 1080 },
        image_file_size: 12345
      }
    })

    expect(item).not.toBeNull()
    expect(item?.value).toBe('data:image/png;base64,thumb')
    expect(item?.thumbnail).toBe('data:image/png;base64,thumb')
    expect(item?.meta).toMatchObject({
      image_original_url: 'tfile:///tmp/clipboard/images/original%20image.png',
      image_content_kind: 'preview',
      image_size: { width: 1920, height: 1080 },
      image_file_size: 12345
    })
  })

  it('已有 preview url 时保留原图地址并继续使用 thumbnail 作为列表值', () => {
    const module = new ClipboardModule() as unknown as {
      toTransportItem: (item: Record<string, unknown>) => Record<string, unknown> | null
    }

    const item = module.toTransportItem({
      id: 2,
      type: 'image',
      content: '/tmp/clipboard/images/original.png',
      thumbnail: 'data:image/png;base64,thumb',
      timestamp: new Date('2026-04-22T10:05:00.000Z'),
      meta: {
        image_preview_url: 'tfile:///tmp/clipboard/images/preview.png'
      }
    })

    expect(item).not.toBeNull()
    expect(item?.value).toBe('data:image/png;base64,thumb')
    expect(item?.meta).toMatchObject({
      image_original_url: 'tfile:///tmp/clipboard/images/original.png',
      image_content_kind: 'preview'
    })
  })

  it('只在路径位于 temp file base dir 内时才暴露 tfile 原图地址', () => {
    vi.mocked(tempFileService.isWithinBaseDir).mockReturnValueOnce(false)

    const module = new ClipboardModule() as unknown as {
      toTransportItem: (item: Record<string, unknown>) => Record<string, unknown> | null
    }

    const item = module.toTransportItem({
      id: 3,
      type: 'image',
      content: '/Users/demo/Desktop/not-managed.png',
      thumbnail: 'data:image/png;base64,thumb',
      timestamp: new Date('2026-04-22T10:10:00.000Z')
    })

    expect(item).not.toBeNull()
    expect(item?.value).toBe('data:image/png;base64,thumb')
    expect(item?.meta).toMatchObject({
      image_content_kind: 'preview'
    })
    expect(item?.meta).not.toHaveProperty('image_original_url')
  })
})
