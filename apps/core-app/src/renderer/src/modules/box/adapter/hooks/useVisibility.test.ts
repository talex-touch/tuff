import type { IBoxOptions } from '..'
import type { IClipboardItem, IClipboardOptions } from './types'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { BoxMode } from '..'
import { useVisibility } from './useVisibility'

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>(),
  send: vi.fn<() => Promise<unknown>>(async () => undefined),
  setRendererActivity: vi.fn(),
  appSetting: {
    tools: {
      autoClear: 300,
      autoPaste: {
        enable: true,
        time: 5
      }
    }
  },
  latestClipboard: null as IClipboardItem | null
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (event: { toEventName?: () => string } | string, callback: (payload?: unknown) => void) => {
      const key = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      state.listeners.set(key, callback)
      return () => {
        state.listeners.delete(key)
      }
    },
    send: state.send
  })
}))

vi.mock('@vueuse/core', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  return {
    useDocumentVisibility: () => vue.ref('hidden')
  }
})

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: state.appSetting
}))

vi.mock('~/modules/telemetry/renderer-activity', () => ({
  setRendererActivity: state.setRendererActivity
}))

vi.mock('./useClipboardChannel', () => ({
  getLatestClipboard: vi.fn(async () => state.latestClipboard)
}))

function createBoxOptions(overrides?: Partial<IBoxOptions>): IBoxOptions {
  return {
    lastHidden: Date.now(),
    mode: BoxMode.FEATURE,
    focus: 0,
    file: { buffer: null, paths: ['/tmp/a.txt'] },
    data: { feature: { id: 'clipboard-history' } },
    layout: { mode: 'list' },
    ...overrides
  }
}

function createClipboardOptions(item?: IClipboardItem | null): IClipboardOptions {
  return {
    last: item ?? {
      id: 1,
      type: 'text',
      content: 'hello',
      timestamp: new Date().toISOString()
    },
    pendingAutoFillItem: null,
    detectedAt: Date.now(),
    lastClearedTimestamp: null
  }
}

function createVisibilityHarness(options?: {
  autoClear?: number
  lastHidden?: number
  boxOptions?: IBoxOptions
  clipboardOptions?: IClipboardOptions
  handlePaste?: (options?: {
    overrideDismissed?: boolean
    triggerSearch?: boolean
    attemptAutoFill?: boolean
  }) => void
}) {
  state.appSetting.tools.autoClear = options?.autoClear ?? 300
  const boxOptions =
    options?.boxOptions ?? createBoxOptions({ lastHidden: options?.lastHidden ?? Date.now() })
  const clipboardOptions = options?.clipboardOptions ?? createClipboardOptions()
  const searchVal = ref('clipboard query')
  const deactivateAllProviders = vi.fn(async () => undefined)
  const handlePaste = options?.handlePaste ?? vi.fn()

  const hook = useVisibility({
    boxOptions,
    searchVal,
    clipboardOptions,
    handlePaste,
    boxInputRef: ref(null),
    deactivateAllProviders
  })

  return {
    hook,
    boxOptions,
    clipboardOptions,
    searchVal,
    deactivateAllProviders
  }
}

