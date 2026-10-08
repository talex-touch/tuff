// @vitest-environment jsdom
import type { FlowTargetInfo, TuffItem } from '@talex-touch/utils'
import type { MetaShowRequest } from '@talex-touch/utils/transport/events/types/meta-overlay'
import { FlowEvents } from '@talex-touch/utils/transport/events'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import {
  buildMetaActionModel,
  buildMetaShowRequest,
  estimateMetaActionPanelHeight
} from '~/modules/box/meta-actions/meta-action-model'
import { estimateFlowTargetsPanelHeight } from '~/modules/box/meta-actions/meta-flow-page'
import enUS from '~/modules/lang/en-US.json'
import zhCN from '~/modules/lang/zh-CN.json'
import { META_FLOW_CONFIRM_PANEL_HEIGHT } from '../../../../shared/meta-overlay-geometry'
import MetaOverlay from './MetaOverlay.vue'

/**
 * The Flow page of the ⌘K card: pushed in by the 流转 row, or opened straight by ⌘⇧D. It picks a
 * target, asks a target that needs it for consent or confirmation on a page of its own, and sends
 * the transfer back with the pick. Main follows the pages it reports (`ui.page`).
 */

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
    t: (key: string, params?: Record<string, string>) =>
      params && typeof params === 'object' ? `${key}:${params.source}->${params.target}` : key
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

// Windows: Ctrl is the command key.
vi.mock('~/modules/platform/renderer-platform', () => ({
  getCurrentRendererPlatformState: () => ({
    platform: 'win32',
    isMac: false,
    isWindows: true,
    isLinux: false
  })
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: {
    name: 'TxIcon',
    props: ['icon', 'size'],
    template: '<span class="tx-icon-stub" :data-icon="icon?.value" />'
  }
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

/** A plugin feature: its payload names the plugin as the sender consent is asked for. */
const QUICKOPS_ITEM = {
  id: 'touch-quickops-writing-sprint',
  kind: 'feature',
  source: { type: 'plugin', id: 'plugin-features', name: 'touch-quickops' },
  render: {
    mode: 'default',
    // A manifest's `ri:` name, which the header repairs into a class.
    basic: { title: 'Writing Sprint', icon: { type: 'class', value: 'ri:quill-pen-line' } }
  },
  meta: { pluginName: 'touch-quickops', featureId: 'quickops' }
} as TuffItem

const FLOW_ROW_LABEL = 'corebox.actions.flowTransfer'

const mounted = new Set<VueWrapper>()

function mountOverlay(): VueWrapper {
  const wrapper = mount(MetaOverlay, { attachTo: document.body })
  mounted.add(wrapper)
  return wrapper
}

function listener(event: { toEventName: () => string }): (payload?: unknown) => unknown {
  const registered = state.listeners.get(event.toEventName())
  expect(registered).toBeTypeOf('function')
  return registered!
}

/**
 * Answers the card's transport calls: `targets` for the list, `consent` for every check, a grant
 * with a confirmation token; everything main is told answers nothing.
 */
function serve(targets: FlowTargetInfo[], consent: ConsentReply = { allowed: true }): void {
  state.send.mockImplementation(async (event: { toEventName?: () => string } | string) => {
    if (event === FlowEvents.getTargets) return { success: true, data: targets }
    if (event === FlowEvents.checkConsent) return { success: true, data: consent }
    if (event === FlowEvents.grantConsent) {
      return { success: true, data: { confirmationToken: 'confirm-token' } }
    }
    if (keyOf(event).startsWith('meta-overlay:')) return undefined
    throw new Error(`unexpected transport event ${keyOf(event)}`)
  })
}

function sendsFor(event: unknown): unknown[][] {
  return state.send.mock.calls.filter(
    ([sent]) =>
      sent === event ||
      keyOf(sent as { toEventName?: () => string }) ===
        keyOf(event as { toEventName?: () => string })
  )
}

function pageReports(): unknown[] {
  return sendsFor(MetaOverlayEvents.ui.page).map(([, report]) => report)
}

function executed(): Array<Record<string, unknown>> {
  return sendsFor(MetaOverlayEvents.action.execute).map(
    ([, payload]) => payload as Record<string, unknown>
  )
}

function actionsRequest(item: TuffItem = QUICKOPS_ITEM): MetaShowRequest {
  return { ...buildMetaShowRequest(item), anchor: 'footer', desiredPanelHeight: 400 }
}

async function settle(): Promise<void> {
  await flushPromises()
  await nextTick()
}

/** ⌘K: the card opens on its action list. */
async function openActions(item: TuffItem = QUICKOPS_ITEM): Promise<void> {
  listener(MetaOverlayEvents.ui.show)(actionsRequest(item))
  await settle()
}

/** ⌘⇧D: the card opens straight on the Flow targets, with the targets CoreBox fetched or none. */
async function openFlow(flowTargets?: FlowTargetInfo[]): Promise<void> {
  listener(MetaOverlayEvents.ui.show)({
    ...buildMetaShowRequest(QUICKOPS_ITEM),
    anchor: 'corner',
    page: 'flow',
    ...(flowTargets ? { flowTargets } : {}),
    desiredPanelHeight: estimateFlowTargetsPanelHeight(flowTargets ?? [])
  } satisfies MetaShowRequest)
  await settle()
}

/** Dispatched where the key really starts: the focused element, inside the document. */
function keydown(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })
  ;(document.activeElement ?? document.body).dispatchEvent(event)
  return event
}

function rowLabels(selector: string): string[] {
  return Array.from(document.body.querySelectorAll(`${selector} .MetaActionItem-Label`)).map(
    (label) => label.textContent?.trim() ?? ''
  )
}

const targetLabels = (): string[] => rowLabels('.FlowTargetItem')

function activeTarget(): string | undefined {
  return (
    document.body
      .querySelector('.FlowTargetItem[aria-selected="true"] .MetaActionItem-Label')
      ?.textContent?.trim() ?? undefined
  )
}

function actionRow(label: string): HTMLElement {
  const row = Array.from(document.body.querySelectorAll<HTMLElement>('.MetaActionItem')).find(
    (candidate) => candidate.querySelector('.MetaActionItem-Label')?.textContent?.trim() === label
  )
  expect(row, `expected the ${label} row`).toBeTruthy()
  return row!
}

/** From the action list, the 流转 row runs and the Flow targets push in. */
async function enterFlow(): Promise<void> {
  actionRow(FLOW_ROW_LABEL).click()
  await settle()
}

function filterInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>('input.SearchInput')
  expect(input).toBeTruthy()
  return input!
}

