import type * as NodeFs from 'node:fs'
import { clipboard } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import type {
  ClipboardActionResult,
  ClipboardApplyRequest
} from '@talex-touch/utils/transport/events/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { ActiveAppInfo } from './system/active-app'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import fs from 'node:fs'
import { mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ClipboardFreshnessStore } from './clipboard/clipboard-capture-freshness'
import { createClipboardFreshnessState } from './clipboard/clipboard-freshness'
import type { ClipboardCaptureSource } from '@talex-touch/utils/transport/events/types'
import * as schema from '../db/schema'
import { createDbUtils } from '../db/utils'
import type { CoreDatabase } from '../db/utils'
import { SearchUsageService } from './box-tool/search-engine/search-usage-service'
import * as executeRecorder from './box-tool/search-engine/execute-recorder'
import { resolveUsageIdentity } from './box-tool/search-engine/usage-identity'
import { activeAppService } from './system/active-app'
import { foregroundAppSnapshotStore } from './system/foreground-app-snapshot'

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

const shellMock = vi.hoisted(() => ({
  openPath: vi.fn(async () => '')
}))

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
    // Signature mirrors the real gate: an optional bound, and `true`/`false` for
    // drained-vs-timed-out. Tests assert on both.
    waitForIdle: vi.fn(async (_timeoutMs?: number): Promise<boolean | undefined> => true),
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
    openExternal: vi.fn(),
    openPath: shellMock.openPath
  }
}))

