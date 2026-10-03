// @vitest-environment jsdom
import type { FlowPayload, FlowTargetInfo } from '@talex-touch/utils'
import type { MetaPanelAnchor } from '@talex-touch/utils/transport/events/types/meta-overlay'
import { FlowEvents } from '@talex-touch/utils/transport/events'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import {
  estimateMetaPanelHeight,
  resolveMetaOverlayWindowHeight
} from '../../../../shared/meta-overlay-geometry'
import enUS from '../../modules/lang/en-US.json'
import zhCN from '../../modules/lang/zh-CN.json'
import FlowSelector from './FlowSelector.vue'

const sendMock = vi.fn()

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: sendMock
  })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (!params) return key
      return `${key}:${params.source}->${params.target}`
    }
  })
}))

vi.mock('@talex-touch/tuffex/utils', () => ({
  nextZIndex: vi.fn(() => 1000)
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: ['disabled', 'variant', 'size'],
    emits: ['click'],
    template:
      '<button class="tx-button-stub" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: {
    name: 'TxIcon',
    props: ['icon', 'size'],
    template: '<span class="tx-icon-stub" :data-icon="icon?.value" />'
  }
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn()
  })
}))

type ConsentReply = { allowed: boolean; requiresConfirmation?: boolean }

function flowTarget(
  overrides: Partial<FlowTargetInfo> & Pick<FlowTargetInfo, 'id' | 'name' | 'pluginId'>
): FlowTargetInfo {
  return {
    fullId: `${overrides.pluginId}.${overrides.id}`,
    hasFlowHandler: true,
    isEnabled: true,
    supportedTypes: ['json'],
    ...overrides
  }
}

const confirmTarget: FlowTargetInfo = {
  description: 'Starts a Pomodoro session',
  fullId: 'quickops.start-pomodoro',
  hasFlowHandler: true,
  icon: 'i-ri-timer-line',
  id: 'start-pomodoro',
  isEnabled: true,
  name: 'Start Pomodoro',
  pluginId: 'quickops',
  pluginName: 'QuickOps',
  requireConfirm: true,
  supportedTypes: ['json']
}

const systemInfo = flowTarget({
  id: 'system-info',
  name: 'QuickOps System Info',
  description: 'Returns a read-only local system summary',
  pluginId: 'quickops',
  pluginName: 'QuickOps',
  pluginIcon: 'ri:tools-line',
  icon: 'ri:computer-line'
})
const airDrop = flowTarget({
  id: 'airdrop',
  name: 'AirDrop',
  pluginId: 'system-share',
  pluginName: '系统分享',
  pluginIcon: 'ri:share-forward-line'
})
const stopAll = flowTarget({
  id: 'stop-all',
  name: 'QuickOps Stop All Sessions',
  pluginId: 'quickops',
  pluginName: 'QuickOps',
  icon: 'ri:stop-circle-line',
  requireConfirm: true
})
const notes = flowTarget({
  id: 'notes',
  name: 'Notes',
  pluginId: 'touch-notes',
  adaptationHint: 'Not adapted to Flow yet'
})

const flowPayload = {
  type: 'json',
  data: {
    item: {
      id: 'touch-quickops-writing-sprint',
      source: { type: 'plugin', id: 'plugin-features', name: 'touch-quickops' },
      meta: { pluginName: 'touch-quickops', featureId: 'quickops' }
    },
    query: 'start writing sprint'
  },
  context: {
    sourcePluginId: 'touch-quickops',
    sourceFeatureId: 'quickops'
  }
} satisfies FlowPayload

// Unmounted after each case even when it fails: a leaked panel's window key listener would answer
// the next case's keys.
const mounted = new Set<VueWrapper>()

function createWrapper(
  props: Partial<{ anchor: MetaPanelAnchor; payload: FlowPayload }> = {},
  { realTransition = false }: { realTransition?: boolean } = {}
): VueWrapper {
  const wrapper = mount(FlowSelector, {
    attachTo: document.body,
    // Test Utils stubs Transition, so a card leaves at once and fires none of its hooks.
    global: realTransition ? { stubs: { transition: false } } : undefined,
    props: {
      payload: flowPayload,
      visible: false,
      shouldAnimate: () => false,
      ...props
    }
  })
  mounted.add(wrapper)
  return wrapper
}