describe('useVisibility auto clear session reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.listeners.clear()
    state.send.mockResolvedValue(undefined)
    state.appSetting.tools.autoClear = 300
  })

  it('keeps previous CoreBox session when autoClear is disabled or legacy no-limit', () => {
    for (const autoClear of [-1, 0]) {
      const hiddenAt = Date.now() - 60_000
      const { hook, boxOptions, clipboardOptions, searchVal, deactivateAllProviders } =
        createVisibilityHarness({ autoClear, lastHidden: hiddenAt })

      hook.checkAutoClear()

      expect(searchVal.value).toBe('clipboard query')
      expect(boxOptions.mode).toBe(BoxMode.FEATURE)
      expect(boxOptions.file?.paths).toEqual(['/tmp/a.txt'])
      expect(clipboardOptions.last?.content).toBe('hello')
      expect(deactivateAllProviders).not.toHaveBeenCalled()
      expect(state.send).not.toHaveBeenCalledWith(MetaOverlayEvents.ui.hide)
      hook.cleanup()
    }
  })

  it('keeps previous CoreBox session when reopened within autoClear window', () => {
    const hiddenAt = Date.now() - 2_000
    const { hook, boxOptions, searchVal, deactivateAllProviders } = createVisibilityHarness({
      autoClear: 5,
      lastHidden: hiddenAt
    })

    hook.checkAutoClear()

    expect(searchVal.value).toBe('clipboard query')
    expect(boxOptions.mode).toBe(BoxMode.FEATURE)
    expect(deactivateAllProviders).not.toHaveBeenCalled()
    expect(state.send).not.toHaveBeenCalledWith(MetaOverlayEvents.ui.hide)
    hook.cleanup()
  })

  it('resets stale CoreBox session when reopened after autoClear window', () => {
    const hiddenAt = Date.now() - 6_000
    const { hook, boxOptions, clipboardOptions, searchVal, deactivateAllProviders } =
      createVisibilityHarness({ autoClear: 5, lastHidden: hiddenAt })

    hook.checkAutoClear()

    expect(searchVal.value).toBe('')
    expect(boxOptions.mode).toBe(BoxMode.INPUT)
    expect(boxOptions.data).toEqual({})
    expect(boxOptions.file).toEqual({ buffer: null, paths: [] })
    expect(boxOptions.layout).toBeUndefined()
    expect(clipboardOptions.last).toBeNull()
    expect(clipboardOptions.pendingAutoFillItem).toBeNull()
    expect(clipboardOptions.detectedAt).toBeNull()
    expect(clipboardOptions.lastClearedTimestamp).toBeNull()
    expect(state.send).toHaveBeenCalledWith(MetaOverlayEvents.ui.hide)
    expect(deactivateAllProviders).toHaveBeenCalledTimes(1)
    hook.cleanup()
  })

  it('installs native visibility handling before querying and applies the initial native state', async () => {
    vi.useFakeTimers()
    state.send.mockImplementation(async () => {
      expect(state.listeners.has(CoreBoxEvents.ui.trigger.toEventName())).toBe(true)
      return { visible: true }
    })

    const { hook } = createVisibilityHarness()
    await Promise.resolve()
    await Promise.resolve()

    expect(state.setRendererActivity).toHaveBeenLastCalledWith(true)
    hook.cleanup()
    vi.useRealTimers()
  })

  it('keeps a native visibility push that wins the initial-query race', async () => {
    let resolveVisibility: (response: { visible: boolean }) => void
    state.send.mockImplementation(
      () =>
        new Promise<{ visible: boolean }>((resolve) => {
          resolveVisibility = resolve
        })
    )
    const { hook } = createVisibilityHarness()
    const nativeTrigger = state.listeners.get(CoreBoxEvents.ui.trigger.toEventName())

    nativeTrigger?.({ show: false })
    resolveVisibility!({ visible: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(state.setRendererActivity).toHaveBeenLastCalledWith(false)
    hook.cleanup()
  })
})

