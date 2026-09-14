// @vitest-environment jsdom
import type { TuffItem } from '@talex-touch/utils'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import MetaOverlay from './MetaOverlay.vue'

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => void>(),
  send: vi.fn(),
  logError: vi.fn()
}))

function keyOf(event: { toEventName?: () => string } | string): string {
  return typeof event === 'string' ? event : event.toEventName?.() || String(event)
}

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

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback ?? key
  })
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: state.logError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: { template: '<span />' }
}))

vi.mock('~/components/meta/MetaActionItem.vue', () => ({
  default: {
    props: ['action', 'active'],
    emits: ['click'],
    template:
      '<button type="button" class="meta-action" @click="$emit(\'click\')">{{ action.render.basic.title }}</button>'
  }
}))

function listener(event: { toEventName: () => string }): (payload?: unknown) => void {
  const registered = state.listeners.get(event.toEventName())
  expect(registered).toBeTypeOf('function')
  return registered!
}

const item = {
  id: 'app-1',
  kind: 'app',
  source: { id: 'apps', type: 'application' },
  render: { basic: { title: 'App' } }
} as TuffItem

const generalAction = {
  id: 'open-destination:settings-general',
  render: { basic: { title: '通用' }, group: '常用设置' }
}
const appearanceAction = {
  id: 'open-destination:settings-appearance',
  render: { basic: { title: '外观' }, group: '常用设置' }
}

function show(actions: unknown[]): void {
  listener(MetaOverlayEvents.ui.show)({
    item,
    builtinActions: actions,
    itemActions: [],
    pluginActions: []
  })
}

/** `send` for the legacy action channel stays pending, as it does until its response timeout. */
function stallActionExecute(): PromiseWithResolvers<unknown> {
  const pending = Promise.withResolvers<unknown>()
  state.send.mockImplementation((event: { toEventName?: () => string } | string) =>
    keyOf(event) === MetaOverlayEvents.action.execute.toEventName()
      ? pending.promise
      : Promise.resolve(undefined)
  )
  return pending
}

function dispatchedActionIds(): unknown[] {
  return state.send.mock.calls
    .filter(
      ([event]) =>
        keyOf(event as { toEventName?: () => string }) ===
        MetaOverlayEvents.action.execute.toEventName()
    )
    .map(([, payload]) => (payload as { actionId?: unknown })?.actionId)
}

function searchBoxValue(wrapper: ReturnType<typeof mount>): string {
  return (wrapper.get('input.SearchInput').element as HTMLInputElement).value
}

function sendsFor(event: { toEventName: () => string }): unknown[][] {
  return state.send.mock.calls.filter(
    ([sent]) => keyOf(sent as { toEventName?: () => string }) === event.toEventName()
  )
}

describe('MetaOverlay action dispatch lock', () => {
  beforeEach(() => {
    state.listeners.clear()
    state.send.mockReset()
    state.logError.mockReset()
  })

  it('dispatches the next action on a reopened panel while the first request is still stalled', async () => {
    stallActionExecute()
    const wrapper = mount(MetaOverlay)

    show([generalAction, appearanceAction])
    await nextTick()
    const buttons = wrapper.findAll('.meta-action')
    expect(buttons).toHaveLength(2)

    await buttons[0].trigger('click')
    // Hiding must not wait on the request: the channel answers (or times out) long after the panel
    // is gone, and a dispatch that is awaited before the hide leaves the overlay on screen.
    expect(wrapper.find('.MetaOverlay').exists()).toBe(false)
    expect(dispatchedActionIds()).toEqual(['open-destination:settings-general'])
    expect(state.send).toHaveBeenCalledWith(MetaOverlayEvents.action.execute, {
      actionId: 'open-destination:settings-general',
      itemId: 'app-1',
      item
    })

    // Reopening must accept the next action while the first request is still outstanding. A lock
    // held until the channel replies makes every action on the reopened panel inert.
    show([generalAction, appearanceAction])
    await nextTick()
    await wrapper.findAll('.meta-action')[1].trigger('click')

    expect(wrapper.find('.MetaOverlay').exists()).toBe(false)
    expect(dispatchedActionIds()).toEqual([
      'open-destination:settings-general',
      'open-destination:settings-appearance'
    ])

    wrapper.unmount()
  })

  it('does not let a late action response clobber the reopened panel', async () => {
    const pending = stallActionExecute()
    const wrapper = mount(MetaOverlay)

    show([generalAction, appearanceAction])
    await nextTick()
    await wrapper.findAll('.meta-action')[0].trigger('click')

    show([generalAction, appearanceAction])
    await nextTick()
    await wrapper.get('input.SearchInput').setValue('外观')
    expect(searchBoxValue(wrapper)).toBe('外观')

    // The stalled request finally answers. That completion belongs to a click that is long gone;
    // clearing the search state when it lands wipes whatever the user typed in the panel they are
    // looking at now, which is what the old `await` + `finally` handler did.
    pending.resolve({ success: true })
    await nextTick()
    await nextTick()
    expect(searchBoxValue(wrapper)).toBe('外观')

    wrapper.unmount()
  })
})