vi.mock('node:fs', async () => {
  // This module-load fake must obtain the unmocked filesystem behind the vi.mock boundary.
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  const existsSync = vi.fn((filePath: string) => filePath.startsWith('/tmp/clipboard/images/'))
  const promises = {
    ...actual.promises,
    // 只有剪贴板图片目录里的文件当作真实存在，其余一律 ENOENT。
    access: vi.fn(async (filePath: string) => {
      if (!filePath.startsWith('/tmp/clipboard/images/')) {
        throw new Error('ENOENT')
      }
    })
  }
  return {
    ...actual,
    default: {
      ...actual,
      existsSync,
      promises
    },
    existsSync,
    promises
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
  appTaskGate: clipboardRuntimeMocks.appTaskGate,
  // Must mirror every export the module under test imports. Omitting this made
  // reading it throw inside the deferred-startup helper, where the chain's
  // .catch() swallowed it -- so waitForIdle was simply never reached.
  APP_TASK_GATE_STARTUP_WAIT_MS: 10_000
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
    schedule: async (_label: string, operation: () => Promise<unknown>) => operation(),
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
    isWithinBaseDir: vi.fn(() => true),
    registerNamespace: vi.fn(),
    resolveNamespaceDir: vi.fn(() => '/tmp/clipboard/images')
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
import { perfMonitor } from '../utils/perf-monitor'
import { ClipboardAutopasteAutomation } from './clipboard/clipboard-autopaste-automation'
import { withClipboardCaptureSuppressed } from './clipboard/clipboard-capture-suppression'
import {
  CLIPBOARD_DEFER_GRACE_MS,
  CLIPBOARD_DEFER_MAX_ROUNDS
} from './clipboard/clipboard-deferred-capture'

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
  clipboardRuntimeMocks.appTaskGate.waitForIdle.mockResolvedValue(true)
  clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(false)
  clipboardRuntimeMocks.coreBoxWindowVisible = false
})

describe('ClipboardModule accepted apply origin', () => {
  it.each([
    { name: 'known pre-hide source', known: true, success: true },
    { name: 'unknown pre-hide source', known: false, success: true },
    { name: 'failed apply', known: true, success: false }
  ])(
    'persists only the $name instead of recapturing after automation',
    async ({ known, success }) => {
      const client = createClient({ url: ':memory:' })
      const app = (bundleId: string): ActiveAppInfo => ({
        bundleId,
        identifier: bundleId,
        displayName: bundleId,
        processId: process.pid + 1,
        executablePath: `/Applications/${bundleId}.app`,
        platform: 'macos',
        lastUpdated: 0,
        windowTitle: null
      })
      const foreground = vi
        .spyOn(activeAppService, 'getActiveApp')
        .mockResolvedValue(known ? app('source.before-hide') : null)
      const automation = vi
        .spyOn(ClipboardAutopasteAutomation.prototype, 'handleApplyRequest')
        .mockImplementation(async () => {
          foregroundAppSnapshotStore.clear()
          foreground.mockResolvedValue(app('source.after-hide'))
          return { success }
        })
      let recorder: { mockRestore: () => void } | undefined
      foregroundAppSnapshotStore.clear()
      try {
        for (const name of [
          '0000_whole_mister_fear.sql',
          '0005_orange_wiccan.sql',
          '0007_remarkable_silver_sable.sql',
          '0011_add_recommendation_tables.sql',
          '0019_usage_trend_daily.sql',
          '0051_usage_execute_events.sql'
        ]) {
          const migration = await readFile(
            new URL(`../../../resources/db/migrations/${name}`, import.meta.url),
            'utf8'
          )
          for (const statement of migration.split('--> statement-breakpoint')) {
            if (statement.trim()) await client.execute(statement)
          }
        }
        const dbUtils = createDbUtils(drizzle(client, { schema }))
        const usage = new SearchUsageService({ getDbUtils: () => dbUtils })
        // The accepted-recorder consumer is backed by the real usage service and transaction. The
        // automation boundary above is the only fake: it models focus changing during native paste.
        recorder = vi.spyOn(executeRecorder, 'recordAcceptedExecute').mockImplementation((record) =>
          usage.recordExecute(
            record.sessionId ?? null,
            record.item,
            resolveUsageIdentity(record.item).itemId,
            {
              eventId: record.eventId,
              entryPoint: record.entryPoint,
              previousApp: record.previousApp
            }
          )
        )
        const module = new ClipboardModule() as unknown as ClipboardModuleTestHandle
        module.transportChannel = { keyManager: {} }
        module.registerTransportHandlers()
        const registered = clipboardRuntimeMocks.transportOn.mock.calls.find(
          ([event]) => String(event) === ClipboardEvents.apply.toString()
        )!
        const apply = registered[1] as (
          request: ClipboardApplyRequest,
          context: HandlerContext
        ) => Promise<ClipboardActionResult>

        const result = await apply(
          { id: 42, eventId: 'clipboard-apply-origin' },
          {} as HandlerContext
        )
        const events = await dbUtils.getRecommendationHistory()

        expect(result.success).toBe(success)
        if (success) {
          expect(events).toEqual([
            {
              sourceId: 'clipboard-history',
              itemId: '42',
              sourceType: 'history',
              timestamp: expect.any(Number),
              previousApp: known ? 'source.before-hide' : null,
              previousAppName: null
            }
          ])
        } else {
          expect(events).toEqual([])
          expect(
            (await client.execute('SELECT COUNT(*) AS count FROM usage_execute_events')).rows
          ).toEqual([{ count: 0 }])
        }
      } finally {
        recorder?.mockRestore()
        automation.mockRestore()
        foreground.mockRestore()
        foregroundAppSnapshotStore.clear()
        client.close()
      }
    }
  )
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
      ClipboardEvents.previewImage.toString(),
      ClipboardEvents.queryMeta.toString(),
      ClipboardEvents.apply.toString(),
      ClipboardEvents.delete.toString(),
      ClipboardEvents.annotate.toString(),
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
    // One extra turn than the sibling test above: the deferred baseline capture
    // now awaits through waitForAppTasksBeforeStartupWork before its .then().
    await flushMicrotasks(6)

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
    // A baseline is dated when it is asked for, which is what a deferral replays it by.
    expect(checkClipboard).toHaveBeenNthCalledWith(2, {
      source: 'corebox-show-baseline',
      bypassCooldown: true,
      signal: { at: expect.any(Number), isChange: false }
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

describe('ClipboardModule annotation', () => {
  type AnnotateModule = {
    historyPersistence: { annotate: ReturnType<typeof vi.fn> }
    metaPersistence: {
      persistMetaEntries: ReturnType<typeof vi.fn>
      deleteMetaEntries: ReturnType<typeof vi.fn>
    }
    handleAnnotateRequest: (request: {
      id: number
      note?: string | null
      tags?: string[]
    }) => Promise<{ updated: boolean; note: string | null; tags: string[] }>
  }

  function createAnnotateModule(result: {
    updated: boolean
    note: string | null
    tags: string[]
  }): AnnotateModule {
    const module = new ClipboardModule() as unknown as AnnotateModule
    module.historyPersistence.annotate = vi.fn(async () => result)
    module.metaPersistence.persistMetaEntries = vi.fn(async () => {})
    module.metaPersistence.deleteMetaEntries = vi.fn(async () => {})
    return module
  }

  /**
   * The invariant this exists for: meta lives in two places. `clipboard_history.metadata` is what
   * the keyword search LIKEs, and `clipboard_history_meta` is what `hydrateWithMeta` prefers
   * whenever the item has rows there. Write only one and the annotation is either searchable but
   * invisible, or visible but unfindable — and it takes a re-read to notice.
   */
  it('mirrors the annotation into the meta table so the two stores agree', async () => {
    const module = createAnnotateModule({ updated: true, note: 'ego lite', tags: ['prod'] })

    await module.handleAnnotateRequest({ id: 7, note: 'ego lite', tags: ['prod'] })

    expect(module.metaPersistence.persistMetaEntries).toHaveBeenCalledWith(7, {}, [
      { key: 'user_note', value: 'ego lite' },
      { key: 'user_tags', value: ['prod'] }
    ])
    expect(module.metaPersistence.deleteMetaEntries).toHaveBeenCalledWith(7, [])
  })

  it('deletes the meta rows for a cleared field instead of writing an empty one', async () => {
    const module = createAnnotateModule({ updated: true, note: null, tags: ['prod'] })

    await module.handleAnnotateRequest({ id: 8, note: '' })

    // 清掉的键必须删行：persistMetaEntries 写 null 会留下一行 `"null"`，
    // hydrate 时那仍然是一个"存在的键"，和 JSON 列删键的结果对不上。
    expect(module.metaPersistence.deleteMetaEntries).toHaveBeenCalledWith(8, ['user_note'])
    expect(module.metaPersistence.persistMetaEntries).toHaveBeenCalledWith(8, {}, [
      { key: 'user_tags', value: ['prod'] }
    ])
  })

  it('touches neither store when the record is gone', async () => {
    const module = createAnnotateModule({ updated: false, note: null, tags: [] })

    await module.handleAnnotateRequest({ id: 404, note: 'hi' })

    expect(module.metaPersistence.persistMetaEntries).not.toHaveBeenCalled()
    expect(module.metaPersistence.deleteMetaEntries).not.toHaveBeenCalled()
  })
})

describe('ClipboardModule system image preview', () => {
  type PreviewModule = {
    getItemById: (id: number) => Promise<Record<string, unknown> | null>
    imagePersistence: { resolveOwnedImagePath: (reference: string) => string | null }
    handlePreviewImageRequest: (request: { id: number }) => Promise<{ opened: boolean }>
  }

  function createPreviewModule(item: Record<string, unknown> | null): PreviewModule {
    const module = new ClipboardModule() as unknown as PreviewModule
    module.getItemById = vi.fn(async () => item)
    return module
  }

  it('hands the stored file to the OS and never lets the caller name it', async () => {
    const module = createPreviewModule({
      id: 7,
      type: 'image',
      content: '/tmp/clipboard/images/shot.png'
    })

    await expect(module.handlePreviewImageRequest({ id: 7 })).resolves.toEqual({ opened: true })
    expect(shellMock.openPath).toHaveBeenCalledWith('/tmp/clipboard/images/shot.png')
    // 请求里只有 id，路径是主进程自己从记录里查出来的。
    expect(module.getItemById).toHaveBeenCalledWith(7)
  })

  it('refuses a record whose path escaped the clipboard image namespace', async () => {
    const module = createPreviewModule({
      id: 8,
      type: 'image',
      content: '/etc/passwd'
    })
    // 数据库里的路径也不可信：它落在命名空间外就当作没有原图。
    module.imagePersistence.resolveOwnedImagePath = vi.fn(() => null)

    await expect(module.handlePreviewImageRequest({ id: 8 })).resolves.toEqual({ opened: false })
    expect(shellMock.openPath).not.toHaveBeenCalled()
  })

  it('reports not-opened for a text record and for a missing file', async () => {
    const textModule = createPreviewModule({
      id: 9,
      type: 'text',
      content: '/tmp/clipboard/images/shot.png'
    })
    await expect(textModule.handlePreviewImageRequest({ id: 9 })).resolves.toEqual({
      opened: false
    })

    const goneModule = createPreviewModule({
      id: 10,
      type: 'image',
      content: '/tmp/clipboard/images/gone.png'
    })
    goneModule.imagePersistence.resolveOwnedImagePath = vi.fn(() => '/tmp/clipboard/other/gone.png')

    await expect(goneModule.handlePreviewImageRequest({ id: 10 })).resolves.toEqual({
      opened: false
    })
    expect(shellMock.openPath).not.toHaveBeenCalled()
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

describe('ClipboardModule skips redundant captures while native watch is active', () => {
  interface CheckHandle {
    clipboardHelper: unknown
    db: unknown
    capturePipeline: { process: ReturnType<typeof vi.fn> }
    clipboardService: {
      isNativeActive: ReturnType<typeof vi.fn>
      getNativeChangeCount: ReturnType<typeof vi.fn>
    }
    checkClipboard: (options: { bypassCooldown?: boolean; source: string }) => Promise<void>
    lastCaptureChangeToken: number | null
  }

  function createModule(): CheckHandle {
    const module = new ClipboardModule() as unknown as CheckHandle
    module.clipboardHelper = { bootstrap: vi.fn() }
    module.db = {}
    module.capturePipeline = { process: vi.fn(async () => undefined) }
    module.clipboardService = {
      isNativeActive: vi.fn(() => true),
      getNativeChangeCount: vi.fn(() => 0)
    } as unknown as CheckHandle['clipboardService']
    return module
  }

  it('runs the first baseline then skips an unchanged corebox-show baseline', async () => {
    const module = createModule()

    // First baseline has no prior capture token, so it must run and read the clipboard.
    await module.checkClipboard({ source: 'corebox-show-baseline', bypassCooldown: true })
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)

    // Second baseline with the native change-count unchanged is skipped — no
    // main-thread clipboard.readImage() that would block the event loop.
    await module.checkClipboard({ source: 'corebox-show-baseline', bypassCooldown: true })
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
  })

  it('re-runs the baseline after the native watcher observes a change', async () => {
    const module = createModule()
    await module.checkClipboard({ source: 'corebox-show-baseline', bypassCooldown: true })
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)

    // OS clipboard changed → native change-count advanced → next baseline runs.
    module.clipboardService.getNativeChangeCount.mockReturnValue(1)
    await module.checkClipboard({ source: 'corebox-show-baseline', bypassCooldown: true })
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(2)
  })

  it('never skips the native-watch change signal itself', async () => {
    const module = createModule()
    await module.checkClipboard({ source: 'corebox-show-baseline', bypassCooldown: true })
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)

    // Same change-count, but native-watch is the change signal and always runs.
    await module.checkClipboard({ source: 'native-watch', bypassCooldown: true })
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(2)
  })

  it('does not skip while the native watcher is inactive (polling fallback)', async () => {
    const module = createModule()
    module.clipboardService.isNativeActive.mockReturnValue(false)

    await module.checkClipboard({ source: 'corebox-show-baseline', bypassCooldown: true })
    await module.checkClipboard({ source: 'corebox-show-baseline', bypassCooldown: true })
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(2)
  })
})

describe('ClipboardModule bounds the app-task wait on the search path', () => {
  interface GateHandle {
    clipboardHelper: unknown
    db: unknown
    capturePipeline: { process: ReturnType<typeof vi.fn> }
    clipboardService: {
      isNativeActive: ReturnType<typeof vi.fn>
      getNativeChangeCount: ReturnType<typeof vi.fn>
    }
    checkClipboard: (options: { bypassCooldown?: boolean; source: string }) => Promise<void>
  }

  function createModule(): GateHandle {
    const module = new ClipboardModule() as unknown as GateHandle
    module.clipboardHelper = { bootstrap: vi.fn() }
    module.db = {}
    module.capturePipeline = { process: vi.fn(async () => undefined) }
    module.clipboardService = {
      // Inactive so shouldSkipUnchangedCapture cannot short-circuit before the gate.
      isNativeActive: vi.fn(() => false),
      getNativeChangeCount: vi.fn(() => 0)
    } as unknown as GateHandle['clipboardService']
    return module
  }

  it('waits with a bound rather than indefinitely', async () => {
    const module = createModule()
    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(true)
    clipboardRuntimeMocks.appTaskGate.waitForIdle.mockResolvedValue(true)

    await module.checkClipboard({ source: 'corebox-show-baseline', bypassCooldown: true })

    // Every executeSearch awaits a clipboard refresh before it builds the query,
    // so an unbounded wait here stalls the whole search for as long as the
    // app-index scan runs. The timeout argument is the contract.
    const [timeoutArg] = clipboardRuntimeMocks.appTaskGate.waitForIdle.mock.calls.at(-1) ?? []
    expect(typeof timeoutArg).toBe('number')
    expect(timeoutArg).toBeGreaterThan(0)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
  })

  it('gives up the capture when the gate never drains', async () => {
    const module = createModule()
    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(true)
    clipboardRuntimeMocks.appTaskGate.waitForIdle.mockResolvedValue(false)

    await module.checkClipboard({ source: 'corebox-show-baseline', bypassCooldown: true })

    // A slightly stale clipboard beats hanging the search.
    expect(module.capturePipeline.process).not.toHaveBeenCalled()
  })
})

describe('ClipboardModule retries a change signal held back by a transient gate', () => {
  interface RetryHandle {
    clipboardHelper: unknown
    db: unknown
    capturePipeline: { process: ReturnType<typeof vi.fn> }
    clipboardService: {
      isNativeActive: ReturnType<typeof vi.fn>
      getNativeChangeCount: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      reset: ReturnType<typeof vi.fn>
    }
    lastCaptureChangeToken: number | null
    checkClipboard: (options: {
      bypassCooldown?: boolean
      source: string
      deferRound?: number
      signal?: { at: number; isChange: boolean }
    }) => Promise<void>
    runClipboardMonitor: (options?: {
      bypassCooldown?: boolean
      source?: string
      deferRound?: number
      signal?: { at: number; isChange: boolean }
    }) => Promise<void>
    destroy: () => void
  }

  const LAG_WINDOW_MS = 8_000
  const APP_TASK_RETRY_MS = 3_000
  const nativeWatch = { source: 'native-watch', bypassCooldown: true }
  const baseline = { source: 'corebox-show-baseline', bypassCooldown: true }

  function createModule(): RetryHandle {
    const module = new ClipboardModule() as unknown as RetryHandle
    module.clipboardHelper = { bootstrap: vi.fn() }
    module.db = {}
    module.capturePipeline = { process: vi.fn(async () => undefined) }
    module.clipboardService = {
      isNativeActive: vi.fn(() => true),
      // One change nobody has captured yet: the signal the gate holds back.
      getNativeChangeCount: vi.fn(() => 1),
      stop: vi.fn(),
      reset: vi.fn()
    } as unknown as RetryHandle['clipboardService']
    return module
  }

  function reportSevereLag(at = Date.now()): void {
    vi.mocked(perfMonitor.getRecentEventLoopLagSnapshot).mockReturnValue({
      lagMs: 2_300,
      severity: 'error',
      at
    })
  }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(perfMonitor.getRecentEventLoopLagSnapshot).mockReset()
    vi.mocked(perfMonitor.getRecentEventLoopLagSnapshot).mockReturnValue(null)
  })

  it('captures a change signal dropped under severe lag once the lag window closes', async () => {
    const module = createModule()
    const signalledAt = Date.now()
    reportSevereLag()

    await module.checkClipboard(nativeWatch)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(CLIPBOARD_DEFER_GRACE_MS)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
    expect(module.capturePipeline.process).toHaveBeenCalledWith('native-watch', {
      observedAt: signalledAt
    })

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
  })

  it('dates the replay by when the change was signalled, however often it was deferred', async () => {
    const module = createModule()
    const signalledAt = Date.now()
    let lagging = true
    vi.mocked(perfMonitor.getRecentEventLoopLagSnapshot).mockImplementation(() =>
      lagging ? { lagMs: 2_300, severity: 'error', at: Date.now() } : null
    )

    await module.checkClipboard(nativeWatch)
    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    lagging = false
    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS)

    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
    expect(module.capturePipeline.process).toHaveBeenCalledWith('native-watch', {
      observedAt: signalledAt
    })
    expect(Date.now() - signalledAt).toBe(2 * (LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS))
  })

  it('dates the replay by the latest change signal when a burst was dropped', async () => {
    const module = createModule()
    reportSevereLag()

    await module.checkClipboard(nativeWatch)
    await vi.advanceTimersByTimeAsync(2_000)
    const latestSignalAt = Date.now()
    await module.checkClipboard(nativeWatch)
    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS)

    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
    expect(module.capturePipeline.process).toHaveBeenCalledWith('native-watch', {
      observedAt: latestSignalAt
    })
  })

  it('waits no longer than the lag window for a snapshot stamped in the future', async () => {
    const module = createModule()
    // The snapshot is wall-clock, so a clock stepped back leaves it ahead of now.
    vi.mocked(perfMonitor.getRecentEventLoopLagSnapshot).mockReturnValueOnce({
      lagMs: 2_300,
      severity: 'error',
      at: Date.now() + 60_000
    })

    await module.checkClipboard(nativeWatch)
    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS - 1)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
  })

  it('ties the retry to the end of the lag window, not to when the signal arrived', async () => {
    const module = createModule()
    reportSevereLag()
    await vi.advanceTimersByTimeAsync(5_000)

    await module.checkClipboard(nativeWatch)
    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS - 5_000 + CLIPBOARD_DEFER_GRACE_MS - 1)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
  })

  it('captures once for a burst of dropped signals', async () => {
    const module = createModule()
    reportSevereLag()

    for (let signal = 0; signal < 5; signal += 1) {
      await module.checkClipboard(nativeWatch)
      await vi.advanceTimersByTimeAsync(500)
    }
    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS)

    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
  })

  it('does not capture again when something else already took the change', async () => {
    const module = createModule()
    reportSevereLag()
    await module.checkClipboard(nativeWatch)

    module.lastCaptureChangeToken = 1
    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS)

    expect(module.capturePipeline.process).not.toHaveBeenCalled()
  })

  it('defers again while severe lag recurs, then lets the capture through at the cap', async () => {
    const module = createModule()
    vi.mocked(perfMonitor.getRecentEventLoopLagSnapshot).mockImplementation(() => ({
      lagMs: 2_300,
      severity: 'error',
      at: Date.now()
    }))

    await module.checkClipboard(nativeWatch)
    for (let round = 1; round < CLIPBOARD_DEFER_MAX_ROUNDS; round += 1) {
      await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS)
      expect(module.capturePipeline.process).not.toHaveBeenCalled()
    }

    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
  })

  it('keeps a parked retry on the same deferral count', async () => {
    const module = createModule()
    const checkClipboard = vi.fn(async (_options: unknown): Promise<void> => undefined)
    module.checkClipboard = checkClipboard
    let releaseFirst: () => void = () => {}
    checkClipboard.mockImplementationOnce(
      async () =>
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
    )

    const first = module.runClipboardMonitor({ source: 'native-watch', bypassCooldown: true })
    await vi.advanceTimersByTimeAsync(0)
    const retry = module.runClipboardMonitor({ ...nativeWatch, deferRound: 2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(checkClipboard).toHaveBeenCalledTimes(1)

    releaseFirst()
    await first
    await retry

    expect(checkClipboard).toHaveBeenNthCalledWith(2, expect.objectContaining({ deferRound: 2 }))
  })

  it('cancels the pending retry when the module is destroyed', async () => {
    const module = createModule()
    const idleTimers = vi.getTimerCount()
    reportSevereLag()

    await module.checkClipboard(nativeWatch)
    expect(vi.getTimerCount()).toBe(idleTimers + 1)

    module.destroy()
    expect(vi.getTimerCount()).toBe(idleTimers)

    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()
  })

  it('leaves polls to their next tick', async () => {
    const module = createModule()
    module.clipboardService.isNativeActive.mockReturnValue(false)
    const idleTimers = vi.getTimerCount()
    reportSevereLag()

    await module.checkClipboard({ source: 'background-poll' })
    await module.checkClipboard({ source: 'visible-poll' })
    expect(vi.getTimerCount()).toBe(idleTimers)

    await vi.advanceTimersByTimeAsync(LAG_WINDOW_MS + CLIPBOARD_DEFER_GRACE_MS)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()
  })

  it('retries a change signal the app-task gate held back once the gate clears', async () => {
    const module = createModule()
    const signalledAt = Date.now()
    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(true)

    await module.checkClipboard(nativeWatch)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(APP_TASK_RETRY_MS - 1)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
    expect(module.capturePipeline.process).toHaveBeenCalledWith('native-watch', {
      observedAt: signalledAt
    })
  })

  it('lets a change signal through a gate that never clears once the cap is used up', async () => {
    const module = createModule()
    const signalledAt = Date.now()
    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(true)

    await module.checkClipboard(nativeWatch)
    await vi.advanceTimersByTimeAsync(APP_TASK_RETRY_MS * CLIPBOARD_DEFER_MAX_ROUNDS - 1)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
    expect(module.capturePipeline.process).toHaveBeenCalledWith('native-watch', {
      observedAt: signalledAt
    })
  })

  it('retries a CoreBox baseline that gave up waiting for app tasks', async () => {
    const module = createModule()
    const signalledAt = Date.now()
    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(true)
    clipboardRuntimeMocks.appTaskGate.waitForIdle.mockResolvedValue(false)

    await module.checkClipboard(baseline)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(APP_TASK_RETRY_MS)

    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
    expect(module.capturePipeline.process).toHaveBeenCalledWith('corebox-show-baseline', {
      observedAt: signalledAt
    })
  })

  it('captures a CoreBox baseline retried at the cap although the gate is still active', async () => {
    const module = createModule()
    const idleTimers = vi.getTimerCount()
    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(true)
    clipboardRuntimeMocks.appTaskGate.waitForIdle.mockResolvedValue(false)

    await module.checkClipboard({ ...baseline, deferRound: CLIPBOARD_DEFER_MAX_ROUNDS })

    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(idleTimers)
  })

  it('lets a CoreBox baseline through a gate that never clears once the cap is used up', async () => {
    const module = createModule()
    const signalledAt = Date.now()
    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(true)
    clipboardRuntimeMocks.appTaskGate.waitForIdle.mockResolvedValue(false)

    await module.checkClipboard(baseline)
    await vi.advanceTimersByTimeAsync(APP_TASK_RETRY_MS * CLIPBOARD_DEFER_MAX_ROUNDS - 1)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
    expect(module.capturePipeline.process).toHaveBeenCalledWith('corebox-show-baseline', {
      observedAt: signalledAt
    })

    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
  })

  it('captures at the cap a change signal that a CoreBox baseline merged into', async () => {
    const module = createModule()
    const changedAt = Date.now()
    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(true)
    clipboardRuntimeMocks.appTaskGate.waitForIdle.mockResolvedValue(false)

    await module.checkClipboard(nativeWatch)
    await vi.advanceTimersByTimeAsync(1_000)
    await module.checkClipboard(baseline)

    // The slot now replays as the baseline, which is the source that used to be dropped at the cap.
    await vi.advanceTimersByTimeAsync(APP_TASK_RETRY_MS * CLIPBOARD_DEFER_MAX_ROUNDS - 1_000 - 1)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(module.capturePipeline.process).toHaveBeenCalledTimes(1)
    expect(module.capturePipeline.process).toHaveBeenCalledWith('corebox-show-baseline', {
      observedAt: changedAt
    })
  })

  it('arms nothing when the module is destroyed while a baseline waits for the app-task gate', async () => {
    const module = createModule()
    const idleTimers = vi.getTimerCount()
    clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(true)
    clipboardRuntimeMocks.appTaskGate.waitForIdle.mockImplementation(async () => {
      module.destroy()
      return false
    })

    await module.checkClipboard(baseline)

    expect(vi.getTimerCount()).toBe(idleTimers)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(module.capturePipeline.process).not.toHaveBeenCalled()
  })

  describe('while the app is writing the clipboard itself', () => {
    const gated = {
      lag: () => reportSevereLag(),
      appTask: () => {
        clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(true)
        clipboardRuntimeMocks.appTaskGate.waitForIdle.mockResolvedValue(false)
      }
    }

    it.each([
      ['a change signal under severe lag', nativeWatch, gated.lag],
      ['a change signal held back by the app-task gate', nativeWatch, gated.appTask],
      ['a CoreBox baseline that gave up waiting for app tasks', baseline, gated.appTask]
    ])('drops %s instead of deferring it', async (_name, request, holdBack) => {
      const idleTimers = vi.getTimerCount()
      holdBack()

      // The same signal with nothing suppressed does arm a retry.
      const control = createModule()
      await control.checkClipboard(request)
      expect(vi.getTimerCount()).toBe(idleTimers + 1)
      control.destroy()

      const module = createModule()
      await withClipboardCaptureSuppressed(async () => {
        await module.checkClipboard(request)
      })
      expect(vi.getTimerCount()).toBe(idleTimers)

      clipboardRuntimeMocks.appTaskGate.isActive.mockReturnValue(false)
      vi.mocked(perfMonitor.getRecentEventLoopLagSnapshot).mockReturnValue(null)
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      expect(module.capturePipeline.process).not.toHaveBeenCalled()
    })
  })

  describe('when requests park behind a running check', () => {
    function parkBehindFirst() {
      const module = createModule()
      const checkClipboard = vi.fn(async (_options: unknown): Promise<void> => undefined)
      module.checkClipboard = checkClipboard
      let releaseFirst: () => void = () => {}
      checkClipboard.mockImplementationOnce(
        async () =>
          await new Promise<void>((resolve) => {
            releaseFirst = resolve
          })
      )
      return { module, checkClipboard, release: () => releaseFirst() }
    }

    it('dates a parked change signal by when it arrived, not by when it runs', async () => {
      const { module, checkClipboard, release } = parkBehindFirst()
      const firstAt = Date.now()
      const first = module.runClipboardMonitor(nativeWatch)
      await vi.advanceTimersByTimeAsync(4_000)
      const parkedAt = Date.now()
      const parked = module.runClipboardMonitor(nativeWatch)
      await vi.advanceTimersByTimeAsync(4_000)

      release()
      await first
      await parked

      expect(checkClipboard).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ signal: { at: firstAt, isChange: true } })
      )
      expect(checkClipboard).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ signal: { at: parkedAt, isChange: true } })
      )
    })

    it('merges parked requests into the latest change signal and the highest round', async () => {
      const { module, checkClipboard, release } = parkBehindFirst()
      const first = module.runClipboardMonitor(nativeWatch)
      await vi.advanceTimersByTimeAsync(0)
      const retry = module.runClipboardMonitor({
        ...nativeWatch,
        deferRound: 2,
        signal: { at: Date.now() - 20_000, isChange: true }
      })
      await vi.advanceTimersByTimeAsync(1_000)
      const freshAt = Date.now()
      const fresh = module.runClipboardMonitor(nativeWatch)
      await vi.advanceTimersByTimeAsync(1_000)

      release()
      await first
      await retry
      await fresh

      expect(checkClipboard).toHaveBeenCalledTimes(2)
      expect(checkClipboard).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ deferRound: 2, signal: { at: freshAt, isChange: true } })
      )
    })
  })
})