/**
 * Holds animation frames until `flush()`. The real Transition runs a leave on them; jsdom loads no
 * SFC styles, so once they run, the leave has no duration and ends on the spot.
 */
function holdAnimationFrames(): { flush: () => void } {
  const pending: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => pending.push(callback))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  return {
    flush() {
      // A frame can ask for the next one: Vue waits two frames before it reads the transition.
      while (pending.length > 0) {
        for (const callback of pending.splice(0)) callback(performance.now())
      }
    }
  }
}

function rooms(wrapper: VueWrapper): unknown[] {
  return (wrapper.emitted('room') ?? []).map(([height]) => height)
}

const innerHeightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight')

/** The height of the CoreBox window the card opens in. */
function setWindowHeight(height: number): void {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

/** Answers the panel's transport calls: `targets` for the list, `consent` for every check. */
function serve(targets: FlowTargetInfo[], consent: ConsentReply = { allowed: true }): void {
  sendMock.mockImplementation(async (event) => {
    if (event === FlowEvents.getTargets) return { success: true, data: targets }
    if (event === FlowEvents.checkConsent) return { success: true, data: consent }
    if (event === FlowEvents.grantConsent) {
      return { success: true, data: { confirmationToken: 'confirm-token' } }
    }
    throw new Error('unexpected transport event')
  })
}

async function showSelector(wrapper: VueWrapper): Promise<void> {
  await wrapper.setProps({ visible: true })
  await nextTick()
  await nextTick()
}

function getTargetItem(): HTMLElement {
  const target = document.body.querySelector<HTMLElement>('.FlowTargetItem')
  expect(target).toBeTruthy()
  return target!
}

async function clickTargetItem(): Promise<void> {
  getTargetItem().click()
  await nextTick()
}

async function clickDialogButton(label: string): Promise<void> {
  const button = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('.tx-button-stub')
  ).find((candidate) => candidate.textContent?.includes(label))
  expect(button).toBeTruthy()
  button!.click()
  await nextTick()
}

/** Dispatched where the key really starts: the focused element, inside the document. */
function keydown(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })
  ;(document.activeElement ?? document.body).dispatchEvent(event)
  return event
}

function rowLabels(): string[] {
  return Array.from(document.body.querySelectorAll('.FlowTargetItem .MetaActionItem-Label')).map(
    (label) => label.textContent?.trim() ?? ''
  )
}

function activeLabel(): string | undefined {
  return (
    document.body
      .querySelector('.FlowTargetItem[aria-selected="true"] .MetaActionItem-Label')
      ?.textContent?.trim() ?? undefined
  )
}

function sendsFor(event: unknown): unknown[][] {
  return sendMock.mock.calls.filter(([sent]) => sent === event)
}

async function typeFilter(value: string): Promise<void> {
  const input = document.body.querySelector<HTMLInputElement>('input.SearchInput')
  expect(input).toBeTruthy()
  input!.value = value
  input!.dispatchEvent(new Event('input'))
  await nextTick()
}

beforeEach(() => {
  sendMock.mockReset()
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount()
  mounted.clear()
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (innerHeightDescriptor) Object.defineProperty(window, 'innerHeight', innerHeightDescriptor)
})

