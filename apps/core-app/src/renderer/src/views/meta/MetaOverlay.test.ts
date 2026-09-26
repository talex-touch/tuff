// @vitest-environment jsdom
import type { TuffItem } from '@talex-touch/utils'
import type { MetaShowRequest } from '@talex-touch/utils/transport/events/types/meta-overlay'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { buildMetaShowRequest } from '~/modules/box/meta-actions/meta-action-model'
import MetaOverlay from './MetaOverlay.vue'

const state = vi.hoisted(() => ({
  listeners: new Map<string, (payload?: unknown) => unknown>(),
  send: vi.fn(),
  logError: vi.fn()
}))

function keyOf(event: { toEventName?: () => string } | string): string {
  return typeof event === 'string' ? event : event.toEventName?.() || String(event)
}

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: (
      event: { toEventName?: () => string } | string,
      callback: (payload?: unknown) => unknown
    ) => {
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

// Windows: Ctrl is the command key, and the reveal is named after File Explorer.
vi.mock('~/modules/platform/renderer-platform', () => ({
  getCurrentRendererPlatformState: () => ({
    platform: 'win32',
    isMac: false,
    isWindows: true,
    isLinux: false
  })
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: { template: '<span />' }
}))

vi.mock('~/components/meta/MetaActionItem.vue', () => ({
  default: {
    props: ['label', 'subtitle', 'glyph', 'icon', 'shortcuts', 'active', 'disabled', 'danger'],
    emits: ['run', 'hover'],
    template: `<button type="button" class="meta-action" :aria-selected="active"
        @click="$emit('run')" @pointermove="$emit('hover')">
        <span class="meta-action-label">{{ label }}</span>
        <span v-if="subtitle" class="meta-action-subtitle">{{ subtitle }}</span>
        <kbd v-for="shortcut in shortcuts" :key="shortcut">{{ shortcut }}</kbd>
      </button>`
  }
}))

function listener(event: { toEventName: () => string }): (payload?: unknown) => unknown {
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

const FILE_ITEM = {
  id: '/Users/me/report.pdf',
  kind: 'file',
  source: { type: 'file', id: 'file-provider', name: 'Files' },
  render: { mode: 'default', basic: { title: 'report.pdf' } },
  actions: [
    { id: 'open-file', type: 'open', label: 'Open', primary: true, payload: { path: '/x' } },
    { id: 'open-folder', type: 'open', label: 'Open Folder', payload: { path: '/Users/me' } },
    { id: 'file-copy-path', type: 'copy', label: 'Copy Path', payload: { text: '/x' } }
  ],
  meta: { file: { path: '/Users/me/report.pdf' } }
} as TuffItem

function show(actions: unknown[]): void {
  listener(MetaOverlayEvents.ui.show)({
    item,
    builtinActions: actions,
    itemActions: [],
    pluginActions: []
  })
}

function showRequest(request: MetaShowRequest): void {
  listener(MetaOverlayEvents.ui.show)(request)
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

/**
 * The Raycast-style panel (R1–R6): the item in a header, grouped single-line rows, the filter at
 * the bottom, anchored bottom-right over a light dim.
 */
describe('MetaOverlay panel', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>
  // Unmounted after each case even when it fails, so a leaked panel's window key listener cannot
  // answer the next case's keys.
  const mounted = new Set<VueWrapper>()

  function mountPanel(): VueWrapper {
    const wrapper = mount(MetaOverlay, { attachTo: document.body })
    mounted.add(wrapper)
    return wrapper
  }

  function unmountPanel(wrapper: VueWrapper): void {
    if (!mounted.delete(wrapper)) return
    wrapper.unmount()
  }

  beforeEach(() => {
    state.listeners.clear()
    state.send.mockReset()
    state.send.mockResolvedValue(undefined)
    state.logError.mockReset()
    // jsdom has no layout, so it has no scrollIntoView either.
    scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView as unknown as Element['scrollIntoView']
  })

  afterEach(() => {
    for (const wrapper of [...mounted]) unmountPanel(wrapper)
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  async function openFilePanel(anchor: 'footer' | 'corner' = 'footer') {
    const wrapper = mountPanel()
    showRequest({ ...buildMetaShowRequest(FILE_ITEM), anchor, desiredPanelHeight: 400 })
    await nextTick()
    await nextTick()
    return wrapper
  }

  function rowLabels(wrapper: ReturnType<typeof mount>): string[] {
    return wrapper.findAll('.meta-action-label').map((label) => label.text())
  }

  function activeLabel(wrapper: ReturnType<typeof mount>): string | undefined {
    return wrapper.find('.meta-action[aria-selected="true"] .meta-action-label')?.text()
  }

  function keydown(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })
    window.dispatchEvent(event)
    return event
  }

  it('shows the item in a header, the rows grouped in order, and the filter at the bottom', async () => {
    const wrapper = await openFilePanel()

    expect(wrapper.get('.MetaPanel-HeaderTitle').text()).toBe('report.pdf')
    expect(rowLabels(wrapper)).toEqual([
      'corebox.actions.open',
      'corebox.actions.revealInExplorer',
      'corebox.actions.openFolder',
      'corebox.actions.copyPath',
      'corebox.actions.copyTitle',
      'corebox.actions.pin',
      'corebox.actions.flowTransfer'
    ])
    expect(wrapper.findAll('.MetaPanel-SectionTitle').map((title) => title.text())).toEqual([
      'corebox.actions.groups.open',
      'corebox.actions.groups.copy',
      'corebox.actions.groups.organize',
      'corebox.actions.groups.flow'
    ])
    const panel = wrapper.get('.MetaPanel').element
    expect(panel.lastElementChild?.classList.contains('MetaPanel-Filter')).toBe(true)
    // The ↵ row does not repeat "打开 "report.pdf"": the header already names the item.
    expect(wrapper.findAll('.meta-action-subtitle')).toHaveLength(0)

    unmountPanel(wrapper)
  })

  it('badges each row with its key, including the secondary’s two', async () => {
    const wrapper = await openFilePanel()
    const keysOf = (label: string) =>
      wrapper
        .findAll('.meta-action')
        .find((row) => row.get('.meta-action-label').text() === label)
        ?.findAll('kbd')
        .map((kbd) => kbd.text())

    expect(keysOf('corebox.actions.open')).toEqual(['↵'])
    expect(keysOf('corebox.actions.revealInExplorer')).toEqual(['Ctrl+↵', 'Ctrl+O'])
    expect(keysOf('corebox.actions.copyPath')).toEqual(['Ctrl+Shift+C'])
    expect(keysOf('corebox.actions.copyTitle')).toEqual(['Ctrl+Alt+C'])
    // Ctrl+. is a Chinese IME's punctuation toggle on Windows and Linux.
    expect(keysOf('corebox.actions.pin')).toEqual(['Ctrl+Shift+.'])

    unmountPanel(wrapper)
  })

  it('anchors above the footer, or in the corner, over a dim with no blur', async () => {
    const footer = await openFilePanel('footer')
    const overlay = footer.get('.MetaOverlay').element as HTMLElement
    expect(overlay.style.getPropertyValue('--meta-panel-bottom')).toBe('52px')
    expect(overlay.style.getPropertyValue('--meta-panel-right')).toBe('12px')
    unmountPanel(footer)

    const corner = await openFilePanel('corner')
    expect(
      (corner.get('.MetaOverlay').element as HTMLElement).style.getPropertyValue(
        '--meta-panel-bottom'
      )
    ).toBe('12px')
    unmountPanel(corner)
  })

  it('starts on the primary row and moves with the arrows, wrapping, scrolling it into view', async () => {
    const wrapper = await openFilePanel()
    const input = wrapper.get('input.SearchInput')

    expect(activeLabel(wrapper)).toBe('corebox.actions.open')
    expect(input.attributes('aria-activedescendant')).toBe('meta-panel-list-option-0')

    keydown('ArrowDown')
    await nextTick()
    await nextTick()
    expect(activeLabel(wrapper)).toBe('corebox.actions.revealInExplorer')
    expect(input.attributes('aria-activedescendant')).toBe('meta-panel-list-option-1')
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', behavior: 'instant' })

    keydown('ArrowUp')
    keydown('ArrowUp')
    await nextTick()
    expect(activeLabel(wrapper)).toBe('corebox.actions.flowTransfer')

    unmountPanel(wrapper)
  })

  it('runs the active row on Enter, the secondary on Mod↵, and a row from its chord', async () => {
    const wrapper = await openFilePanel()

    keydown('Enter')
    expect(dispatchedActionIds()).toEqual(['__corebox_primary__'])

    showRequest({ ...buildMetaShowRequest(FILE_ITEM), anchor: 'footer' })
    await nextTick()
    keydown('Enter', { ctrlKey: true, code: 'Enter' })
    expect(dispatchedActionIds().at(-1)).toBe('reveal-in-finder')

    showRequest({ ...buildMetaShowRequest(FILE_ITEM), anchor: 'footer' })
    await nextTick()
    const chord = keydown('C', { ctrlKey: true, shiftKey: true, code: 'KeyC' })
    expect(chord.defaultPrevented).toBe(true)
    expect(dispatchedActionIds().at(-1)).toBe('file-copy-path')

    unmountPanel(wrapper)
  })

  it('pins on the key its badge shows, and leaves Ctrl+. to the IME', async () => {
    const wrapper = await openFilePanel()

    const bare = keydown('.', { ctrlKey: true, code: 'Period' })
    expect(bare.defaultPrevented).toBe(false)
    expect(dispatchedActionIds()).toEqual([])

    const pin = keydown('>', { ctrlKey: true, shiftKey: true, code: 'Period' })
    expect(pin.defaultPrevented).toBe(true)
    expect(dispatchedActionIds()).toEqual(['toggle-pin'])

    unmountPanel(wrapper)
  })

  it('swallows an auto-repeated Enter instead of running a row with it', async () => {
    const wrapper = await openFilePanel()

    // A press that began before the panel had focus keeps repeating into it.
    const repeat = keydown('Enter', { repeat: true })

    expect(repeat.defaultPrevented).toBe(true)
    expect(dispatchedActionIds()).toEqual([])

    keydown('Enter')
    expect(dispatchedActionIds()).toEqual(['__corebox_primary__'])

    unmountPanel(wrapper)
  })

  it('leaves Ctrl+C to the filter field', async () => {
    const wrapper = await openFilePanel()

    const copy = keydown('c', { ctrlKey: true, code: 'KeyC' })

    expect(copy.defaultPrevented).toBe(false)
    expect(dispatchedActionIds()).toEqual([])

    unmountPanel(wrapper)
  })

  it('leaves arrows and Enter to the IME while it composes', async () => {
    const wrapper = await openFilePanel()
    const input = wrapper.get('input.SearchInput')

    await input.trigger('compositionstart')
    keydown('ArrowDown')
    keydown('Enter')
    await nextTick()
    expect(activeLabel(wrapper)).toBe('corebox.actions.open')
    expect(dispatchedActionIds()).toEqual([])

    // The Enter that commits a candidate still arrives flagged as composing.
    await input.trigger('compositionend')
    keydown('Enter', { isComposing: true })
    expect(dispatchedActionIds()).toEqual([])

    keydown('ArrowDown')
    await nextTick()
    expect(activeLabel(wrapper)).toBe('corebox.actions.revealInExplorer')

    unmountPanel(wrapper)
  })

  it('follows the pointer only when it moves', async () => {
    const wrapper = await openFilePanel()
    const rows = wrapper.findAll('.meta-action')

    await rows[3].trigger('mouseenter')
    expect(activeLabel(wrapper)).toBe('corebox.actions.open')

    await rows[3].trigger('pointermove')
    expect(activeLabel(wrapper)).toBe('corebox.actions.copyPath')
    // Hover never scrolls: the row is already under the pointer.
    expect(scrollIntoView).not.toHaveBeenCalled()

    unmountPanel(wrapper)
  })

  it('closes on Esc and on Ctrl+K', async () => {
    const wrapper = await openFilePanel()

    keydown('Escape')
    keydown('k', { ctrlKey: true, code: 'KeyK' })

    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(2)

    unmountPanel(wrapper)
  })

  it('stays open while Ctrl+K is held: its auto-repeats are swallowed, not toggles', async () => {
    const wrapper = await openFilePanel()

    // The press that opened the panel keeps repeating into it once it has focus.
    const repeat = keydown('k', { ctrlKey: true, code: 'KeyK', repeat: true })

    expect(repeat.defaultPrevented).toBe(true)
    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(0)

    unmountPanel(wrapper)
  })

  it('closes when the dim outside the panel is clicked', async () => {
    const wrapper = await openFilePanel()

    await wrapper.get('.MetaPanel').trigger('click')
    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(0)

    await wrapper.get('.MetaOverlay').trigger('click')
    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(1)

    unmountPanel(wrapper)
  })

  it('filters rows and says so when nothing matches', async () => {
    const wrapper = await openFilePanel()
    const input = wrapper.get('input.SearchInput')

    await input.setValue('copypath')
    expect(rowLabels(wrapper)).toEqual(['corebox.actions.copyPath'])
    expect(activeLabel(wrapper)).toBe('corebox.actions.copyPath')

    await input.setValue('zzz-nothing')
    expect(rowLabels(wrapper)).toEqual([])
    expect(wrapper.get('.MetaPanel-Empty').text()).toBe('corebox.actions.empty')
    keydown('Enter')
    expect(dispatchedActionIds()).toEqual([])

    unmountPanel(wrapper)
  })

  it('shows a subtitle only where two rows would read the same', async () => {
    const wrapper = mountPanel()
    showRequest({
      ...buildMetaShowRequest(item),
      pluginActions: [
        { id: 'share-a', render: { basic: { title: 'Share', subtitle: 'to Notes' } } },
        { id: 'share-b', render: { basic: { title: 'Share', subtitle: 'to Mail' } } },
        { id: 'print', render: { basic: { title: 'Print', subtitle: 'to paper' } } }
      ]
    })
    await nextTick()

    expect(wrapper.findAll('.meta-action-subtitle').map((subtitle) => subtitle.text())).toEqual([
      'to Notes',
      'to Mail'
    ])

    unmountPanel(wrapper)
  })
})