describe('useVisibility clipboard autoPaste and dismissal on show', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.listeners.clear()
    state.send.mockResolvedValue(undefined)
    state.latestClipboard = null
    state.appSetting.tools.autoPaste.enable = true
    state.appSetting.tools.autoPaste.time = 5
  })

  it('does not auto-paste or attach stale clipboard image (> 5s)', async () => {
    const staleImage: IClipboardItem = {
      id: 99,
      type: 'image',
      content: 'tfile:///tmp/img.png',
      thumbnail: 'data:image/png;base64,abc',
      timestamp: new Date().toISOString(),
      freshnessBaseAt: Date.now() - 10_000,
      autoPasteEligible: true
    }
    state.latestClipboard = staleImage

    const handlePaste = vi.fn()
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions(null)
    const { hook } = createVisibilityHarness({
      boxOptions,
      clipboardOptions,
      handlePaste
    })

    const triggerShortcut = state.listeners.get(CoreBoxEvents.ui.shortcutTriggered.toEventName())
    const triggerShow = state.listeners.get(CoreBoxEvents.ui.trigger.toEventName())

    triggerShortcut?.()
    triggerShow?.({ show: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(handlePaste).not.toHaveBeenCalled()
    expect(clipboardOptions.last).toBeNull()
    hook.cleanup()
  })

  it('does not re-attach clipboard content dismissed by ESC', async () => {
    const timestamp = new Date().toISOString()
    const image: IClipboardItem = {
      id: 100,
      type: 'image',
      content: 'tfile:///tmp/img.png',
      thumbnail: 'data:image/png;base64,abc',
      timestamp,
      freshnessBaseAt: Date.now() - 1000,
      autoPasteEligible: true
    }
    state.latestClipboard = image

    const handlePaste = vi.fn()
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions(null)
    clipboardOptions.lastClearedTimestamp = timestamp

    const { hook } = createVisibilityHarness({
      boxOptions,
      clipboardOptions,
      handlePaste
    })

    const triggerShortcut = state.listeners.get(CoreBoxEvents.ui.shortcutTriggered.toEventName())
    const triggerShow = state.listeners.get(CoreBoxEvents.ui.trigger.toEventName())

    triggerShortcut?.()
    triggerShow?.({ show: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(handlePaste).not.toHaveBeenCalled()
    expect(clipboardOptions.last).toBeNull()
    hook.cleanup()
  })

  it('auto-pastes fresh clipboard content on shortcut trigger', async () => {
    const image: IClipboardItem = {
      id: 101,
      type: 'image',
      content: 'tfile:///tmp/img.png',
      thumbnail: 'data:image/png;base64,abc',
      timestamp: new Date().toISOString(),
      freshnessBaseAt: Date.now() - 1000,
      autoPasteEligible: true
    }
    state.latestClipboard = image

    const handlePaste = vi.fn()
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions(null)

    const { hook } = createVisibilityHarness({
      boxOptions,
      clipboardOptions,
      handlePaste
    })

    const triggerShortcut = state.listeners.get(CoreBoxEvents.ui.shortcutTriggered.toEventName())
    const triggerShow = state.listeners.get(CoreBoxEvents.ui.trigger.toEventName())

    triggerShortcut?.()
    triggerShow?.({ show: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(handlePaste).toHaveBeenCalledWith({ triggerSearch: true, attemptAutoFill: true })
    hook.cleanup()
  })

  it('cancels pending focus timer and drops stale clipboard check if hidden before onShow finishes', async () => {
    vi.useFakeTimers()
    try {
      const pendingClipboard = Promise.withResolvers<IClipboardItem | null>()
      const clipboardChannel = await import('./useClipboardChannel')
      vi.mocked(clipboardChannel.getLatestClipboard).mockImplementationOnce(
        () => pendingClipboard.promise
      )

      const focus = vi.fn()
      const handlePaste = vi.fn()
      const clipboardOptions = createClipboardOptions(null)
      const hook = useVisibility({
        boxOptions: createBoxOptions(),
        searchVal: ref(''),
        clipboardOptions,
        handlePaste,
        boxInputRef: ref({ focus }),
        deactivateAllProviders: vi.fn(async () => undefined)
      })

      const triggerShortcut = state.listeners.get(CoreBoxEvents.ui.shortcutTriggered.toEventName())
      const triggerShow = state.listeners.get(CoreBoxEvents.ui.trigger.toEventName())

      triggerShortcut?.()
      triggerShow?.({ show: true })
      // Hide immediately before clipboard fetch resolves or focus timer fires
      triggerShow?.({ show: false })

      pendingClipboard.resolve({
        id: 202,
        type: 'image',
        content: 'tfile:///tmp/late.png',
        thumbnail: 'data:image/png;base64,abc',
        timestamp: new Date().toISOString(),
        freshnessBaseAt: Date.now() - 500,
        autoPasteEligible: true
      })
      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(100)

      expect(focus).not.toHaveBeenCalled()
      expect(handlePaste).not.toHaveBeenCalled()
      hook.cleanup()
    } finally {
      vi.useRealTimers()
    }
  })
})