describe('FlowSelector confirmation handling', () => {
  it('opens execution confirmation instead of directly selecting requireConfirm targets', async () => {
    sendMock.mockImplementation(async (event) => {
      if (event === FlowEvents.getTargets) return { success: true, data: [confirmTarget] }
      if (event === FlowEvents.checkConsent) {
        return { success: true, data: { allowed: true, requiresConfirmation: true } }
      }
      throw new Error('unexpected transport event')
    })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    await clickTargetItem()

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(document.body.textContent).toContain('flow.executionConfirmationTitle')
    expect(document.body.textContent).toContain('flow.confirmOnce')
    expect(sendMock).toHaveBeenCalledWith(FlowEvents.checkConsent, {
      senderId: 'touch-quickops',
      targetId: 'quickops.start-pomodoro'
    })
  })

  it('cancels confirmation without granting token or dispatching selection', async () => {
    sendMock.mockImplementation(async (event) => {
      if (event === FlowEvents.getTargets) return { success: true, data: [confirmTarget] }
      if (event === FlowEvents.checkConsent) {
        return { success: true, data: { allowed: true, requiresConfirmation: true } }
      }
      throw new Error('unexpected transport event')
    })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    await clickTargetItem()
    await clickDialogButton('flow.consentDeny')

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(sendMock).not.toHaveBeenCalledWith(FlowEvents.grantConsent, expect.anything())
  })

  it('emits selection with confirmation token after user confirmation', async () => {
    sendMock.mockImplementation(async (event) => {
      if (event === FlowEvents.getTargets) return { success: true, data: [confirmTarget] }
      if (event === FlowEvents.checkConsent) {
        return { success: true, data: { allowed: true, requiresConfirmation: true } }
      }
      if (event === FlowEvents.grantConsent) {
        return { success: true, data: { confirmationToken: 'confirm-token' } }
      }
      throw new Error('unexpected transport event')
    })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    await clickTargetItem()
    await clickDialogButton('flow.confirmOnce')

    expect(sendMock).toHaveBeenCalledWith(FlowEvents.grantConsent, {
      senderId: 'touch-quickops',
      targetId: 'quickops.start-pomodoro',
      mode: 'once'
    })
    expect(wrapper.emitted('select')).toEqual([
      [
        {
          confirmationToken: 'confirm-token',
          consentToken: undefined,
          targetId: 'quickops.start-pomodoro'
        }
      ]
    ])
  })

  it('shows combined authorization and confirmation actions when consent is missing', async () => {
    sendMock.mockImplementation(async (event) => {
      if (event === FlowEvents.getTargets) return { success: true, data: [confirmTarget] }
      if (event === FlowEvents.checkConsent) {
        return { success: true, data: { allowed: false, requiresConfirmation: true } }
      }
      throw new Error('unexpected transport event')
    })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    await clickTargetItem()

    expect(document.body.textContent).toContain('flow.authorizationAndConfirmationTitle')
    expect(document.body.textContent).toContain('flow.allowAndConfirmOnce')
    expect(document.body.textContent).toContain('flow.confirmAndSend')
  })

  it('names the sender in the confirmation, the {source} both bundles use', async () => {
    // The `t` stand-in above reads `source` and `target`; hold the bundles to the same names.
    for (const bundle of [enUS, zhCN]) {
      for (const key of [
        'consentDesc',
        'executionConfirmationDesc',
        'authorizationAndConfirmationDesc'
      ] as const) {
        expect(bundle.flow[key]).toContain('{source}')
        expect(bundle.flow[key]).toContain('{target}')
      }
    }
    serve([stopAll], { allowed: true, requiresConfirmation: true })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    await clickTargetItem()

    expect(
      document.body.querySelector('.FlowSelector-ConfirmDescription')?.textContent?.trim()
    ).toBe('flow.executionConfirmationDesc:touch-quickops->QuickOps')
  })

  it('confirms in the card, focused on the primary button, which Enter runs once', async () => {
    serve([stopAll], { allowed: true, requiresConfirmation: true })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    keydown('Enter')
    await flushPromises()

    // The same card, now the confirmation: no second dialog, no list, no filter.
    expect(document.body.querySelectorAll('.MetaPanel')).toHaveLength(1)
    expect(document.body.querySelector('.FlowTargetItem')).toBeNull()
    expect(document.body.querySelector('input.SearchInput')).toBeNull()
    const primary = document.body.querySelector('.FlowSelector-ConfirmPrimary')
    expect(primary?.textContent).toContain('flow.confirmOnce')
    expect(document.activeElement).toBe(primary)

    // The held Enter that picked the target must not also confirm it.
    expect(keydown('Enter', { repeat: true }).defaultPrevented).toBe(true)
    await flushPromises()
    expect(sendsFor(FlowEvents.grantConsent)).toHaveLength(0)

    keydown('Enter')
    await flushPromises()
    expect(sendsFor(FlowEvents.grantConsent)).toEqual([
      [
        FlowEvents.grantConsent,
        { senderId: 'touch-quickops', targetId: 'quickops.stop-all', mode: 'once' }
      ]
    ])
    expect(wrapper.emitted('select')).toEqual([
      [{ targetId: 'quickops.stop-all', confirmationToken: 'confirm-token' }]
    ])
  })

  it('denies on Escape: back to the list, nothing granted, nothing sent, the panel still open', async () => {
    serve([stopAll, systemInfo], { allowed: true, requiresConfirmation: true })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    keydown('Enter')
    await flushPromises()
    expect(document.body.querySelector('.FlowSelector-Confirm')).toBeTruthy()

    keydown('Escape')
    await flushPromises()

    expect(document.body.querySelector('.FlowSelector-Confirm')).toBeNull()
    expect(rowLabels()).toEqual(['QuickOps Stop All Sessions', 'QuickOps System Info'])
    expect(document.activeElement).toBe(document.body.querySelector('input.SearchInput'))
    expect(sendsFor(FlowEvents.grantConsent)).toHaveLength(0)
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()

    // Denying hands the selection back: the next Enter asks again.
    keydown('Enter')
    await flushPromises()
    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(2)
    expect(document.body.querySelector('.FlowSelector-Confirm')).toBeTruthy()
  })
})

