// @vitest-environment jsdom
import type { TuffItem } from '@talex-touch/utils'
import { ClipboardEvents, CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { onBeforeUnmount } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COREBOX_PRIMARY_ACTION_ID } from '../../../../../../shared/events/corebox-scenes'
import {
  clearCoreBoxFooterFeedback,
  useCoreBoxFooterFeedback
} from '../../meta-actions/footer-feedback'
import { COREBOX_META_ACTION_EVENT } from '../../meta-actions/meta-action-model'
import { useActionPanel } from './useActionPanel'

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>(),
  send: vi.fn(),
  showInFolder: vi.fn(),
  openApp: vi.fn(),
  openExternal: vi.fn(),
  refreshSearch: vi.fn(),
  logError: vi.fn()
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

vi.mock('@talex-touch/utils/renderer', () => ({
  useAppSdk: () => ({
    showInFolder: state.showInFolder,
    openApp: state.openApp,
    openExternal: state.openExternal
  })
}))

vi.mock('vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue')>()
  return {
    ...actual,
    onMounted: vi.fn(),
    onBeforeUnmount: vi.fn()
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key
  })
}))

vi.mock('~/utils/dev-log', () => ({
  devLog: vi.fn()
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: state.logError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}))

function createItem(overrides: Partial<TuffItem> = {}): TuffItem {
  return {
    id: 'item-1',
    kind: 'app',
    source: {
      id: 'app-provider',
      type: 'system',
      name: 'Applications'
    },
    render: {
      basic: {
        title: 'CC Switch 2',
        subtitle: 'App'
      }
    },
    meta: {
      app: {
        path: '/Applications/CC Switch 2.app'
      }
    },
    ...overrides
  } as TuffItem
}

function getListener(event: { toEventName?: () => string } | string): (payload?: unknown) => void {
  const key = typeof event === 'string' ? event : event.toEventName?.() || String(event)
  const listener = state.listeners.get(key)
  expect(listener).toBeTypeOf('function')
  return listener!
}

