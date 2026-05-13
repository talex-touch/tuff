import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { ClipboardAutopasteAutomationOptions } from './clipboard-autopaste-automation'
import type { IClipboardItem } from './clipboard-history-persistence'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clipboardWrite: vi.fn(),
  clipboardWriteImage: vi.fn(),
  clipboardWriteBuffer: vi.fn(),
  clipboardCreateEmpty: vi.fn(() => ({ isEmpty: () => true })),
  clipboardCreateFromDataURL: vi.fn(() => ({ isEmpty: () => false })),
  clipboardCreateFromPath: vi.fn(() => ({ isEmpty: () => false })),
  sendPlatformShortcut: vi.fn(async () => {}),
  getAutoPasteCapabilityPatch: vi.fn(async () => ({ supportLevel: 'supported' })),
  showInternalSystemNotification: vi.fn(),
  coreBoxTrigger: vi.fn()
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
    write: mocks.clipboardWrite,
    writeImage: mocks.clipboardWriteImage,
    writeBuffer: mocks.clipboardWriteBuffer
  },
  nativeImage: {
    createEmpty: mocks.clipboardCreateEmpty,
    createFromDataURL: mocks.clipboardCreateFromDataURL,
    createFromPath: mocks.clipboardCreateFromPath
  },
  BrowserWindow: class BrowserWindow {},
  crashReporter: {
    start: vi.fn()
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn()
  },
  MessageChannelMain: vi.fn(() => ({
    port1: { close: vi.fn(), postMessage: vi.fn(), start: vi.fn() },
    port2: { close: vi.fn(), postMessage: vi.fn(), start: vi.fn() }
  })),
  Notification: vi.fn(),
  powerMonitor: {
    on: vi.fn(),
    off: vi.fn()
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
    getDisplayNearestPoint: vi.fn(() => ({ bounds: { x: 0, y: 0, width: 1, height: 1 } }))
  }
}))

vi.mock('@sentry/electron/main', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
  addBreadcrumb: vi.fn(),
  startSpan: vi.fn(async (_options, callback) => await callback()),
  withScope: vi.fn((callback) => callback({ setTag: vi.fn(), setContext: vi.fn() }))
}))

vi.mock('../system/desktop-shortcut', () => ({
  sendPlatformShortcut: mocks.sendPlatformShortcut
}))

vi.mock('../system/desktop-shortcut.ts', () => ({
  sendPlatformShortcut: mocks.sendPlatformShortcut
}))

vi.mock('../platform/capability-adapter', () => ({
  getAutoPasteCapabilityPatch: mocks.getAutoPasteCapabilityPatch
}))

vi.mock('../platform/capability-adapter.ts', () => ({
  getAutoPasteCapabilityPatch: mocks.getAutoPasteCapabilityPatch
}))

vi.mock('../notification', () => ({
  notificationModule: {
    showInternalSystemNotification: mocks.showInternalSystemNotification
  }
}))

vi.mock('../notification.ts', () => ({
  notificationModule: {
    showInternalSystemNotification: mocks.showInternalSystemNotification
  }
}))

vi.mock('../box-tool/core-box/manager', () => ({
  coreBoxManager: {
    trigger: mocks.coreBoxTrigger
  }
}))

vi.mock('../box-tool/core-box/manager.ts', () => ({
  coreBoxManager: {
    trigger: mocks.coreBoxTrigger
  }
}))

import {
  ClipboardAutopasteAutomation,
  parseClipboardFileList
} from './clipboard-autopaste-automation'

function createOptions(
  overrides: Partial<ClipboardAutopasteAutomationOptions> = {}
): ClipboardAutopasteAutomationOptions {
  const historyItem: IClipboardItem = {
    id: 1,
    type: 'text',
    content: 'history text',
    rawContent: '<b>history text</b>'
  }

  return {
    hasDatabase: () => true,
    getItemById: vi.fn(async () => historyItem),
    rememberFreshness: vi.fn(),
    primeImage: vi.fn(),
    primeFiles: vi.fn(),
    markText: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
    logDebug: vi.fn(),
    ...overrides
  }
}

function createContext(): HandlerContext {
  return {
    sender: {} as HandlerContext['sender'],
    eventName: 'clipboard:test',
    plugin: { name: 'plugin-a', uniqueKey: 'plugin-key', verified: true }
  }
}

describe('clipboard-autopaste-automation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAutoPasteCapabilityPatch.mockResolvedValue({ supportLevel: 'supported' })
    mocks.sendPlatformShortcut.mockResolvedValue(undefined)
  })

  it('parses JSON file lists and rejects invalid entries', () => {
    expect(parseClipboardFileList('["/tmp/a.txt", "", 1, "/tmp/b.txt"]')).toEqual([
      '/tmp/a.txt',
      '/tmp/b.txt'
    ])
    expect(parseClipboardFileList('not-json')).toEqual([])
  })

  it('writes history item only when autoPaste is false', async () => {
    const options = createOptions()
    const automation = new ClipboardAutopasteAutomation(options)

    const result = await automation.handleApplyRequest({ id: 1, autoPaste: false }, createContext())

    expect(result).toEqual({ success: true })
    expect(mocks.clipboardWrite).toHaveBeenCalledWith({
      text: 'history text',
      html: '<b>history text</b>'
    })
    expect(options.markText).toHaveBeenCalledWith('history text')
    expect(mocks.sendPlatformShortcut).not.toHaveBeenCalled()
  })

  it('returns explicit failures for unavailable database and missing item', async () => {
    const noDb = new ClipboardAutopasteAutomation(createOptions({ hasDatabase: () => false }))
    await expect(noDb.handleApplyRequest({ id: 1 }, createContext())).resolves.toEqual({
      success: false,
      message: 'Clipboard database is not ready.',
      code: 'CLIPBOARD_DATABASE_UNAVAILABLE'
    })

    const missing = new ClipboardAutopasteAutomation(
      createOptions({ getItemById: vi.fn(async () => null) })
    )
    await expect(missing.handleApplyRequest({ id: 99 }, createContext())).resolves.toEqual({
      success: false,
      message: 'Clipboard history item not found: 99',
      code: 'CLIPBOARD_ITEM_NOT_FOUND'
    })
  })

  it('normalizes copy-and-paste payloads and reports auto paste failures', async () => {
    mocks.sendPlatformShortcut.mockRejectedValueOnce(new Error('paste failed'))
    const options = createOptions()
    const automation = new ClipboardAutopasteAutomation(options)

    const result = await automation.handleCopyAndPasteRequest(
      { text: 'hello', hideCoreBox: false, delayMs: 0 },
      createContext()
    )

    expect(result.success).toBe(false)
    expect(result.code).toBe('AUTO_PASTE_FAILED')
    expect(mocks.clipboardWrite).toHaveBeenCalledWith({ text: 'hello', html: undefined })
    expect(mocks.coreBoxTrigger).not.toHaveBeenCalled()
    expect(mocks.showInternalSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'clipboard-auto-paste-failed:AUTO_PASTE_FAILED',
        level: 'error'
      })
    )
  })
})