describe('FlowSelector panel', () => {
  it('names the item in the header and groups the targets by plugin, in the order main lists them', async () => {
    serve([systemInfo, airDrop, stopAll, notes])

    const wrapper = createWrapper({
      payload: {
        ...flowPayload,
        data: {
          ...flowPayload.data,
          item: {
            ...flowPayload.data.item,
            render: {
              mode: 'default',
              basic: { title: 'Writing Sprint', icon: 'ri:quill-pen-line' }
            }
          }
        }
      }
    })
    await showSelector(wrapper)

    expect(document.body.querySelector('.MetaPanel-HeaderTitle')?.textContent).toBe(
      'Writing Sprint'
    )
    expect(
      document.body.querySelector('.MetaPanel-Header .tx-icon-stub')?.getAttribute('data-icon')
    ).toBe('i-ri-quill-pen-line')
    expect(document.body.querySelector('.FlowSelector-HeaderMeta')?.textContent).toBe(
      'flow.selectTarget'
    )
    expect(
      Array.from(document.body.querySelectorAll('.MetaPanel-SectionTitle')).map((title) =>
        title.textContent?.trim()
      )
    ).toEqual(['QuickOps', '系统分享', 'touch-notes'])
    expect(rowLabels()).toEqual([
      'QuickOps System Info',
      'QuickOps Stop All Sessions',
      'AirDrop',
      'Notes'
    ])
    // The filter sits at the bottom of the card, and nothing restates the payload.
    expect(document.body.querySelector('.MetaPanel')?.lastElementChild?.className).toContain(
      'MetaPanel-Filter'
    )
    const panelText = document.body.querySelector('.FlowSelector')?.textContent ?? ''
    expect(panelText).not.toContain('start writing sprint')
    expect(panelText).not.toContain('json')
  })

  it('falls back to its own title without an item, and repeats nothing in the header', async () => {
    serve([systemInfo])

    const wrapper = createWrapper({ payload: { type: 'text', data: 'hello' } })
    await showSelector(wrapper)

    expect(document.body.querySelector('.MetaPanel-HeaderTitle')?.textContent).toBe(
      'flow.selectTarget'
    )
    expect(
      document.body.querySelector('.MetaPanel-Header .tx-icon-stub')?.getAttribute('data-icon')
    ).toBe('i-ri-share-forward-line')
    expect(document.body.querySelector('.FlowSelector-HeaderMeta')).toBeNull()
  })

  it('draws each target with its icon as a class, the plugin icon, or the puzzle', async () => {
    serve([systemInfo, airDrop, stopAll, notes])

    const wrapper = createWrapper()
    await showSelector(wrapper)

    const icons = Array.from(document.body.querySelectorAll('.FlowTargetItem .tx-icon-stub')).map(
      (icon) => icon.getAttribute('data-icon')
    )
    expect(icons).toEqual([
      'i-ri-computer-line',
      'i-ri-stop-circle-line',
      'i-ri-share-forward-line',
      'i-ri-puzzle-line'
    ])
    // Only the target that asks for confirmation says so.
    const marks = Array.from(document.body.querySelectorAll('.FlowTargetItem')).map(
      (row) => row.querySelector('.FlowTargetItem-Confirm')?.getAttribute('aria-label') ?? null
    )
    expect(marks).toEqual([null, 'flow.requiresConfirmation', null, null])
    // The adaptation hint stands in for a missing description.
    expect(document.body.textContent).toContain('Not adapted to Flow yet')
  })

  it('anchors above the footer, or in the corner, and closes from the dim only', async () => {
    serve([systemInfo])

    const footer = createWrapper({ anchor: 'footer' })
    await showSelector(footer)
    const root = document.body.querySelector<HTMLElement>('.FlowSelector')!
    expect(root.style.getPropertyValue('--meta-panel-bottom')).toBe('52px')
    expect(root.style.getPropertyValue('--meta-panel-right')).toBe('12px')
    expect(root.style.zIndex).toBe('1000')

    document.body.querySelector<HTMLElement>('.MetaPanel')!.click()
    expect(footer.emitted('close')).toBeUndefined()
    root.click()
    expect(footer.emitted('close')).toHaveLength(1)
    footer.unmount()
    mounted.delete(footer)

    const corner = createWrapper({ anchor: 'corner' })
    await showSelector(corner)
    expect(
      document.body
        .querySelector<HTMLElement>('.FlowSelector')!
        .style.getPropertyValue('--meta-panel-bottom')
    ).toBe('12px')
  })

  it('filters by name, description, plugin or the name’s letters, and says when nothing matches', async () => {
    serve([systemInfo, airDrop, stopAll, notes])

    const wrapper = createWrapper()
    await showSelector(wrapper)

    await typeFilter('airdrop')
    expect(rowLabels()).toEqual(['AirDrop'])
    expect(activeLabel()).toBe('AirDrop')

    await typeFilter('qsysi')
    expect(rowLabels()).toEqual(['QuickOps System Info'])

    await typeFilter('read-only')
    expect(rowLabels()).toEqual(['QuickOps System Info'])

    await typeFilter('系统')
    expect(rowLabels()).toEqual(['AirDrop'])

    await typeFilter('zzz-nothing')
    expect(rowLabels()).toEqual([])
    expect(document.body.querySelector('.MetaPanel-Empty')?.textContent?.trim()).toBe(
      'flow.noTargets'
    )
    keydown('Enter')
    await flushPromises()
    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(0)
  })

  it('never says there are no targets while they load', async () => {
    const pending = Promise.withResolvers<unknown>()
    sendMock.mockImplementation((event) =>
      event === FlowEvents.getTargets ? pending.promise : Promise.resolve(undefined)
    )

    const wrapper = createWrapper()
    await showSelector(wrapper)
    const held = document.body.querySelector('.MetaPanel-Empty')
    expect(held).toBeTruthy()
    expect(held?.textContent).not.toContain('flow.noTargets')

    pending.resolve({ success: true, data: [] })
    await flushPromises()
    expect(document.body.querySelector('.MetaPanel-Empty')?.textContent?.trim()).toBe(
      'flow.noTargets'
    )
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('asks for the window height the card needs while open', async () => {
    serve([systemInfo, airDrop, stopAll], { allowed: true, requiresConfirmation: true })

    const wrapper = createWrapper({ anchor: 'footer' })
    await showSelector(wrapper)
    await flushPromises()

    const listRoom = resolveMetaOverlayWindowHeight({
      anchor: 'footer',
      desiredPanelHeight: estimateMetaPanelHeight({ rows: 3, sections: 2, titledSections: 2 })
    })
    expect(rooms(wrapper).at(-1)).toBe(listRoom)
    expect(rooms(wrapper).every((height) => typeof height === 'number' && height > 0)).toBe(true)

    // Filtering does not resize the window.
    const asked = rooms(wrapper).length
    await typeFilter('airdrop')
    expect(rooms(wrapper)).toHaveLength(asked)
  })

  it('makes room for the confirmation when the list alone is shorter', async () => {
    serve([stopAll], { allowed: true, requiresConfirmation: true })

    const wrapper = createWrapper({ anchor: 'corner' })
    await showSelector(wrapper)
    await flushPromises()
    const listRoom = rooms(wrapper).at(-1) as number

    keydown('Enter')
    await flushPromises()
    const confirmRoom = rooms(wrapper).at(-1) as number
    expect(confirmRoom).toBeGreaterThan(listRoom)
    // 232px: the English card, whose three buttons wrap onto a second row, as measured in the real
    // window.
    expect(confirmRoom).toBe(
      resolveMetaOverlayWindowHeight({ anchor: 'corner', desiredPanelHeight: 232 })
    )
  })

  it('asks for no less than the window it opened in while its targets load', async () => {
    // Picked from the ⌘K panel: main grew the window to 536 for the panel and hands it over.
    setWindowHeight(536)
    const pending = Promise.withResolvers<unknown>()
    sendMock.mockImplementation((event) =>
      event === FlowEvents.getTargets ? pending.promise : Promise.resolve(undefined)
    )

    const wrapper = createWrapper({ anchor: 'footer' })
    await showSelector(wrapper)
    // One row's room, what the loading card is drawn for, would shrink that window.
    const loadingRoom = resolveMetaOverlayWindowHeight({
      anchor: 'footer',
      desiredPanelHeight: estimateMetaPanelHeight({ rows: 1, sections: 1, titledSections: 0 })
    })
    expect(loadingRoom).toBeLessThan(536)
    expect(rooms(wrapper)).toEqual([536])

    // Known targets move the window once, to what the list needs.
    pending.resolve({ success: true, data: [systemInfo, airDrop, stopAll] })
    await flushPromises()
    expect(rooms(wrapper)).toEqual([
      536,
      resolveMetaOverlayWindowHeight({
        anchor: 'footer',
        desiredPanelHeight: estimateMetaPanelHeight({ rows: 3, sections: 2, titledSections: 2 })
      })
    ])
  })

  it('still asks for one row’s room while loading in a window shorter than that', async () => {
    // Opened by its shortcut over two results: the window is only as tall as they are.
    setWindowHeight(190)
    const pending = Promise.withResolvers<unknown>()
    sendMock.mockImplementation((event) =>
      event === FlowEvents.getTargets ? pending.promise : Promise.resolve(undefined)
    )

    const wrapper = createWrapper({ anchor: 'footer' })
    await showSelector(wrapper)
    const loadingRoom = resolveMetaOverlayWindowHeight({
      anchor: 'footer',
      desiredPanelHeight: estimateMetaPanelHeight({ rows: 1, sections: 1, titledSections: 0 })
    })
    expect(rooms(wrapper)).toEqual([loadingRoom])

    pending.resolve({ success: true, data: [systemInfo, airDrop, stopAll] })
    await flushPromises()
    // Grows again for the loaded list, still in one direction.
    expect(rooms(wrapper).at(-1)).toBeGreaterThan(loadingRoom as number)
  })
})

describe('FlowSelector window room on close', () => {
  async function openCard(): Promise<{ wrapper: VueWrapper; openRoom: unknown }> {
    serve([systemInfo])
    const wrapper = createWrapper({ anchor: 'footer' }, { realTransition: true })
    await showSelector(wrapper)
    await flushPromises()
    const openRoom = rooms(wrapper).at(-1)
    expect(openRoom).toBe(
      resolveMetaOverlayWindowHeight({
        anchor: 'footer',
        desiredPanelHeight: estimateMetaPanelHeight({ rows: 1, sections: 1, titledSections: 1 })
      })
    )
    return { wrapper, openRoom }
  }

  it('keeps the room while the card fades out, and gives it back once it has left', async () => {
    const frames = holdAnimationFrames()
    const { wrapper, openRoom } = await openCard()
    frames.flush()

    await wrapper.setProps({ visible: false })
    // Still leaving, and the window still fits it.
    expect(document.body.querySelector('.FlowSelector')?.classList).toContain(
      'meta-panel-leave-active'
    )
    expect(rooms(wrapper).at(-1)).toBe(openRoom)

    frames.flush()
    expect(document.body.querySelector('.FlowSelector')).toBeNull()
    expect(rooms(wrapper).at(-1)).toBe(0)
    expect(rooms(wrapper).filter((height) => height === 0)).toHaveLength(1)
  })

  it('keeps the room for a card that opens again before the last one has left', async () => {
    const frames = holdAnimationFrames()
    const { wrapper, openRoom } = await openCard()
    frames.flush()

    await wrapper.setProps({ visible: false })
    // Opened again mid-leave: Vue ends the old card's leave at once, and fires its `after-leave`.
    await showSelector(wrapper)
    await flushPromises()
    frames.flush()

    expect(document.body.querySelectorAll('.FlowSelector')).toHaveLength(1)
    expect(rooms(wrapper)).not.toContain(0)
    expect(rooms(wrapper).at(-1)).toBe(openRoom)
  })

  it('gives the room back after a leave that never ends, as in a window hidden mid-fade', async () => {
    // Frames held, and run only at the end: until then the card cannot finish leaving.
    const frames = holdAnimationFrames()
    const { wrapper, openRoom } = await openCard()

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await wrapper.setProps({ visible: false })
    vi.advanceTimersByTime(399)
    expect(rooms(wrapper).at(-1)).toBe(openRoom)
    vi.advanceTimersByTime(1)
    expect(rooms(wrapper).at(-1)).toBe(0)

    // The leave ending late gives nothing back twice.
    frames.flush()
    expect(rooms(wrapper).filter((height) => height === 0)).toHaveLength(1)
  })
})

describe('FlowSelector keyboard', () => {
  it('keeps Enter, the arrows and Escape from CoreBox’s own handler while open', async () => {
    serve([systemInfo, airDrop])
    // Where useKeyboard listens: the document, capture phase.
    const coreBoxKeys: string[] = []
    const coreBoxHandler = (event: KeyboardEvent) => {
      coreBoxKeys.push(event.key)
    }
    document.addEventListener('keydown', coreBoxHandler, true)

    try {
      const wrapper = createWrapper()
      await showSelector(wrapper)

      for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) keydown(key)
      // A key the card does not use keeps its default, so typing still reaches the filter.
      const typed = keydown('a')
      expect(typed.defaultPrevented).toBe(false)
      expect(coreBoxKeys).toEqual([])
      expect(wrapper.emitted('close')).toHaveLength(1)

      await wrapper.setProps({ visible: false })
      keydown('Enter')
      expect(coreBoxKeys).toEqual(['Enter'])
    } finally {
      document.removeEventListener('keydown', coreBoxHandler, true)
    }
  })

  it('moves with the arrows, wrapping, and runs the active row on a fresh Enter only', async () => {
    serve([systemInfo, airDrop, notes])

    const wrapper = createWrapper()
    await showSelector(wrapper)
    expect(activeLabel()).toBe('QuickOps System Info')

    keydown('ArrowUp')
    await nextTick()
    expect(activeLabel()).toBe('Notes')
    keydown('ArrowDown')
    keydown('ArrowDown')
    await nextTick()
    expect(activeLabel()).toBe('AirDrop')

    // The Enter that picked 流转 in the ⌘K panel can still be held when the card opens.
    const repeat = keydown('Enter', { repeat: true })
    expect(repeat.defaultPrevented).toBe(true)
    await flushPromises()
    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(0)

    keydown('Enter')
    await flushPromises()
    expect(wrapper.emitted('select')).toEqual([[{ targetId: 'system-share.airdrop' }]])
  })

  it('follows the pointer only when it moves over an enabled row', async () => {
    serve([
      systemInfo,
      airDrop,
      flowTarget({ id: 'off', name: 'Off', pluginId: 'x', isEnabled: false })
    ])

    const wrapper = createWrapper()
    await showSelector(wrapper)
    const rows = document.body.querySelectorAll<HTMLElement>('.FlowTargetItem')

    rows[1]!.dispatchEvent(new Event('pointermove', { bubbles: true }))
    await nextTick()
    expect(activeLabel()).toBe('AirDrop')

    rows[2]!.dispatchEvent(new Event('pointermove', { bubbles: true }))
    await nextTick()
    expect(activeLabel()).toBe('AirDrop')

    // A disabled row is skipped on the way round.
    keydown('ArrowDown')
    await nextTick()
    expect(activeLabel()).toBe('QuickOps System Info')
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('dispatches once for a double Enter, until the panel opens again', async () => {
    serve([systemInfo])

    const wrapper = createWrapper()
    await showSelector(wrapper)

    keydown('Enter')
    keydown('Enter')
    await flushPromises()
    keydown('Enter')
    getTargetItem().click()
    await flushPromises()

    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(1)
    expect(wrapper.emitted('select')).toEqual([[{ targetId: 'quickops.system-info' }]])

    await wrapper.setProps({ visible: false })
    await showSelector(wrapper)
    keydown('Enter')
    await flushPromises()
    expect(wrapper.emitted('select')).toHaveLength(2)
  })

  it('drops a consent reply that lands after the panel closed', async () => {
    const consent = Promise.withResolvers<unknown>()
    sendMock.mockImplementation(async (event) => {
      if (event === FlowEvents.getTargets) return { success: true, data: [systemInfo] }
      if (event === FlowEvents.checkConsent) return consent.promise
      throw new Error('unexpected transport event')
    })

    const wrapper = createWrapper()
    await showSelector(wrapper)
    keydown('Enter')
    await wrapper.setProps({ visible: false })

    // Reopened for other content: the old reply must not send it to the old target.
    await showSelector(wrapper)
    consent.resolve({ success: true, data: { allowed: true } })
    await flushPromises()
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('leaves arrows, Enter and Escape to the IME while it composes', async () => {
    serve([systemInfo, airDrop])

    const wrapper = createWrapper()
    await showSelector(wrapper)
    const input = document.body.querySelector<HTMLInputElement>('input.SearchInput')!

    input.dispatchEvent(new Event('compositionstart'))
    await nextTick()
    keydown('ArrowDown')
    keydown('Enter')
    keydown('Escape')
    await flushPromises()
    expect(activeLabel()).toBe('QuickOps System Info')
    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(0)
    expect(wrapper.emitted('close')).toBeUndefined()

    // The Enter that commits a candidate still arrives flagged as composing.
    input.dispatchEvent(new Event('compositionend'))
    await nextTick()
    keydown('Enter', { isComposing: true })
    await flushPromises()
    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(0)

    keydown('ArrowDown')
    await nextTick()
    expect(activeLabel()).toBe('AirDrop')
  })

  it('gives focus back to what had it when the panel closes', async () => {
    serve([systemInfo])
    const coreBoxInput = document.createElement('input')
    document.body.appendChild(coreBoxInput)
    coreBoxInput.focus()

    const wrapper = createWrapper()
    await showSelector(wrapper)
    expect(document.activeElement).toBe(document.body.querySelector('input.SearchInput'))

    await wrapper.setProps({ visible: false })
    expect(document.activeElement).toBe(coreBoxInput)
  })
})