async function typeFilter(value: string): Promise<void> {
  const input = filterInput()
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}

function pageOnScreen(): string | null {
  return document.body.querySelector('.MetaPanel')?.getAttribute('data-page') ?? null
}

async function clickConfirmButton(label: string): Promise<void> {
  const button = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('.tx-button-stub')
  ).find((candidate) => candidate.textContent?.includes(label))
  expect(button, `expected the ${label} button`).toBeTruthy()
  button!.click()
  await settle()
}

const actionsHeight = estimateMetaActionPanelHeight(
  buildMetaActionModel(actionsRequest(), { platform: 'win32' })
)

beforeEach(() => {
  state.listeners.clear()
  state.send.mockReset()
  state.logError.mockReset()
  document.body.innerHTML = ''
  // jsdom has no layout, so it has no scrollIntoView either.
  Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView']
})

afterEach(() => {
  for (const wrapper of mounted) wrapper.unmount()
  mounted.clear()
  document.body.innerHTML = ''
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
})

describe('MetaOverlay Flow page, pushed in by 流转', () => {
  it('pushes the targets in when the 流转 row runs, sending no action', async () => {
    serve([systemInfo, airDrop])
    mountOverlay()
    await openActions()
    expect(pageOnScreen()).toBe('actions')
    expect(document.body.querySelector('.MetaPanel-Back')).toBeNull()

    await enterFlow()

    expect(pageOnScreen()).toBe('flow')
    expect(targetLabels()).toEqual(['QuickOps System Info', 'AirDrop'])
    expect(executed()).toEqual([])
    // The same card: one panel, its header still naming the item, now with a way back.
    expect(document.body.querySelectorAll('.MetaPanel')).toHaveLength(1)
    expect(document.body.querySelector('.MetaPanel-HeaderTitle')?.textContent).toBe(
      'Writing Sprint'
    )
    expect(document.body.querySelector('.MetaPanel-HeaderMeta')?.textContent?.trim()).toBe(
      'flow.selectTarget'
    )
    const back = document.body.querySelector<HTMLButtonElement>('button.MetaPanel-Back')
    expect(back?.getAttribute('aria-label')).toBe('layout.back')
    // Typing goes to the targets' own filter at once.
    expect(document.activeElement).toBe(filterInput())
    expect(filterInput().getAttribute('aria-controls')).toBe('meta-flow-list')
  })

  it('pushes them in from the row’s key, which does nothing on the page it opens', async () => {
    serve([systemInfo])
    mountOverlay()
    await openActions()

    const open = keydown('D', { ctrlKey: true, shiftKey: true, code: 'KeyD' })
    await settle()
    expect(open.defaultPrevented).toBe(true)
    expect(pageOnScreen()).toBe('flow')

    const again = keydown('D', { ctrlKey: true, shiftKey: true, code: 'KeyD' })
    await settle()
    expect(again.defaultPrevented).toBe(false)
    expect(pageOnScreen()).toBe('flow')
    expect(pageReports()).toHaveLength(1)
    expect(executed()).toEqual([])
    expect(sendsFor(FlowEvents.getTargets)).toHaveLength(1)
  })

  it('fetches the targets as the card opens with a 流转 row, and not again on the page', async () => {
    serve([systemInfo])
    mountOverlay()
    await openActions()
    expect(sendsFor(FlowEvents.getTargets)).toEqual([
      [FlowEvents.getTargets, { payloadType: 'json' }]
    ])

    await enterFlow()
    expect(targetLabels()).toEqual(['QuickOps System Info'])
    expect(sendsFor(FlowEvents.getTargets)).toHaveLength(1)
  })

  it('fetches nothing for a card without a 流转 row', async () => {
    serve([systemInfo])
    mountOverlay()

    listener(MetaOverlayEvents.ui.show)({
      item: QUICKOPS_ITEM,
      builtinActions: [{ id: 'copy-title', render: { basic: { title: 'Copy name' } } }],
      itemActions: [],
      pluginActions: []
    })
    await settle()

    expect(sendsFor(FlowEvents.getTargets)).toHaveLength(0)
  })

  it('goes back on the first Esc, keeping the action list as it was, and closes on the second', async () => {
    serve([systemInfo])
    mountOverlay()
    await openActions()
    await typeFilter('flow')
    expect(rowLabels('.MetaActionItem:not(.FlowTargetItem)')).toEqual([FLOW_ROW_LABEL])
    await enterFlow()

    keydown('Escape')
    await settle()

    expect(pageOnScreen()).toBe('actions')
    expect(document.body.querySelector('.MetaPanel-Back')).toBeNull()
    // The filter and the active row the user left from are there again.
    expect(filterInput().value).toBe('flow')
    expect(document.activeElement).toBe(filterInput())
    expect(
      document.body.querySelector('.MetaActionItem[aria-selected="true"] .MetaActionItem-Label')
        ?.textContent
    ).toBe(FLOW_ROW_LABEL)
    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(0)

    keydown('Escape')
    await settle()
    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(1)
  })

  it('goes back from the header’s back button too', async () => {
    serve([systemInfo])
    mountOverlay()
    await openActions()
    await enterFlow()

    document.body.querySelector<HTMLButtonElement>('button.MetaPanel-Back')!.click()
    await settle()

    expect(pageOnScreen()).toBe('actions')
    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(0)
  })

  it('tells main each page once, with whether it can go back and the height it needs', async () => {
    serve([systemInfo, stopAll, airDrop], { allowed: true, requiresConfirmation: true })
    mountOverlay()
    await openActions()
    // The open itself: main already knows from the request.
    expect(pageReports()).toEqual([])

    const listHeight = estimateFlowTargetsPanelHeight([systemInfo, stopAll, airDrop])
    await enterFlow()
    keydown('Enter')
    await settle()
    expect(pageOnScreen()).toBe('flow-confirm')
    keydown('Escape')
    await settle()
    keydown('Escape')
    await settle()

    expect(pageReports()).toEqual([
      { page: 'flow', canGoBack: true, desiredPanelHeight: listHeight },
      {
        page: 'flow-confirm',
        canGoBack: true,
        desiredPanelHeight: Math.max(listHeight, META_FLOW_CONFIRM_PANEL_HEIGHT)
      },
      { page: 'flow', canGoBack: true, desiredPanelHeight: listHeight },
      { page: 'actions', canGoBack: false, desiredPanelHeight: actionsHeight }
    ])
  })
})