/**
 * The payload crosses a real structured-clone boundary on its way to main. Keeping the shown item
 * in a deep `ref` would put a Vue reactive Proxy on `item`, and the runtime rejects Proxies with a
 * DataCloneError; the `structuredClone` call below is what reddens when that regression returns.
 */
describe('MetaOverlay action payload cloneability', () => {
  beforeEach(() => {
    state.listeners.clear()
    state.send.mockReset()
    state.logError.mockReset()
  })

  it('sends a structured-cloneable payload carrying the shown item and action ids', async () => {
    state.send.mockResolvedValue({ success: true })
    const wrapper = mount(MetaOverlay)

    show([generalAction])
    await nextTick()

    await wrapper.get('.meta-action').trigger('click')
    const executed = sendsFor(MetaOverlayEvents.action.execute)
    expect(executed).toHaveLength(1)

    const payload = executed[0][1] as {
      actionId: string
      itemId: string
      item: TuffItem
    }
    expect(payload.actionId).toBe('open-destination:settings-general')
    expect(payload.itemId).toBe('app-1')
    expect(payload.item).toEqual(item)

    // Clone the whole outbound value, not just the id fields: a Proxy anywhere in it throws here.
    expect(structuredClone(payload)).toEqual({
      actionId: 'open-destination:settings-general',
      itemId: 'app-1',
      item
    })

    wrapper.unmount()
  })
})

/**
 * Main holds the first show until this renderer announces readiness, and flushes it the moment the
 * announcement arrives. Announcing before the `ui.show` listener exists reproduces the packaged
 * blank-overlay race inside this component, so the ordering is pinned by simulating that flush.
 */
describe('MetaOverlay renderer readiness announcement', () => {
  beforeEach(() => {
    state.listeners.clear()
    state.send.mockReset()
    state.logError.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })
  it('announces readiness on mount, after its show listener is registered', async () => {
    state.send.mockImplementation((event: { toEventName?: () => string } | string) => {
      if (keyOf(event) === MetaOverlayEvents.ui.ready.toEventName()) {
        state.listeners.get(MetaOverlayEvents.ui.show.toEventName())?.({
          item,
          builtinActions: [generalAction, appearanceAction],
          itemActions: [],
          pluginActions: []
        })
      }
      return Promise.resolve({ accepted: true })
    })

    const wrapper = mount(MetaOverlay)
    await nextTick()

    const announcements = sendsFor(MetaOverlayEvents.ui.ready)
    expect(announcements).toHaveLength(1)
    // Void payload: the renderer identifies itself through the transport sender, never by an id.
    expect(announcements[0]).toHaveLength(1)
    expect(wrapper.findAll('.meta-action')).toHaveLength(2)

    wrapper.unmount()
  })

  it('retries a rejected announcement and receives the queued main-process show', async () => {
    let readyAttempts = 0
    state.send.mockImplementation((event: { toEventName?: () => string } | string) => {
      if (keyOf(event) !== MetaOverlayEvents.ui.ready.toEventName()) {
        return Promise.resolve(undefined)
      }
      readyAttempts += 1
      if (readyAttempts === 1) return Promise.reject(new Error('channel closed'))
      state.listeners.get(MetaOverlayEvents.ui.show.toEventName())?.({
        item,
        builtinActions: [generalAction],
        itemActions: [],
        pluginActions: []
      })
      return Promise.resolve({ accepted: true })
    })

    const wrapper = mount(MetaOverlay)
    await nextTick()
    await Promise.resolve()
    expect(state.logError).toHaveBeenCalled()
    expect(wrapper.findAll('.meta-action')).toHaveLength(0)

    await vi.runAllTimersAsync()
    await nextTick()
    expect(sendsFor(MetaOverlayEvents.ui.ready)).toHaveLength(2)
    expect(wrapper.findAll('.meta-action')).toHaveLength(1)

    wrapper.unmount()
  })
})
