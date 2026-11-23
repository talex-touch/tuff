import type { RenderProcessGoneDetails } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isPackaged: true,
  windowDestroyed: false,
  contentsDestroyed: false,
  currentUrl: 'http://localhost:5173/#/home/c/conv-1',
  webContentsListeners: [] as { event: string; listener: (...args: unknown[]) => void }[],
  webContentsOnCalls: [] as { event: string; listener: (...args: unknown[]) => void }[],
  onceHandlers: new Map<string, () => void>(),
  reload: vi.fn(),
  loadURL: vi.fn(async () => undefined),
  loadFile: vi.fn(async () => undefined),
  close: vi.fn(),
  reportError: vi.fn()
}))

vi.mock('talex-mica-electron', () => ({
  MicaBrowserWindow: class MicaBrowserWindow {},
  IS_WINDOWS_11: false,
  WIN10: 0,
  WIN11: 1,
  MicaAvailable: false
}))

vi.mock('../modules/observability', () => ({
  operationalErrorService: {
    report: mocks.reportError
  }
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.isPackaged
    },
    getPath: vi.fn(() => '/tmp/tuff-test'),
    commandLine: { appendSwitch: vi.fn() }
  },
  BrowserWindow: class BrowserWindow {
    webContents = {
      addListener: (event: string, listener: (...args: unknown[]) => void) => {
        mocks.webContentsListeners.push({ event, listener })
      },
      on: (event: string, listener: (...args: unknown[]) => void) => {
        mocks.webContentsOnCalls.push({ event, listener })
      },
      setWindowOpenHandler: vi.fn(),
      isDestroyed: vi.fn(() => mocks.contentsDestroyed),
      getURL: vi.fn(() => mocks.currentUrl),
      reload: mocks.reload,
      openDevTools: vi.fn(),
      devToolsWebContents: null
    }

    isDestroyed = vi.fn(() => mocks.windowDestroyed)
    loadURL = mocks.loadURL
    loadFile = mocks.loadFile
    close = mocks.close
    on = vi.fn()
    show = vi.fn()
    setVibrancy = vi.fn()
    setBackgroundMaterial = vi.fn()

    once(event: string, handler: () => void): void {
      mocks.onceHandlers.set(event, handler)
    }
  }
}))

vi.mock('./eventbus/touch-event', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./eventbus/touch-event')>()
  return { ...actual, touchEventBus: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } }
})

import { setAutoResumeOnStartupReader } from '../modules/ai/auto-resume-setting'
import {
  markTouchWindowRenderFailureDegraded,
  RENDERER_CRASH_RELOAD_BACKOFF_MS,
  RENDERER_CRASH_RELOAD_WINDOW_MS,
  TouchWindow,
  unmarkTouchWindowRenderFailureDegraded
} from './touch-window'

function emitRenderProcessGone(details: RenderProcessGoneDetails): void {
  const listeners = mocks.webContentsListeners.filter(
    (entry) => entry.event === 'render-process-gone'
  )
  for (const entry of listeners) {
    entry.listener({}, details)
  }
}