describe('MetaOverlay Flow page, opened straight', () => {
  it('opens on the targets it was sent, with no way back: Esc closes the card', async () => {
    serve([airDrop])
    mountOverlay()
    await openFlow([systemInfo])

    expect(pageOnScreen()).toBe('flow')
    expect(targetLabels()).toEqual(['QuickOps System Info'])
    expect(sendsFor(FlowEvents.getTargets)).toHaveLength(0)
    expect(document.body.querySelector('.MetaPanel-Back')).toBeNull()
    expect(document.activeElement).toBe(filterInput())
    expect(pageReports()).toEqual([])

    keydown('Escape')
    await settle()
    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(1)
  })

  it('fetches the targets itself when none came with it, and reports the height they need', async () => {
    const pending = Promise.withResolvers<unknown>()
    state.send.mockImplementation((event: { toEventName?: () => string } | string) =>
      event === FlowEvents.getTargets ? pending.promise : Promise.resolve(undefined)
    )
    mountOverlay()
    await openFlow()

    // Never says there are none while they load.
    const held = document.body.querySelector('.MetaPanel-Empty')
    expect(held).toBeTruthy()
    expect(held?.textContent).not.toContain('flow.noTargets')

    pending.resolve({ success: true, data: [systemInfo, airDrop, stopAll] })
    await settle()
    expect(targetLabels()).toEqual([
      'QuickOps System Info',
      'QuickOps Stop All Sessions',
      'AirDrop'
    ])
    expect(pageReports()).toEqual([
      {
        page: 'flow',
        canGoBack: false,
        desiredPanelHeight: estimateFlowTargetsPanelHeight([systemInfo, airDrop, stopAll])
      }
    ])
  })

  it('says so when no target takes the item', async () => {
    serve([])
    mountOverlay()
    await openFlow([])

    expect(document.body.querySelector('.MetaPanel-Empty')?.textContent?.trim()).toBe(
      'flow.noTargets'
    )
  })
})

