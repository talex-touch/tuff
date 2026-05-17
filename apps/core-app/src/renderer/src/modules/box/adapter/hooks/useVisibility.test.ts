import type { IBoxOptions } from '..'
import type { IClipboardItem, IClipboardOptions } from './types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { BoxMode } from '..'
import { useVisibility } from './useVisibility'

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>(),
  appSetting: {
    tools: {
      autoClear: 300,
      autoPaste: {
        enable: true,
        time: 5
      }
    }
  }
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (event: { toEventName?: () => string } | string, callback: (payload?: unknown) => void) => {
      const key = typeof event === 'string' ? event : event.toEventName?.() || String(event)
      state.listeners.set(key, callback)
      return () => {
        state.listeners.delete(key)
      }
    }
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

vi.mock('./useClipboardChannel', () => ({
  getLatestClipboard: vi.fn(async () => null)
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

function createVisibilityHarness(options?: { autoClear?: number; lastHidden?: number }) {
  state.appSetting.tools.autoClear = options?.autoClear ?? 300
  const boxOptions = createBoxOptions({ lastHidden: options?.lastHidden ?? Date.now() })
  const clipboardOptions = createClipboardOptions()
  const searchVal = ref('clipboard query')
  const deactivateAllProviders = vi.fn(async () => undefined)

  const hook = useVisibility({
    boxOptions,
    searchVal,
    clipboardOptions,
    handlePaste: vi.fn(),
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
    expect(deactivateAllProviders).toHaveBeenCalledTimes(1)
    hook.cleanup()
  })
})
