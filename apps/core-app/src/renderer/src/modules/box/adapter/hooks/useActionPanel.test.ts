import type { TuffItem } from '@talex-touch/utils'
import { ClipboardEvents, CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useActionPanel } from './useActionPanel'

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>(),
  send: vi.fn(),
  showInFolder: vi.fn(),
  openApp: vi.fn(),
  openExternal: vi.fn(),
  refreshSearch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
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

vi.mock('vue-sonner', () => ({
  toast: {
    success: state.toastSuccess,
    error: state.toastError
  }
}))

vi.mock('~/utils/dev-log', () => ({
  devLog: vi.fn()
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

describe('useActionPanel MetaOverlay item action bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.listeners.clear()
    state.send.mockResolvedValue(undefined)
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
    expect(state.toastSuccess).toHaveBeenCalledWith('已复制')
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

  it('routes item navigate actions through the provided navigation callback', async () => {
    const navigate = vi.fn()
    useActionPanel({ navigate })

    getListener(CoreBoxEvents.metaOverlay.itemAction)({
      actionId: 'open-settings',
      item: createItem({
        actions: [
          {
            id: 'open-settings',
            type: 'navigate',
            label: 'Open settings',
            payload: { path: '/settings/plugins' }
          }
        ]
      })
    })
    await flushAsyncAction()

    expect(navigate).toHaveBeenCalledWith('/settings/plugins')
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
})
