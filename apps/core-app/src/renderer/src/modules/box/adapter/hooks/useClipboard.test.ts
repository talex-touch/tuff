import type { IBoxOptions } from '..'
import type { IClipboardItem, IClipboardOptions } from './types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { BoxMode } from '..'
import { useClipboard } from './useClipboard'

const state = vi.hoisted(() => ({
  latest: null as IClipboardItem | null,
  onNewItem: null as ((item: IClipboardItem) => void) | null,
  appSetting: {
    tools: {
      autoPaste: {
        enable: true,
        time: 5
      }
    }
  }
}))

vi.mock('@talex-touch/utils/env', () => ({
  hasDocument: () => true,
  hasWindow: () => true
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: state.appSetting
}))

vi.mock('./useClipboardChannel', () => ({
  getLatestClipboard: vi.fn(async () => state.latest),
  useClipboardChannel: vi.fn((handlers?: { onNewItem?: (item: IClipboardItem) => void }) => {
    state.onNewItem = handlers?.onNewItem ?? null
    return () => {
      state.onNewItem = null
    }
  })
}))

function createBoxOptions(): IBoxOptions {
  return {
    lastHidden: -1,
    mode: BoxMode.INPUT,
    focus: 0,
    file: { buffer: null, paths: [] },
    data: {},
    layout: undefined
  }
}

function createClipboardOptions(item?: IClipboardItem | null): IClipboardOptions {
  return {
    last: item ?? null,
    pendingAutoFillItem: null,
    detectedAt: null,
    lastClearedTimestamp: null
  }
}

function createClipboardItem(overrides?: Partial<IClipboardItem>): IClipboardItem {
  return {
    id: 1,
    type: 'text',
    content: 'hello',
    timestamp: new Date().toISOString(),
    thumbnail: null,
    rawContent: null,
    sourceApp: null,
    isFavorite: false,
    metadata: null,
    meta: null,
    autoPasteEligible: true,
    observedAt: Date.now(),
    freshnessBaseAt: Date.now(),
    captureSource: 'native-watch',
    ...overrides
  }
}

describe('useClipboard auto-paste freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.latest = null
    state.onNewItem = null
    state.appSetting.tools.autoPaste.enable = true
    state.appSetting.tools.autoPaste.time = 5
  })

  it('does not auto-fill a fresh-looking item unless main marks it eligible', async () => {
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions(
      createClipboardItem({
        id: 10,
        autoPasteEligible: false,
        captureSource: 'corebox-show-baseline',
        freshnessBaseAt: Date.now()
      })
    )
    state.latest = clipboardOptions.last
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ attemptAutoFill: true, triggerSearch: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe('')
    expect(clipboardOptions.pendingAutoFillItem).toBeNull()
    hook.cleanup()
  })

  it('auto-fills eligible text within TTL using freshnessBaseAt', async () => {
    const item = createClipboardItem({
      id: 11,
      content: 'fresh text',
      freshnessBaseAt: Date.now() - 1000
    })
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions(item)
    state.latest = item
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ attemptAutoFill: true, triggerSearch: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe('fresh text')
    expect(clipboardOptions.pendingAutoFillItem?.id).toBe(11)
    hook.cleanup()
  })

  it('does not auto-fill the same item twice', async () => {
    const item = createClipboardItem({
      id: 12,
      content: 'once',
      freshnessBaseAt: Date.now()
    })
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions(item)
    state.latest = item
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ attemptAutoFill: true, triggerSearch: true })
    await nextTick()
    await Promise.resolve()
    expect(searchVal.value).toBe('once')

    searchVal.value = ''
    clipboardOptions.last = item
    hook.handlePaste({ attemptAutoFill: true, triggerSearch: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe('')
    hook.cleanup()
  })

  it('treats no-limit as TTL only and still requires eligibility', async () => {
    state.appSetting.tools.autoPaste.time = 0
    const item = createClipboardItem({
      id: 13,
      content: 'old but eligible',
      freshnessBaseAt: Date.now() - 60_000,
      autoPasteEligible: true
    })
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions(item)
    state.latest = item
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ attemptAutoFill: true, triggerSearch: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe('old but eligible')
    hook.cleanup()

    const blocked = createClipboardItem({
      id: 14,
      content: 'old but baseline',
      freshnessBaseAt: Date.now() - 60_000,
      autoPasteEligible: false
    })
    const blockedOptions = createClipboardOptions(blocked)
    state.latest = blocked
    const blockedSearchVal = ref('')
    const blockedHook = useClipboard(createBoxOptions(), blockedOptions, vi.fn(), blockedSearchVal)
    blockedHook.handlePaste({ attemptAutoFill: true, triggerSearch: true })
    await nextTick()
    await Promise.resolve()

    expect(blockedSearchVal.value).toBe('')
    blockedHook.cleanup()
  })
})