describe('MetaOverlay Flow page targets', () => {
  it('groups the targets by plugin, in the order main lists them', async () => {
    serve([])
    mountOverlay()
    await openFlow([systemInfo, airDrop, stopAll, notes])

    expect(
      Array.from(document.body.querySelectorAll('.MetaPanel-SectionTitle')).map((title) =>
        title.textContent?.trim()
      )
    ).toEqual(['QuickOps', '系统分享', 'touch-notes'])
    expect(targetLabels()).toEqual([
      'QuickOps System Info',
      'QuickOps Stop All Sessions',
      'AirDrop',
      'Notes'
    ])
    expect(
      document.body.querySelector('.MetaPanel-Header .tx-icon-stub')?.getAttribute('data-icon')
    ).toBe('i-ri-quill-pen-line')
    // Nothing restates the payload.
    expect(document.body.querySelector('.MetaOverlay')?.textContent).not.toContain('json')
  })

  it('draws each target with its icon as a class, the plugin’s icon, or the puzzle', async () => {
    serve([])
    mountOverlay()
    await openFlow([systemInfo, airDrop, stopAll, notes])

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

  it('filters by name, description, plugin or the name’s letters, and says when nothing matches', async () => {
    serve([systemInfo, airDrop, stopAll, notes])
    mountOverlay()
    await openFlow([systemInfo, airDrop, stopAll, notes])

    await typeFilter('airdrop')
    expect(targetLabels()).toEqual(['AirDrop'])
    expect(activeTarget()).toBe('AirDrop')

    await typeFilter('qsysi')
    expect(targetLabels()).toEqual(['QuickOps System Info'])

    await typeFilter('read-only')
    expect(targetLabels()).toEqual(['QuickOps System Info'])

    await typeFilter('系统')
    expect(targetLabels()).toEqual(['AirDrop'])

    await typeFilter('zzz-nothing')
    expect(targetLabels()).toEqual([])
    expect(document.body.querySelector('.MetaPanel-Empty')?.textContent?.trim()).toBe(
      'flow.noTargets'
    )
    keydown('Enter')
    await settle()
    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(0)
  })

  it('moves with the arrows, wrapping past disabled rows, and follows the pointer onto enabled ones', async () => {
    const off = flowTarget({ id: 'off', name: 'Off', pluginId: 'x', isEnabled: false })
    serve([])
    mountOverlay()
    await openFlow([systemInfo, airDrop, off, notes])
    expect(activeTarget()).toBe('QuickOps System Info')

    keydown('ArrowUp')
    await nextTick()
    expect(activeTarget()).toBe('Notes')
    keydown('ArrowUp')
    await nextTick()
    expect(activeTarget()).toBe('AirDrop')

    const rows = document.body.querySelectorAll<HTMLElement>('.FlowTargetItem')
    rows[2]!.dispatchEvent(new Event('pointermove', { bubbles: true }))
    await nextTick()
    expect(activeTarget()).toBe('AirDrop')
    rows[0]!.dispatchEvent(new Event('pointermove', { bubbles: true }))
    await nextTick()
    expect(activeTarget()).toBe('QuickOps System Info')
  })

  it('keeps Tab on its filter', async () => {
    serve([])
    mountOverlay()
    await openFlow([systemInfo])

    expect(keydown('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(filterInput())
  })

  it('leaves arrows, Enter and Esc to the IME while it composes', async () => {
    serve([systemInfo, airDrop])
    mountOverlay()
    await openFlow([systemInfo, airDrop])
    const input = filterInput()

    input.dispatchEvent(new Event('compositionstart'))
    await nextTick()
    keydown('ArrowDown')
    keydown('Enter')
    keydown('Escape')
    await settle()
    expect(activeTarget()).toBe('QuickOps System Info')
    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(0)
    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(0)

    // The Enter that commits a candidate still arrives flagged as composing.
    input.dispatchEvent(new Event('compositionend'))
    await nextTick()
    keydown('Enter', { isComposing: true })
    await settle()
    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(0)

    keydown('ArrowDown')
    await nextTick()
    expect(activeTarget()).toBe('AirDrop')
  })
})

describe('MetaOverlay Flow page picks', () => {
  it('sends the transfer with the picked target once, however often Enter is pressed', async () => {
    serve([systemInfo])
    mountOverlay()
    await openFlow([systemInfo])

    keydown('Enter')
    keydown('Enter')
    await settle()

    expect(sendsFor(FlowEvents.checkConsent)).toEqual([
      [FlowEvents.checkConsent, { senderId: 'touch-quickops', targetId: 'quickops.system-info' }]
    ])
    const transfers = executed()
    expect(transfers).toEqual([
      {
        actionId: 'flow-transfer',
        itemId: QUICKOPS_ITEM.id,
        item: QUICKOPS_ITEM,
        flow: { targetId: 'quickops.system-info' }
      }
    ])
    // It crosses a structured-clone boundary on its way to main.
    expect(structuredClone(transfers[0])).toEqual(transfers[0])
    expect(document.body.querySelector('.MetaOverlay')).toBeNull()
  })

  it('takes a click on a target the same way', async () => {
    serve([systemInfo, airDrop])
    mountOverlay()
    await openActions()
    await enterFlow()

    Array.from(document.body.querySelectorAll<HTMLElement>('.FlowTargetItem'))[1]!.click()
    await settle()

    expect(executed().map((payload) => payload.flow)).toEqual([
      { targetId: 'system-share.airdrop' }
    ])
  })

  it('ignores the held Enter that picked 流转, and runs a fresh one', async () => {
    serve([systemInfo])
    mountOverlay()
    await openActions()
    await enterFlow()

    const repeat = keydown('Enter', { repeat: true })
    await settle()
    expect(repeat.defaultPrevented).toBe(true)
    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(0)

    keydown('Enter')
    await settle()
    expect(executed()).toHaveLength(1)
  })

  it('picks again once the card opens again', async () => {
    serve([systemInfo])
    mountOverlay()
    await openFlow([systemInfo])
    keydown('Enter')
    await settle()

    listener(MetaOverlayEvents.ui.hide)()
    await settle()
    await openFlow([systemInfo])
    keydown('Enter')
    await settle()

    expect(executed()).toHaveLength(2)
    // Closing and opening again reset the pages without telling main of either.
    expect(pageReports()).toEqual([])
  })

  it('drops a consent reply that lands after the card went back a page', async () => {
    const consent = Promise.withResolvers<unknown>()
    state.send.mockImplementation(async (event: unknown) => {
      if (event === FlowEvents.getTargets) return { success: true, data: [systemInfo] }
      if (event === FlowEvents.checkConsent) return consent.promise
      return undefined
    })
    mountOverlay()
    await openActions()
    await enterFlow()
    keydown('Enter')
    keydown('Escape')
    await settle()
    expect(pageOnScreen()).toBe('actions')

    consent.resolve({ success: true, data: { allowed: true } })
    await settle()
    expect(executed()).toEqual([])
    expect(pageOnScreen()).toBe('actions')
  })

  it('drops a consent reply that lands after the card closed and opened again', async () => {
    const consent = Promise.withResolvers<unknown>()
    state.send.mockImplementation(async (event: unknown) => {
      if (event === FlowEvents.checkConsent) return consent.promise
      return undefined
    })
    mountOverlay()
    await openFlow([systemInfo])
    keydown('Enter')
    listener(MetaOverlayEvents.ui.hide)()
    await openFlow([systemInfo])

    consent.resolve({ success: true, data: { allowed: true } })
    await settle()
    expect(executed()).toEqual([])
  })
})

describe('MetaOverlay Flow page confirmation', () => {
  it('asks in the card, on its primary button, which a fresh Enter runs once', async () => {
    serve([stopAll], { allowed: true, requiresConfirmation: true })
    mountOverlay()
    await openFlow([stopAll])

    keydown('Enter')
    await settle()

    // The same card, a page further: no list, no filter, no second dialog.
    expect(pageOnScreen()).toBe('flow-confirm')
    expect(document.body.querySelectorAll('.MetaPanel')).toHaveLength(1)
    expect(document.body.querySelector('.FlowTargetItem')).toBeNull()
    expect(document.body.querySelector('input.SearchInput')).toBeNull()
    expect(document.body.querySelector('.MetaFlowConfirm-Title')?.textContent).toBe(
      'flow.executionConfirmationTitle'
    )
    const primary = document.body.querySelector('.MetaFlowConfirm-Primary')
    expect(primary?.textContent).toContain('flow.confirmOnce')
    expect(document.activeElement).toBe(primary)
    // Opened straight on the targets, the confirmation can still go back to them.
    expect(document.body.querySelector('button.MetaPanel-Back')).toBeTruthy()

    // The held Enter that picked the target must not also confirm it.
    expect(keydown('Enter', { repeat: true }).defaultPrevented).toBe(true)
    await settle()
    expect(sendsFor(FlowEvents.grantConsent)).toHaveLength(0)

    keydown('Enter')
    await settle()
    expect(sendsFor(FlowEvents.grantConsent)).toEqual([
      [
        FlowEvents.grantConsent,
        { senderId: 'touch-quickops', targetId: 'quickops.stop-all', mode: 'once' }
      ]
    ])
    expect(executed().map((payload) => payload.flow)).toEqual([
      { targetId: 'quickops.stop-all', confirmationToken: 'confirm-token' }
    ])
  })

  it('denies on Esc: back to the targets, nothing granted, nothing sent, the card still open', async () => {
    serve([stopAll, systemInfo], { allowed: true, requiresConfirmation: true })
    mountOverlay()
    await openFlow([stopAll, systemInfo])
    keydown('Enter')
    await settle()
    expect(pageOnScreen()).toBe('flow-confirm')

    keydown('Escape')
    await settle()

    expect(pageOnScreen()).toBe('flow')
    expect(targetLabels()).toEqual(['QuickOps Stop All Sessions', 'QuickOps System Info'])
    expect(document.activeElement).toBe(filterInput())
    expect(sendsFor(FlowEvents.grantConsent)).toHaveLength(0)
    expect(executed()).toEqual([])
    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(0)

    // Denying hands the pick back: the next Enter asks again.
    keydown('Enter')
    await settle()
    expect(sendsFor(FlowEvents.checkConsent)).toHaveLength(2)
    expect(pageOnScreen()).toBe('flow-confirm')
  })

  it('denies from its button the same way', async () => {
    serve([stopAll], { allowed: true, requiresConfirmation: true })
    mountOverlay()
    await openFlow([stopAll])
    keydown('Enter')
    await settle()

    await clickConfirmButton('flow.consentDeny')

    expect(pageOnScreen()).toBe('flow')
    expect(sendsFor(FlowEvents.grantConsent)).toHaveLength(0)
    expect(executed()).toEqual([])
  })

  it('closes on Esc once the grant is under way, and sends nothing when it lands', async () => {
    const grant = Promise.withResolvers<unknown>()
    state.send.mockImplementation(async (event: unknown) => {
      if (event === FlowEvents.checkConsent) {
        return { success: true, data: { allowed: true, requiresConfirmation: true } }
      }
      if (event === FlowEvents.grantConsent) return grant.promise
      return undefined
    })
    mountOverlay()
    await openFlow([stopAll])
    keydown('Enter')
    await settle()
    keydown('Enter')
    await settle()
    expect(sendsFor(FlowEvents.grantConsent)).toHaveLength(1)

    keydown('Escape')
    await settle()
    expect(sendsFor(MetaOverlayEvents.ui.hide)).toHaveLength(1)

    grant.resolve({ success: true, data: { confirmationToken: 'confirm-token' } })
    await settle()
    expect(executed()).toEqual([])
  })

  it('keeps Tab among its buttons, wrapping at either end', async () => {
    serve([stopAll], { allowed: false, requiresConfirmation: true })
    mountOverlay()
    await openFlow([stopAll])
    keydown('Enter')
    await settle()

    const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.tx-button-stub'))
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      'flow.consentDeny',
      'flow.allowAndConfirmOnce',
      'flow.confirmAndSend'
    ])
    expect(document.activeElement).toBe(buttons[2])
    expect(keydown('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(buttons[0])
    expect(keydown('Tab', { shiftKey: true }).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(buttons[2])
  })

  it('asks for authorization and confirmation together when consent is missing', async () => {
    serve([stopAll], { allowed: false, requiresConfirmation: true })
    mountOverlay()
    await openFlow([stopAll])
    keydown('Enter')
    await settle()

    expect(document.body.querySelector('.MetaFlowConfirm-Title')?.textContent).toBe(
      'flow.authorizationAndConfirmationTitle'
    )

    await clickConfirmButton('flow.confirmAndSend')
    expect(sendsFor(FlowEvents.grantConsent).at(-1)?.[1]).toEqual({
      senderId: 'touch-quickops',
      targetId: 'quickops.stop-all',
      mode: 'always'
    })
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
    mountOverlay()
    await openFlow([stopAll])
    keydown('Enter')
    await settle()

    expect(document.body.querySelector('.MetaFlowConfirm-Description')?.textContent?.trim()).toBe(
      'flow.executionConfirmationDesc:touch-quickops->QuickOps'
    )
  })
})