async function flushAsyncAction(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

const footerFeedback = useCoreBoxFooterFeedback()

/** `onBeforeUnmount` is mocked, so each case's window listener is removed here by hand. */
function unmountActionPanels(): void {
  for (const [cleanup] of vi.mocked(onBeforeUnmount).mock.calls) cleanup()
}

describe('useActionPanel MetaOverlay item action bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.listeners.clear()
    state.send.mockResolvedValue(undefined)
    clearCoreBoxFooterFeedback()
  })

  afterEach(() => {
    unmountActionPanels()
  })

  it('copies the selected item title with the clipboard write payload shape', async () => {
    useActionPanel()

    getListener(CoreBoxEvents.metaOverlay.itemAction)({
      actionId: 'copy-title',
      item: createItem()
    })
    await flushAsyncAction()

    expect(state.send).toHaveBeenCalledWith(ClipboardEvents.write, {
      type: 'text',
      value: 'CC Switch 2'
    })
    // CoreBox mounts no toast host, so the footer is where a copy is confirmed.
    expect(footerFeedback.value).toMatchObject({ tone: 'success', message: '已复制' })
  })

  it('routes MetaOverlay pin actions through the renderer toggle-pin request', async () => {
    state.send.mockImplementation(async (event: unknown) => {
      if (event === CoreBoxEvents.item.togglePin) {
        return { success: true, isPinned: true }
      }
      return undefined
    })
    useActionPanel({ refreshSearch: state.refreshSearch })
    const item = createItem({ meta: {} })

    getListener(CoreBoxEvents.metaOverlay.itemAction)({
      actionId: 'toggle-pin',
      item
    })
    await flushAsyncAction()

    expect(state.send).toHaveBeenCalledWith(CoreBoxEvents.item.togglePin, {
      sourceId: 'app-provider',
      itemId: 'item-1',
      sourceType: 'system'
    })
    expect(item.meta?.pinned?.isPinned).toBe(true)
    expect(state.refreshSearch).toHaveBeenCalledTimes(1)
    expect(footerFeedback.value).toMatchObject({ tone: 'success', message: '已固定' })
  })

  it('reports a failed pin in the footer as an error', async () => {
    state.send.mockImplementation(async (event: unknown) => {
      if (event === CoreBoxEvents.item.togglePin) return { success: false, error: 'nope' }
      return undefined
    })
    useActionPanel()

    getListener(CoreBoxEvents.metaOverlay.itemAction)({
      actionId: 'toggle-pin',
      item: createItem()
    })
    await flushAsyncAction()

    expect(footerFeedback.value).toMatchObject({ tone: 'error', message: '固定失败' })
  })

  it('executes item open actions through the app sdk instead of falling back to default execute', async () => {
    useActionPanel()

    getListener(CoreBoxEvents.metaOverlay.itemAction)({
      actionId: 'open',
      item: createItem({
        actions: [
          {
            id: 'open',
            type: 'open',
            label: 'Open',
            payload: { path: '/Applications/CC Switch 2.app' }
          }
        ]
      })
    })
    await flushAsyncAction()

    expect(state.openApp).toHaveBeenCalledWith({ path: '/Applications/CC Switch 2.app' })
    expect(state.send).not.toHaveBeenCalledWith(CoreBoxEvents.item.execute, expect.anything())
  })

  /**
   * The path stays `/intelligence/channels` even though the page now lives under
   * `/setting/intelligence/channels`: it is an allow-listed constant that the host compares
   * byte-for-byte against what the plugin declared (`plugin-business-capabilities.ts`
   * `FIXED_WIDGET_NAVIGATION`), and plugins are installed into the user data directory, so older
   * copies keep sending the old string. The router redirects it; the action panel forwards it
   * untouched, which is what this asserts.
   */
  it('routes the declared intelligence recovery action without executing the plugin item', async () => {
    const navigate = vi.fn()
    const actionPanel = useActionPanel({ navigate })
    const item = createItem({
      actions: [
        {
          id: 'open-intelligence-settings',
          type: 'navigate',
          label: 'Check AI channels',
          payload: { path: '/intelligence/channels' }
        }
      ]
    })

    await actionPanel.executeAction('open-intelligence-settings', item)

    expect(navigate).toHaveBeenCalledWith('/intelligence/channels')
    expect(state.send).not.toHaveBeenCalledWith(CoreBoxEvents.item.execute, expect.anything())
  })

  it('passes actionId when routing execute item actions', async () => {
    useActionPanel()
    const item = createItem({
      actions: [
        {
          id: 'run-custom-action',
          type: 'execute',
          label: 'Run Action'
        }
      ]
    })

    getListener(CoreBoxEvents.metaOverlay.itemAction)({
      actionId: 'run-custom-action',
      item
    })
    await flushAsyncAction()

    expect(state.send).toHaveBeenCalledWith(CoreBoxEvents.item.execute, {
      item: JSON.parse(JSON.stringify(item)),
      actionId: 'run-custom-action'
    })
  })

  it('applies returned activation state after execute item actions', async () => {
    const onActivationState = vi.fn()
    const activationState = [
      {
        id: 'plugin-features',
        meta: {
          pluginName: 'touch-intelligence',
          featureId: 'intelligence-ask',
          feature: createItem({
            id: 'touch-intelligence/intelligence-ask/result',
            kind: 'widget'
          })
        }
      }
    ]
    state.send.mockResolvedValue(activationState)
    useActionPanel({ onActivationState })
    const item = createItem({
      actions: [
        {
          id: 'copy-answer',
          type: 'execute',
          label: 'Copy Answer'
        }
      ]
    })

    getListener(CoreBoxEvents.metaOverlay.itemAction)({
      actionId: 'copy-answer',
      item
    })
    await flushAsyncAction()

    expect(onActivationState).toHaveBeenCalledWith(activationState)
  })

  it('preserves object activations returned inside activeProviders', async () => {
    const onActivationState = vi.fn()
    const widgetFeature = createItem({
      id: 'touch-intelligence/intelligence-ask/result',
      kind: 'widget'
    })
    const activationState = {
      activeProviders: [
        {
          id: 'plugin-features',
          meta: {
            pluginName: 'touch-intelligence',
            featureId: 'intelligence-ask',
            feature: widgetFeature
          }
        }
      ]
    }
    state.send.mockResolvedValue(activationState)
    useActionPanel({ onActivationState })
    const item = createItem({
      actions: [
        {
          id: 'copy-answer',
          type: 'execute',
          label: 'Copy Answer'
        }
      ]
    })

    getListener(CoreBoxEvents.metaOverlay.itemAction)({
      actionId: 'copy-answer',
      item
    })
    await flushAsyncAction()

    expect(onActivationState).toHaveBeenCalledWith(activationState.activeProviders)
  })

  it('runs the primary action through onPrimaryExecute instead of item.execute', async () => {
    const onPrimaryExecute = vi.fn()
    const actionPanel = useActionPanel({ onPrimaryExecute })
    const item = createItem()

    await actionPanel.executeAction(COREBOX_PRIMARY_ACTION_ID, item)

    expect(onPrimaryExecute).toHaveBeenCalledWith(item)
    expect(state.send).not.toHaveBeenCalledWith(CoreBoxEvents.item.execute, expect.anything())
  })

  it('pastes clipboard-history items through the clipboard apply pipeline', async () => {
    useActionPanel()
    const item = createItem({
      id: 'clipboard-42',
      kind: 'text',
      source: { id: 'clipboard-history', type: 'history', name: 'Clipboard History' },
      actions: [{ id: 'paste', type: 'execute', label: 'Paste' }],
      meta: { raw: { id: 42 } }
    })

    getListener(CoreBoxEvents.metaOverlay.itemAction)({ actionId: 'paste', item })
    await flushAsyncAction()

    expect(state.send).toHaveBeenCalledWith(ClipboardEvents.apply, { id: 42, autoPaste: true })
    expect(state.send).not.toHaveBeenCalledWith(CoreBoxEvents.item.execute, expect.anything())
  })

  it('copies clipboard-history items without auto-paste', async () => {
    useActionPanel()
    const item = createItem({
      id: 'clipboard-7',
      kind: 'text',
      source: { id: 'clipboard-history', type: 'history', name: 'Clipboard History' },
      actions: [{ id: 'copy', type: 'copy', label: 'Copy' }],
      meta: { raw: { id: 7 } }
    })

    getListener(CoreBoxEvents.metaOverlay.itemAction)({ actionId: 'copy', item })
    await flushAsyncAction()

    expect(state.send).toHaveBeenCalledWith(ClipboardEvents.apply, { id: 7, autoPaste: false })
    expect(footerFeedback.value).toMatchObject({ tone: 'success', message: '已复制' })
  })

  it('runs a shortcut from the result list through the same action pipeline', async () => {
    useActionPanel()
    const item = createItem()

    window.dispatchEvent(
      new CustomEvent(COREBOX_META_ACTION_EVENT, { detail: { actionId: 'copy-title', item } })
    )
    await flushAsyncAction()

    expect(state.send).toHaveBeenCalledWith(ClipboardEvents.write, {
      type: 'text',
      value: 'CC Switch 2'
    })
    expect(footerFeedback.value).toMatchObject({ tone: 'success', message: '已复制' })
  })

  it('stops running result-list shortcuts once CoreBox unmounts it', async () => {
    useActionPanel()
    unmountActionPanels()

    window.dispatchEvent(
      new CustomEvent(COREBOX_META_ACTION_EVENT, {
        detail: { actionId: 'copy-title', item: createItem() }
      })
    )
    await flushAsyncAction()

    expect(state.send).not.toHaveBeenCalled()
  })

  it('reveals an app in its folder rather than opening it, which would launch it', async () => {
    useActionPanel()

    getListener(CoreBoxEvents.metaOverlay.itemAction)({
      actionId: 'reveal-in-finder',
      item: createItem()
    })
    await flushAsyncAction()

    expect(state.showInFolder).toHaveBeenCalledExactlyOnceWith('/Applications/CC Switch 2.app', {
      reveal: true
    })
  })

  it('keeps opening the containing folder', async () => {
    useActionPanel()
    const item = createItem({
      kind: 'file',
      meta: { file: { path: '/Users/me/report.pdf' } },
      actions: [
        { id: 'open-folder', type: 'open', label: 'Open Folder', payload: { path: '/Users/me' } }
      ]
    })

    getListener(CoreBoxEvents.metaOverlay.itemAction)({ actionId: 'open-folder', item })
    await flushAsyncAction()

    // No reveal flag: a plain folder opens.
    expect(state.showInFolder).toHaveBeenCalledExactlyOnceWith('/Users/me')
  })

  /** Every microtask, so a rejection the handler failed to catch has surfaced by then. */
  function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('says in the footer that a panel action failed, instead of rejecting unhandled', async () => {
    state.showInFolder.mockRejectedValueOnce(new Error('SYSTEM_SHELL_PATH_UNAVAILABLE'))
    useActionPanel()

    getListener(CoreBoxEvents.metaOverlay.itemAction)({
      actionId: 'reveal-in-finder',
      item: createItem()
    })
    await settle()

    expect(footerFeedback.value).toMatchObject({ tone: 'error', message: '操作失败' })
    expect(state.logError).toHaveBeenCalledExactlyOnceWith('Action failed', {
      actionId: 'reveal-in-finder',
      code: undefined
    })
  })

  it('reports a failed result-list shortcut the same way, logging its code but never the error', async () => {
    const denied = Object.assign(new Error('Cannot copy from /Users/me/secret.txt'), {
      code: 'CLIPBOARD_WRITE_DENIED'
    })
    state.send.mockImplementation(async (event: unknown) => {
      if (event === ClipboardEvents.write) throw denied
      return undefined
    })
    useActionPanel()

    window.dispatchEvent(
      new CustomEvent(COREBOX_META_ACTION_EVENT, {
        detail: { actionId: 'copy-title', item: createItem() }
      })
    )
    await settle()

    expect(footerFeedback.value).toMatchObject({ tone: 'error', message: '操作失败' })
    expect(state.logError).toHaveBeenCalledExactlyOnceWith('Action failed', {
      actionId: 'copy-title',
      code: 'CLIPBOARD_WRITE_DENIED'
    })
    expect(JSON.stringify(state.logError.mock.calls)).not.toContain('/Users/me')
  })
})
