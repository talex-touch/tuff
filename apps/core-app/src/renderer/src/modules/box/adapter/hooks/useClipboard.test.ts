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

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
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
    lastClearedTimestamp: null,
    lastTextAttachmentIdentity: null,
    lastTextAttachmentSource: null
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

  it('does not auto-fill eligible text older than the default TTL', async () => {
    const item = createClipboardItem({
      id: 15,
      content: 'stale text',
      freshnessBaseAt: Date.now() - 6000,
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

    expect(searchVal.value).toBe('')
    expect(clipboardOptions.pendingAutoFillItem).toBeNull()
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

  it('records first manual long text paste as an attachment', async () => {
    const item = createClipboardItem({
      id: 21,
      content: 'manual long text '.repeat(8),
      autoPasteEligible: false
    })
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions()
    state.latest = item
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ overrideDismissed: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe('')
    expect(clipboardOptions.last?.id).toBe(21)
    expect(clipboardOptions.lastTextAttachmentIdentity).toEqual(expect.any(String))
    expect(clipboardOptions.lastTextAttachmentSource).toBe('manual')
    hook.cleanup()
  })

  it('fills input on repeated manual paste of the same long text', async () => {
    const content = 'manual repeated long text '.repeat(6)
    const first = createClipboardItem({
      id: 22,
      content,
      autoPasteEligible: false
    })
    const second = createClipboardItem({
      id: 23,
      content,
      timestamp: new Date(Date.now() + 1000).toISOString(),
      autoPasteEligible: false
    })
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions()
    state.latest = first
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ overrideDismissed: true })
    await nextTick()
    await Promise.resolve()

    state.latest = second
    hook.handlePaste({ overrideDismissed: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe(content)
    expect(clipboardOptions.last).toBeNull()
    expect(clipboardOptions.pendingAutoFillItem?.id).toBe(23)
    expect(clipboardOptions.lastTextAttachmentSource).toBe('manual')
    hook.cleanup()
  })

  it('fills input when manual paste repeats a long text seen by auto-paste', async () => {
    const content = 'auto then manual long text '.repeat(6)
    const first = createClipboardItem({
      id: 24,
      content,
      freshnessBaseAt: Date.now() - 1000,
      autoPasteEligible: true
    })
    const second = createClipboardItem({
      id: 25,
      content,
      timestamp: new Date(Date.now() + 1000).toISOString(),
      autoPasteEligible: false
    })
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions(first)
    state.latest = first
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ attemptAutoFill: true, triggerSearch: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe('')
    expect(clipboardOptions.lastTextAttachmentSource).toBe('auto')

    state.latest = second
    hook.handlePaste({ overrideDismissed: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe(content)
    expect(clipboardOptions.last).toBeNull()
    expect(clipboardOptions.pendingAutoFillItem?.id).toBe(25)
    hook.cleanup()
  })

  it('fills input when manual paste repeats a long text already visible as a clipboard suffix', async () => {
    const content = 'visible suffix long text '.repeat(6)
    const item = createClipboardItem({
      id: 30,
      content,
      autoPasteEligible: true
    })
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions(item)
    state.latest = item
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ overrideDismissed: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe(content)
    expect(clipboardOptions.last).toBeNull()
    expect(clipboardOptions.pendingAutoFillItem?.id).toBe(30)
    expect(clipboardOptions.lastTextAttachmentSource).toBe('manual')
    hook.cleanup()
  })

  it('fills input when auto-paste repeats a long text first pasted manually', async () => {
    const content = 'manual then auto long text '.repeat(6)
    const first = createClipboardItem({
      id: 26,
      content,
      autoPasteEligible: false
    })
    const second = createClipboardItem({
      id: 27,
      content,
      timestamp: new Date(Date.now() + 1000).toISOString(),
      freshnessBaseAt: Date.now() - 500,
      autoPasteEligible: true
    })
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions()
    state.latest = first
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ overrideDismissed: true })
    await nextTick()
    await Promise.resolve()

    state.latest = second
    hook.handlePaste({ attemptAutoFill: true, triggerSearch: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe(content)
    expect(clipboardOptions.last).toBeNull()
    expect(clipboardOptions.pendingAutoFillItem?.id).toBe(27)
    expect(clipboardOptions.lastTextAttachmentSource).toBe('auto')
    hook.cleanup()
  })

  it('does not auto-fill a stale repeated long text first pasted manually', async () => {
    const content = 'manual then stale auto long text '.repeat(6)
    const first = createClipboardItem({
      id: 31,
      content,
      autoPasteEligible: false
    })
    const second = createClipboardItem({
      id: 32,
      content,
      timestamp: new Date(Date.now() + 1000).toISOString(),
      freshnessBaseAt: Date.now() - 6000,
      autoPasteEligible: true
    })
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions()
    state.latest = first
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ overrideDismissed: true })
    await nextTick()
    await Promise.resolve()

    expect(clipboardOptions.lastTextAttachmentSource).toBe('manual')

    state.latest = second
    hook.handlePaste({ attemptAutoFill: true, triggerSearch: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe('')
    expect(clipboardOptions.pendingAutoFillItem).toBeNull()
    hook.cleanup()
  })

  it('does not inline a different long text after a previous attachment', async () => {
    const first = createClipboardItem({
      id: 28,
      content: 'first long text '.repeat(8),
      autoPasteEligible: false
    })
    const second = createClipboardItem({
      id: 29,
      content: 'second long text '.repeat(8),
      timestamp: new Date(Date.now() + 1000).toISOString(),
      autoPasteEligible: false
    })
    const boxOptions = createBoxOptions()
    const clipboardOptions = createClipboardOptions()
    state.latest = first
    const searchVal = ref('')

    const hook = useClipboard(boxOptions, clipboardOptions, vi.fn(), searchVal)
    hook.handlePaste({ overrideDismissed: true })
    await nextTick()
    await Promise.resolve()

    const firstIdentity = clipboardOptions.lastTextAttachmentIdentity
    state.latest = second
    hook.handlePaste({ overrideDismissed: true })
    await nextTick()
    await Promise.resolve()

    expect(searchVal.value).toBe('')
    expect(clipboardOptions.last?.id).toBe(29)
    expect(clipboardOptions.lastTextAttachmentIdentity).not.toBe(firstIdentity)
    expect(clipboardOptions.lastTextAttachmentSource).toBe('manual')
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