describe('ClipboardModule exact captured file preview authorization', () => {
  async function fixture(source?: ClipboardCaptureSource) {
    const directory = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'clipboard-preview-contract-'))
    )
    const larkDirectory = path.join(
      directory,
      'Library/Containers/com.lark.Lark/Data/Library/Application Support/Lark/Downloads'
    )
    await fs.promises.mkdir(larkDirectory, { recursive: true })
    const captured = path.join(larkDirectory, '截图 中文.png')
    const other = path.join(larkDirectory, 'uncaptured.png')
    await writeFile(captured, 'captured image')
    await writeFile(other, 'uncaptured image')
    const client = createClient({ url: `file:${path.join(directory, 'history.db')}` })
    await client.execute(
      'CREATE TABLE clipboard_history (id INTEGER PRIMARY KEY, type TEXT, content TEXT, capture_source TEXT, metadata TEXT)'
    )
    const content = JSON.stringify([captured])
    await client.execute({
      sql: 'INSERT INTO clipboard_history VALUES (?, ?, ?, ?, ?)',
      args: [
        41,
        'files',
        content,
        'native-watch',
        JSON.stringify({ captureSource: 'native-watch', autoPasteEligible: true })
      ]
    })
    const proof = new ClipboardFreshnessStore()
    if (source)
      proof.remember(
        { id: 41, type: 'files', content },
        createClipboardFreshnessState({ source, observedAt: 100, previousScanAt: 90 })
      )
    // Inject only the existing database/proof dependency seams, never the resolver itself.
    const module = new ClipboardModule()
    const dependencies = module as unknown as {
      db: CoreDatabase
      clipboardFreshness: ClipboardFreshnessStore
    }
    dependencies.db = drizzle(client, { schema })
    dependencies.clipboardFreshness = proof
    return {
      module,
      proof,
      client,
      captured,
      other,
      content,
      cleanup: async () => {
        client.close()
        await rm(directory, { recursive: true, force: true })
      }
    }
  }

  it.each(['native-watch', 'background-poll', 'visible-poll', 'corebox-show-baseline'] as const)(
    'allows the exact real Lark-style captured path from %s',
    async (source) => {
      const state = await fixture(source)
      try {
        await expect(state.module.resolveCapturedFilePreviewPath(41, state.captured)).resolves.toBe(
          state.captured
        )
        await expect(
          state.module.resolveCapturedFilePreviewPath(41, state.other)
        ).resolves.toBeNull()
        await expect(
          state.module.resolveCapturedFilePreviewPath(404, state.captured)
        ).resolves.toBeNull()
      } finally {
        await state.cleanup()
      }
    }
  )

  it.each([undefined, 'manual-write', 'history-apply', 'startup-bootstrap'] as const)(
    'does not authorize fabricated DB capture_source without genuine proof (%s)',
    async (source) => {
      const state = await fixture(source)
      try {
        await expect(
          state.module.resolveCapturedFilePreviewPath(41, state.captured)
        ).resolves.toBeNull()
      } finally {
        await state.cleanup()
      }
    }
  )

  it.each(['delete', 'change-content', 'change-type'] as const)(
    'denies a previously captured item after live DB %s',
    async (change) => {
      const state = await fixture('native-watch')
      try {
        // A successful request before the mutation must not turn into an authorization cache.
        await expect(state.module.resolveCapturedFilePreviewPath(41, state.captured)).resolves.toBe(
          state.captured
        )
        if (change === 'delete')
          await state.client.execute('DELETE FROM clipboard_history WHERE id = 41')
        else if (change === 'change-content')
          await state.client.execute({
            sql: 'UPDATE clipboard_history SET content = ? WHERE id = 41',
            args: [JSON.stringify([state.other])]
          })
        else await state.client.execute("UPDATE clipboard_history SET type = 'text' WHERE id = 41")
        await expect(
          state.module.resolveCapturedFilePreviewPath(41, state.captured)
        ).resolves.toBeNull()
      } finally {
        await state.cleanup()
      }
    }
  )

  it('denies proof forgotten while filesystem validation is pending', async () => {
    const state = await fixture('native-watch')
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const actualLstat = fs.promises.lstat.bind(fs.promises)
    const spy = vi.spyOn(fs.promises, 'lstat').mockImplementationOnce(async (target) => {
      const stat = await actualLstat(target)
      entered.resolve()
      await release.promise
      return stat
    })
    try {
      const pending = state.module.resolveCapturedFilePreviewPath(41, state.captured)
      await entered.promise
      state.proof.delete(41)
      release.resolve()
      await expect(pending).resolves.toBeNull()
    } finally {
      release.resolve()
      spy.mockRestore()
      await state.cleanup()
    }
  })

  it('denies a captured path replaced by a symlink', async () => {
    const state = await fixture('native-watch')
    try {
      await unlink(state.captured)
      await symlink(state.other, state.captured)
      await expect(
        state.module.resolveCapturedFilePreviewPath(41, state.captured)
      ).resolves.toBeNull()
    } finally {
      await state.cleanup()
    }
  })

  it.each(['delete', 'change-content'] as const)(
    'rechecks live DB %s while canonical filesystem validation is awaiting',
    async (change) => {
      const state = await fixture('native-watch')
      const entered = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const actualLstat = fs.promises.lstat.bind(fs.promises)
      const spy = vi.spyOn(fs.promises, 'lstat').mockImplementationOnce(async (target) => {
        const stat = await actualLstat(target)
        entered.resolve()
        await release.promise
        return stat
      })
      try {
        const pending = state.module.resolveCapturedFilePreviewPath(41, state.captured)
        await entered.promise
        if (change === 'delete')
          await state.client.execute('DELETE FROM clipboard_history WHERE id = 41')
        else
          await state.client.execute({
            sql: 'UPDATE clipboard_history SET content = ? WHERE id = 41',
            args: [JSON.stringify([state.other])]
          })
        release.resolve()
        await expect(pending).resolves.toBeNull()
      } finally {
        release.resolve()
        spy.mockRestore()
        await state.cleanup()
      }
    }
  )

  it('keeps the original immutable capture when a caller later mutates its item and freshness objects', async () => {
    const state = await fixture()
    try {
      const item = { id: 41, type: 'files', content: state.content }
      const freshness = createClipboardFreshnessState({
        source: 'native-watch',
        observedAt: 100,
        previousScanAt: 90
      })
      state.proof.remember(item, freshness)
      item.content = JSON.stringify([state.other])
      freshness.captureSource = 'manual-write'
      await expect(state.module.resolveCapturedFilePreviewPath(41, state.captured)).resolves.toBe(
        state.captured
      )
      await expect(state.module.resolveCapturedFilePreviewPath(41, state.other)).resolves.toBeNull()
      state.proof.clear()
      await expect(
        state.module.resolveCapturedFilePreviewPath(41, state.captured)
      ).resolves.toBeNull()
    } finally {
      await state.cleanup()
    }
  })
})