describe('TouchWindow bounded render-process-gone auto-reload', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-24T00:00:00.000Z'))
    mocks.isPackaged = true
    mocks.windowDestroyed = false
    mocks.contentsDestroyed = false
    mocks.currentUrl = 'http://localhost:5173/#/home/c/conv-1'
    mocks.webContentsListeners.length = 0
    mocks.webContentsOnCalls.length = 0
    mocks.onceHandlers.clear()
    mocks.reload.mockClear()
    mocks.loadURL.mockClear()
    mocks.loadFile.mockClear()
    mocks.close.mockClear()
    mocks.reportError.mockClear()
    setAutoResumeOnStartupReader(() => true)
  })

  afterEach(() => {
    setAutoResumeOnStartupReader(null)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('auto-reloads up to 2 times per 60s window with 500ms / 2000ms backoff and resets after window expires', async () => {
    const win = new TouchWindow()
    await win.loadURL('http://localhost:5173/#/home')

    // 1st crash -> reloads after 500ms
    emitRenderProcessGone({ reason: 'crashed', exitCode: 11 })
    await vi.advanceTimersByTimeAsync(RENDERER_CRASH_RELOAD_BACKOFF_MS[0] - 1)
    expect(mocks.reload).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.reload).toHaveBeenCalledTimes(1)

    // 2nd crash (oom) -> reloads after 2000ms
    emitRenderProcessGone({ reason: 'oom', exitCode: 137 })
    await vi.advanceTimersByTimeAsync(RENDERER_CRASH_RELOAD_BACKOFF_MS[1] - 1)
    expect(mocks.reload).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.reload).toHaveBeenCalledTimes(2)

    // 3rd crash within 60s window -> blocked (crash-loop cap)
    emitRenderProcessGone({ reason: 'abnormal-exit', exitCode: 1 })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(mocks.reload).toHaveBeenCalledTimes(2)

    // After 60s window expires -> budget resets and reload fires again
    await vi.advanceTimersByTimeAsync(RENDERER_CRASH_RELOAD_WINDOW_MS)
    emitRenderProcessGone({ reason: 'crashed', exitCode: 11 })
    await vi.advanceTimersByTimeAsync(RENDERER_CRASH_RELOAD_BACKOFF_MS[0])
    expect(mocks.reload).toHaveBeenCalledTimes(3)
  })

  it('falls back to lastLoadTarget loadURL or loadFile when webContents.getURL() is empty or about:blank', async () => {
    mocks.currentUrl = ''
    const urlWin = new TouchWindow()
    await urlWin.loadURL('https://app.tuff.local/#/home')
    mocks.loadURL.mockClear()

    emitRenderProcessGone({ reason: 'crashed', exitCode: 11 })
    await vi.advanceTimersByTimeAsync(RENDERER_CRASH_RELOAD_BACKOFF_MS[0])
    expect(mocks.reload).not.toHaveBeenCalled()
    expect(mocks.loadURL).toHaveBeenCalledTimes(1)
    expect(mocks.loadURL).toHaveBeenCalledWith('https://app.tuff.local/#/home', undefined)

    mocks.webContentsListeners.length = 0
    mocks.currentUrl = 'about:blank'
    const fileWin = new TouchWindow()
    await fileWin.loadFile('/app/index.html')
    mocks.loadFile.mockClear()

    emitRenderProcessGone({ reason: 'abnormal-exit', exitCode: 1 })
    await vi.advanceTimersByTimeAsync(RENDERER_CRASH_RELOAD_BACKOFF_MS[0])
    expect(mocks.reload).not.toHaveBeenCalled()
    expect(mocks.loadFile).toHaveBeenCalledTimes(1)
    expect(mocks.loadFile).toHaveBeenCalledWith('/app/index.html', undefined)
  })

  it('does not attach duplicate render-process-gone listeners across repeated loadURL/loadFile calls', async () => {
    const win = new TouchWindow()
    await win.loadURL('http://localhost:5173/#/a')
    await win.loadURL('http://localhost:5173/#/b')
    await win.loadFile('/app/index.html')

    const goneListeners = mocks.webContentsListeners.filter(
      (entry) => entry.event === 'render-process-gone'
    )
    const failLoadListeners = mocks.webContentsOnCalls.filter(
      (entry) => entry.event === 'did-fail-load'
    )
    expect(goneListeners).toHaveLength(1)
    expect(failLoadListeners).toHaveLength(1)
  })

  it('skips auto-reload when autoResumeOnStartup is disabled initially or disabled before backoff fires', async () => {
    const win = new TouchWindow()
    await win.loadURL('http://localhost:5173/#/home')

    setAutoResumeOnStartupReader(() => false)
    emitRenderProcessGone({ reason: 'crashed', exitCode: 11 })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mocks.reload).not.toHaveBeenCalled()

    setAutoResumeOnStartupReader(() => true)
    emitRenderProcessGone({ reason: 'crashed', exitCode: 11 })
    setAutoResumeOnStartupReader(() => false)
    await vi.advanceTimersByTimeAsync(RENDERER_CRASH_RELOAD_BACKOFF_MS[0])
    expect(mocks.reload).not.toHaveBeenCalled()
  })

  it.each(['killed', 'clean-exit', 'launch-failed', 'integrity-failure'] as const)(
    'never auto-reloads for non-recoverable reason %s',
    async (reason) => {
      const win = new TouchWindow()
      await win.loadURL('http://localhost:5173/#/home')

      mocks.isPackaged = false
      emitRenderProcessGone({ reason, exitCode: 0 })
      mocks.isPackaged = true
      emitRenderProcessGone({ reason, exitCode: 0 })
      await vi.advanceTimersByTimeAsync(5_000)
      expect(mocks.reload).not.toHaveBeenCalled()
    }
  )

  it('skips degraded windows and destroyed windows/webContents', async () => {
    const win = new TouchWindow()
    await win.loadURL('http://localhost:5173/#/home')

    markTouchWindowRenderFailureDegraded(win.window)
    emitRenderProcessGone({ reason: 'crashed', exitCode: 11 })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mocks.reload).not.toHaveBeenCalled()
    unmarkTouchWindowRenderFailureDegraded(win.window)

    mocks.windowDestroyed = true
    emitRenderProcessGone({ reason: 'crashed', exitCode: 11 })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mocks.reload).not.toHaveBeenCalled()

    mocks.windowDestroyed = false
    mocks.contentsDestroyed = true
    emitRenderProcessGone({ reason: 'crashed', exitCode: 11 })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mocks.reload).not.toHaveBeenCalled()
  })

  it('clears pending crash reload timer on closed event and explicit close()', async () => {
    const win = new TouchWindow()
    await win.loadURL('http://localhost:5173/#/home')

    emitRenderProcessGone({ reason: 'crashed', exitCode: 11 })
    mocks.onceHandlers.get('closed')?.()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mocks.reload).not.toHaveBeenCalled()

    const win2 = new TouchWindow()
    mocks.webContentsListeners.length = 0
    await win2.loadURL('http://localhost:5173/#/home')
    emitRenderProcessGone({ reason: 'crashed', exitCode: 11 })
    win2.close()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(mocks.reload).not.toHaveBeenCalled()
  })
})
