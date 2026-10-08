<script setup lang="ts">
import type { TuffItem } from '@talex-touch/utils'
import type {
  MetaActionExecuteRequest,
  MetaFlowSelection,
  MetaPageChangeRequest,
  MetaPanelPage,
  MetaShowRequest
} from '@talex-touch/utils/transport/events/types/meta-overlay'
import type {
  MetaActionLabel,
  MetaActionModel,
  MetaActionRow
} from '~/modules/box/meta-actions/meta-action-model'
import type { MetaFlowTargetRow } from '~/modules/box/meta-actions/meta-flow-page'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch
} from 'vue'
import { useI18n } from 'vue-i18n'
import MetaActionItem from '~/components/meta/MetaActionItem.vue'
import MetaFlowConfirm from '~/components/meta/MetaFlowConfirm.vue'
import MetaPanel from '~/components/meta/MetaPanel.vue'
import MetaPanelFilter from '~/components/meta/MetaPanelFilter.vue'
import MetaPanelList from '~/components/meta/MetaPanelList.vue'
import { normalizeCoreBoxIcon } from '~/components/render/icon-color-mode'
import { useMotionGate } from '~/modules/box/adapter/hooks/useMotionGate'
import {
  buildMetaActionModel,
  estimateMetaActionPanelHeight,
  isImeComposing,
  metaActionShortcutLabels,
  resolveMetaActionShortcut
} from '~/modules/box/meta-actions/meta-action-model'
import { META_FLOW_LIST_ID, useMetaFlowPage } from '~/modules/box/meta-actions/meta-flow-page'
import {
  matchesMetaPanelQuery,
  normalizeMetaPanelQuery
} from '~/modules/box/meta-actions/meta-panel-filter'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import { shortcutChordLabel } from '~/modules/shortcuts/shortcut-chord'
import { createRendererLogger } from '~/utils/renderer-log'
import { COREBOX_FLOW_TRANSFER_ACTION_ID } from '../../../../shared/events/corebox-scenes'
import { resolveMetaPanelCssVars } from '../../../../shared/meta-overlay-geometry'

/**
 * The ⌘K action panel: a compact card anchored bottom-right, above the CoreBox footer's ⌘K hint
 * (or in the window corner when there is no footer), over a light dim of the launcher. The card
 * itself is `MetaPanel`; this view owns the dim, the anchor, the keyboard and the pages.
 *
 * The card holds a stack of pages: the action list, the Flow targets its 流转 row pushes in, and
 * the confirmation a target may ask for. ⌘⇧D opens the card straight on the Flow targets. Esc goes
 * back a page, and closes the card from the page it opened on; main closes it itself there, and
 * leaves Esc to this view while there is a page to go back to (`MetaOverlayEvents.ui.page`).
 *
 * It lives in the full-window transparent overlay view main keeps above the plugin view, so it
 * covers a plugin UI too. The dim is painted by this document: `backdrop-filter` cannot sample the
 * views underneath on macOS (electron#45206), so there is no blur, on any platform.
 */

const { t } = useI18n()
const transport = useTuffTransport()
const metaOverlayLog = createRendererLogger('MetaOverlay')
const { platform, isMac } = getCurrentRendererPlatformState()

const META_OVERLAY_READY_RETRY_DELAYS_MS = [250, 1_000, 3_000] as const
let readyRetryIndex = 0
let readyRetryTimer: ReturnType<typeof setTimeout> | null = null
let rendererMounted = false

const LIST_ID = 'meta-panel-list'
const EMPTY_MODEL: MetaActionModel = { sections: [], rows: [] }

const visible = ref(false)
const searchQuery = ref('')
const activeIndex = ref(0)
const composing = ref(false)
// Opaque transport records: a deep ref would proxy them, and a Proxy cannot be structured-cloned
// on the way back to main (channel-transport-contracts).
const item = shallowRef<TuffItem | null>(null)
const request = shallowRef<MetaShowRequest | null>(null)
const executingActionId = ref<string | null>(null)

/** The card's pages, the one on screen last. Every open starts over with one. */
const pageStack = ref<MetaPanelPage[]>(['actions'])
const page = computed(() => pageStack.value.at(-1) ?? 'actions')
const canGoBack = computed(() => pageStack.value.length > 1)
/** Which way the last page switch went, for the push. */
const direction = ref<'forward' | 'back'>('forward')

const flow = reactive(useMetaFlowPage({ transport, t }))
// What the Flow page was opened from asked of the window: while its targets load, the page asks for
// no less (`currentPageHeight`), so the card does not shrink only to grow again.
const flowEntryHeight = ref(0)

// Set once this view has asked main to close the card, until the card opens again. Closing is a
// round trip; a consent reply landing in between belongs to a card the user already dismissed.
let closeRequested = false

const actionsListRef = ref<InstanceType<typeof MetaPanelList> | null>(null)
const actionsFilterRef = ref<InstanceType<typeof MetaPanelFilter> | null>(null)
const flowListRef = ref<InstanceType<typeof MetaPanelList> | null>(null)
const flowFilterRef = ref<InstanceType<typeof MetaPanelFilter> | null>(null)
const confirmRef = ref<InstanceType<typeof MetaFlowConfirm> | null>(null)
// The overlay is a separate lightweight window, with one motion gate of its own.
const { shouldAnimate } = useMotionGate()

const model = computed<MetaActionModel>(() =>
  request.value ? buildMetaActionModel(request.value, { platform }) : EMPTY_MODEL
)

function resolveLabel(label: MetaActionLabel): string {
  return 'key' in label ? t(label.key) : label.text
}

interface PanelRow {
  row: MetaActionRow
  label: string
  subtitle?: string
  shortcuts: string[]
  /** Position in the flattened, filtered list: the keyboard index. */
  index: number
  domId: string
}

interface PanelSection {
  key: string
  title: string | null
  titleId: string
  rows: PanelRow[]
}

const sections = computed<PanelSection[]>(() => {
  const resolved = model.value.rows.map((row) => ({ row, label: resolveLabel(row.label) }))
  // A subtitle is noise unless two rows would otherwise read the same.
  const labelCounts = new Map<string, number>()
  for (const entry of resolved) {
    labelCounts.set(entry.label, (labelCounts.get(entry.label) ?? 0) + 1)
  }

  const query = normalizeMetaPanelQuery(searchQuery.value)
  let index = 0
  const result: PanelSection[] = []
  for (const section of model.value.sections) {
    const rows: PanelRow[] = []
    for (const entry of resolved) {
      if (entry.row.section !== section.key) continue
      const subtitle = (labelCounts.get(entry.label) ?? 0) > 1 ? entry.row.subtitle : undefined
      if (!matchesMetaPanelQuery(query, entry.label, [subtitle ?? entry.row.subtitle])) continue
      rows.push({
        row: entry.row,
        label: entry.label,
        subtitle,
        shortcuts: metaActionShortcutLabels(entry.row, isMac),
        index,
        domId: `${LIST_ID}-option-${index}`
      })
      index += 1
    }
    if (rows.length === 0) continue
    result.push({
      key: section.key,
      title: section.title ? resolveLabel(section.title) : null,
      titleId: `${LIST_ID}-section-${result.length}`,
      rows
    })
  }
  return result
})

const flatRows = computed(() => sections.value.flatMap((section) => section.rows))
const activeRow = computed(() => flatRows.value[activeIndex.value] ?? null)
const activeRowHighlighted = computed(
  () => activeRow.value !== null && !activeRow.value.row.disabled
)

const itemTitle = computed(() => item.value?.render?.basic?.title?.trim() ?? '')
// The item names the card on every page; without a title, the page does.
const headerTitle = computed(
  () =>
    itemTitle.value || t(page.value === 'actions' ? 'corebox.actions.title' : 'flow.selectTarget')
)
const headerIcon = computed(() => normalizeCoreBoxIcon(item.value?.render?.basic?.icon))
const toggleKeyLabel = shortcutChordLabel({ code: 'KeyK' }, isMac)

/** Geometry the panel's CSS reads; the same numbers main grows the window with. */
const overlayStyle = computed(() => resolveMetaPanelCssVars(request.value?.anchor))

/** The action list's height, from every row: typing in the filter does not resize the window. */
const actionsPanelHeight = computed(() => estimateMetaActionPanelHeight(model.value))

/** The height the page on screen asks main for, as `desiredPanelHeight` is measured. */
const currentPageHeight = computed(() => {
  if (page.value === 'flow-confirm') return flow.confirmPanelHeight
  if (page.value === 'flow') {
    return flow.loading
      ? Math.max(flow.listPanelHeight, flowEntryHeight.value)
      : flow.listPanelHeight
  }
  return actionsPanelHeight.value
})

function firstSelectableIndex(): number {
  const found = flatRows.value.find((entry) => !entry.row.disabled)
  return found ? found.index : 0
}

function scrollActiveIntoView(): void {
  actionsListRef.value?.scrollActiveIntoView()
}

function step(delta: number): void {
  const selectable = flatRows.value.filter((entry) => !entry.row.disabled)
  if (selectable.length === 0) return
  const position = selectable.findIndex((entry) => entry.index === activeIndex.value)
  const next =
    position < 0
      ? selectable[delta > 0 ? 0 : selectable.length - 1]!
      : selectable[(position + delta + selectable.length) % selectable.length]!
  activeIndex.value = next.index
  void nextTick(scrollActiveIntoView)
}

/** Pointer hover follows real movement only: a panel appearing under a resting cursor keeps ↵. */
function hoverRow(index: number): void {
  const entry = flatRows.value[index]
  if (entry && !entry.row.disabled && index !== activeIndex.value) {
    actionsListRef.value?.glideNext()
    activeIndex.value = index
  }
}

function hoverFlowRow(index: number): void {
  if (flow.hover(index)) flowListRef.value?.glideNext()
}

/** Gives the page on screen focus: its filter, or the confirmation's primary button. */
function focusCurrentPage(): void {
  if (page.value === 'flow-confirm') confirmRef.value?.focusPrimary()
  else if (page.value === 'flow') flowFilterRef.value?.focus()
  else actionsFilterRef.value?.focus()
}

/**
 * Brings the active row of a page the card went back to into view: the page is drawn anew, its
 * list at the top, and the row the user left from may sit below the fold.
 */
function revealReturnedRow(): void {
  if (page.value === 'flow') flowListRef.value?.scrollActiveIntoView()
  else if (page.value === 'actions') actionsListRef.value?.scrollActiveIntoView()
}

/**
 * Puts a page on top of the card. Focus moves at once, not after the push: the new page's filter
 * takes typing while it is still sliding in.
 */
function pushPage(next: MetaPanelPage): void {
  direction.value = 'forward'
  pageStack.value = [...pageStack.value, next]
  void nextTick(focusCurrentPage)
}

/** Goes back a page; from the page the card opened on, there is none, and it closes. */
function popPage(): void {
  if (pageStack.value.length <= 1) {
    void handleClose()
    return
  }
  const leaving = page.value
  direction.value = 'back'
  pageStack.value = pageStack.value.slice(0, -1)
  // A consent check or a load still running belongs to the page that is going.
  if (leaving === 'flow') flow.cancel()
  void nextTick(() => {
    focusCurrentPage()
    revealReturnedRow()
  })
}

/** The 流转 row: the Flow targets push in over the action list, in the same card. */
function enterFlowPage(): void {
  const current = item.value
  if (!current || page.value !== 'actions') return
  flowEntryHeight.value = actionsPanelHeight.value
  // The action filter goes with its page; a composition it had open ended with it.
  composing.value = false
  flow.open(current)
  pushPage('flow')
}

// What main was last told about the page on screen (`reportKey`), so it hears of each change once.
let reportedPage = ''

function reportKey(report: MetaPageChangeRequest): string {
  return `${report.page}|${report.canGoBack}|${report.desiredPanelHeight ?? ''}`
}

const pageReport = computed<MetaPageChangeRequest>(() => ({
  page: page.value,
  canGoBack: canGoBack.value,
  desiredPanelHeight: currentPageHeight.value
}))

// Main follows the card: it leaves Esc to this view while there is a page to go back to, blurs
// CoreBox under a Flow page, and grows the window for a page that does not fit. An open needs no
// report: the show request already said which page it starts on.
watch(
  pageReport,
  (report) => {
    if (!visible.value) return
    const key = reportKey(report)
    if (key === reportedPage) return
    reportedPage = key
    void transport.send(MetaOverlayEvents.ui.page, report).catch((error) => {
      metaOverlayLog.error('Failed to report the panel page', error)
    })
  },
  { flush: 'post' }
)

function resetPages(): void {
  pageStack.value = ['actions']
  direction.value = 'forward'
  flowEntryHeight.value = 0
  flow.reset()
}

// Listen for show/hide messages from main process via IPC
const unregShow = transport.on(MetaOverlayEvents.ui.show, (data: MetaShowRequest) => {
  item.value = data.item
  request.value = data
  executingActionId.value = null
  closeRequested = false
  resetPages()
  if (data.page === 'flow') {
    // Straight on the Flow targets (⌘⇧D), with nothing to go back to.
    pageStack.value = ['flow']
    flowEntryHeight.value = data.desiredPanelHeight ?? 0
    flow.open(data.item, data.flowTargets)
  } else if (model.value.rows.some((row) => row.id === COREBOX_FLOW_TRANSFER_ACTION_ID)) {
    // The 流转 row is there: have its targets ready by the time it is picked.
    flow.prefetch(data.item)
  }
  visible.value = true
  reportedPage = reportKey(pageReport.value)
  return { accepted: true }
})

const unregHide = transport.on(MetaOverlayEvents.ui.hide, () => {
  visible.value = false
  searchQuery.value = ''
  activeIndex.value = 0
  executingActionId.value = null
  composing.value = false
  resetPages()
})

// Focus the filter when shown. `nextTick` rather than a timeout: the input exists as soon as the
// `v-if` subtree is patched, and a fixed delay only postponed a usable panel.
watch(visible, async (newVisible) => {
  if (!newVisible) return
  searchQuery.value = ''
  activeIndex.value = firstSelectableIndex()
  await nextTick()
  focusCurrentPage()
})

// A new request (a reopen, or a different item) starts on its primary row again.
watch(request, () => {
  activeIndex.value = firstSelectableIndex()
})

watch(
  () => normalizeMetaPanelQuery(searchQuery.value),
  () => {
    activeIndex.value = firstSelectableIndex()
    void nextTick(scrollActiveIntoView)
  }
)

// The Flow page moves its active row to the first target itself; this brings it into view.
watch(
  () => normalizeMetaPanelQuery(flow.query),
  () => {
    void nextTick(() => flowListRef.value?.scrollActiveIntoView())
  }
)

function isPanelToggle(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.code === 'KeyK' || event.key === 'k' || event.key === 'K')
  )
}

function stop(event: KeyboardEvent): void {
  event.preventDefault()
  event.stopPropagation()
}

/** The filter of the page on screen is composing; the confirmation has none. */
function isPageComposing(): boolean {
  if (page.value === 'actions') return composing.value
  if (page.value === 'flow') return flow.composing
  return false
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!visible.value) return
  // The IME owns arrows, Enter and Esc while it composes: they pick candidates, not actions.
  if (isImeComposing(event) || isPageComposing()) return

  if (event.key === 'Escape') {
    stop(event)
    handleEscape()
    return
  }

  // ⌘K closes the panel it opened, from any page. Not on auto-repeat: a held ⌘K keeps repeating
  // into the panel once it has focus, and toggling on each repeat would flicker it open and shut.
  if (isPanelToggle(event)) {
    stop(event)
    if (!event.repeat) void handleClose()
    return
  }

  if (page.value === 'flow') handleFlowKey(event)
  else if (page.value === 'flow-confirm') handleConfirmKey(event)
  else handleActionsKey(event)
}

function handleEscape(): void {
  if (page.value === 'flow-confirm') {
    // Once the grant is under way there is nothing left to deny.
    if (flow.consentLoading) void handleClose()
    else denyConsent()
    return
  }
  popPage()
}

function handleActionsKey(event: KeyboardEvent): void {
  const bare = !event.metaKey && !event.ctrlKey && !event.altKey
  if (bare && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    stop(event)
    step(event.key === 'ArrowDown' ? 1 : -1)
    return
  }

  if (bare && !event.shiftKey && event.key === 'Enter') {
    stop(event)
    // A fresh press only. An auto-repeat belongs to a press that already ran a row here, or began
    // before the panel had focus; CoreBox swallows the rest once main hands focus back to it.
    if (!event.repeat && activeRow.value) handleActionExecute(activeRow.value.row)
    return
  }

  const row = resolveMetaActionShortcut(model.value, event, { isMac, scope: 'panel' })
  if (!row) return
  stop(event)
  if (!event.repeat) handleActionExecute(row)
}

/**
 * The Flow targets. No action chords here: ⌘⇧D, the 流转 row's own key, does nothing on the page it
 * opens.
 */
function handleFlowKey(event: KeyboardEvent): void {
  // The filter is the page's one focus stop; Tab would leave the card.
  if (event.key === 'Tab') {
    event.preventDefault()
    return
  }

  const bare = !event.metaKey && !event.ctrlKey && !event.altKey
  if (bare && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    stop(event)
    if (flow.step(event.key === 'ArrowDown' ? 1 : -1)) {
      void nextTick(() => flowListRef.value?.scrollActiveIntoView())
    }
    return
  }

  if (bare && !event.shiftKey && event.key === 'Enter') {
    stop(event)
    // A fresh press only. The Enter that picked 流转 can still be held down when this page opens,
    // and its auto-repeat must not pick the first target.
    if (!event.repeat && flow.activeRow) void selectFlowRow(flow.activeRow)
  }
}

/** Tab moves between the buttons natively; past either end it wraps instead of leaving the card. */
function keepFocusOnConfirmButtons(event: KeyboardEvent): void {
  const buttons = (confirmRef.value?.buttons() ?? []).filter((button) => !button.disabled)
  const position = buttons.findIndex((button) => button === document.activeElement)
  const next = position + (event.shiftKey ? -1 : 1)
  if (position >= 0 && next >= 0 && next < buttons.length) return
  event.preventDefault()
  const wrapped = event.shiftKey ? buttons.at(-1) : buttons[0]
  wrapped?.focus()
}

function handleConfirmKey(event: KeyboardEvent): void {
  if (event.key === 'Tab') {
    keepFocusOnConfirmButtons(event)
    return
  }

  const bare = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
  if (bare && event.key === 'Enter') {
    stop(event)
    // The press that picked the target may still be held: its repeats must not also confirm it.
    if (event.repeat) return
    // Run explicitly: the default is prevented, and a button that has focus is the one meant.
    const focused = confirmRef.value?.buttons().find((button) => button === document.activeElement)
    if (focused) focused.click()
    else void grantConsent(flow.primaryMode)
  }
}

function handleBack(): void {
  // The back button fades out once the card is on the page it opened on, and stays clickable while
  // it does: the second click of a double click would take Esc's next step there and close the card.
  if (!canGoBack.value) return
  handleEscape()
}

async function selectFlowRow(row: MetaFlowTargetRow): Promise<void> {
  const outcome = await flow.select(row)
  if (!outcome || closeRequested) return
  if (outcome.kind === 'dispatch') executeFlowTransfer(outcome.selection)
  else pushPage('flow-confirm')
}

async function grantConsent(mode: 'once' | 'always'): Promise<void> {
  const selection = await flow.grant(mode)
  if (selection && !closeRequested) executeFlowTransfer(selection)
}

/** Back to the targets, with nothing granted and nothing sent. */
function denyConsent(): void {
  flow.deny()
  popPage()
}

function handleActionExecute(row: MetaActionRow): void {
  if (executingActionId.value || row.disabled) {
    return
  }

  // 流转 is a page of this card, not an action: the targets push in, and a target picked there
  // sends the transfer (`executeFlowTransfer`).
  if (row.id === COREBOX_FLOW_TRANSFER_ACTION_ID) {
    enterFlowPage()
    return
  }

  executingActionId.value = row.id
  visible.value = false
  const payload: MetaActionExecuteRequest & { item?: TuffItem } = {
    actionId: row.id,
    itemId: item.value?.id ?? '',
    item: item.value ?? undefined
  }

  // Dispatch is observed asynchronously, but the UI lock belongs only to this click. The legacy
  // channel may wait for its response timeout even after main has executed the action; holding
  // `executingActionId` for that whole period makes every action on a reopened panel inert.
  sendActionExecute(payload)
  searchQuery.value = ''
  activeIndex.value = 0
  executingActionId.value = null
}

/**
 * Sends the transfer with the target picked on the Flow page. Main relays both to the CoreBox
 * renderer, which builds the payload and dispatches it, then closes the card.
 */
function executeFlowTransfer(selection: MetaFlowSelection): void {
  visible.value = false
  sendActionExecute({
    actionId: COREBOX_FLOW_TRANSFER_ACTION_ID,
    itemId: item.value?.id ?? '',
    item: item.value ?? undefined,
    flow: selection
  })
}

function sendActionExecute(payload: MetaActionExecuteRequest): void {
  void transport
    .send(MetaOverlayEvents.action.execute, payload)
    .then((response) => {
      if (response && response.success === false) {
        throw new Error(response.error || 'MetaOverlay action failed')
      }
    })
    .catch((error) => {
      metaOverlayLog.error('Failed to execute action', error)
    })
}

async function handleClose() {
  closeRequested = true
  try {
    await transport.send(MetaOverlayEvents.ui.hide)
  } catch (error) {
    metaOverlayLog.error('Failed to hide', error)
  }
}

function scheduleReadyRetry(): void {
  const delay = META_OVERLAY_READY_RETRY_DELAYS_MS[readyRetryIndex]
  if (!rendererMounted || delay === undefined) return
  readyRetryIndex += 1
  readyRetryTimer = setTimeout(announceReady, delay)
}

function announceReady(): void {
  if (!rendererMounted) return
  try {
    void transport
      .send(MetaOverlayEvents.ui.ready)
      .then((response) => {
        if (response?.accepted === false) scheduleReadyRetry()
      })
      .catch((error) => {
        metaOverlayLog.error('Failed to announce MetaOverlay readiness', error)
        scheduleReadyRetry()
      })
  } catch (error) {
    metaOverlayLog.error('Failed to announce MetaOverlay readiness', error)
    scheduleReadyRetry()
  }
}

// Register keyboard handling before announcing readiness. Main can release a queued show request
// as soon as the ready call reaches it, so every listener needed by the visible panel must exist.
onMounted(() => {
  rendererMounted = true
  window.addEventListener('keydown', handleKeyDown, true)
  announceReady()
})

/**
 * The card leaves at once. Main hides this view in the same call that closes the panel, so a fade
 * could never be seen: it stalled at its first frame in the hidden view (no frames, no
 * `after-leave`) and kept the closed page in the DOM, which the next open showed for a frame
 * before its own content landed — a Flow confirmation flashing up ahead of the action list.
 */
function endLeave(_el: Element, done: () => void): void {
  done()
}

onBeforeUnmount(() => {
  rendererMounted = false
  if (readyRetryTimer) {
    clearTimeout(readyRetryTimer)
    readyRetryTimer = null
  }
  unregShow()
  unregHide()
  window.removeEventListener('keydown', handleKeyDown, true)
})
</script>

<template>
  <Transition name="meta-panel" @leave="endLeave">
    <div v-if="visible" class="MetaOverlay" :style="overlayStyle" @click.self="handleClose">
      <MetaPanel
        :title="headerTitle"
        :icon="headerIcon"
        :should-animate="shouldAnimate"
        :page="page"
        :direction="direction"
        :can-go-back="canGoBack"
        @back="handleBack"
      >
        <template v-if="page !== 'actions' && itemTitle" #header-meta>
          {{ t('flow.selectTarget') }}
        </template>

        <div v-if="page === 'actions'" key="actions" class="MetaPanel-Page">
          <MetaPanelList
            ref="actionsListRef"
            :list-id="LIST_ID"
            :list-label="t('corebox.actions.title')"
            :active-index="activeIndex"
            :highlight="activeRowHighlighted"
            :layout-key="sections"
            :should-animate="shouldAnimate"
          >
            <div
              v-for="section in sections"
              :key="section.key"
              class="MetaPanel-Section"
              role="group"
              :aria-labelledby="section.title ? section.titleId : undefined"
            >
              <div v-if="section.title" :id="section.titleId" class="MetaPanel-SectionTitle">
                {{ section.title }}
              </div>
              <MetaActionItem
                v-for="entry in section.rows"
                :id="entry.domId"
                :key="entry.row.id"
                :data-meta-row-index="entry.index"
                :label="entry.label"
                :subtitle="entry.subtitle"
                :glyph="'glyph' in entry.row.icon ? entry.row.icon.glyph : undefined"
                :icon="'icon' in entry.row.icon ? entry.row.icon.icon : undefined"
                :shortcuts="entry.shortcuts"
                :active="entry.index === activeIndex"
                :disabled="entry.row.disabled"
                :danger="entry.row.danger"
                @run="handleActionExecute(entry.row)"
                @hover="hoverRow(entry.index)"
              />
            </div>
            <p v-if="flatRows.length === 0" class="MetaPanel-Empty">
              {{ t('corebox.actions.empty') }}
            </p>
          </MetaPanelList>
          <MetaPanelFilter
            ref="actionsFilterRef"
            v-model:query="searchQuery"
            :list-id="LIST_ID"
            :placeholder="t('corebox.meta.searchPlaceholder')"
            :active-descendant="activeRow?.domId"
            @composition="composing = $event"
          >
            <template #key>
              <TxKbd class="MetaPanel-FilterKey">{{ toggleKeyLabel }}</TxKbd>
            </template>
          </MetaPanelFilter>
        </div>

        <div v-else-if="page === 'flow'" key="flow" class="MetaPanel-Page">
          <MetaPanelList
            ref="flowListRef"
            :list-id="META_FLOW_LIST_ID"
            :list-label="t('flow.selectTarget')"
            :active-index="flow.activeIndex"
            :highlight="flow.activeRowHighlighted"
            :layout-key="flow.sections"
            :should-animate="shouldAnimate"
          >
            <div
              v-for="section in flow.sections"
              :key="section.key"
              class="MetaPanel-Section"
              role="group"
              :aria-labelledby="section.titleId"
            >
              <div :id="section.titleId" class="MetaPanel-SectionTitle">
                {{ section.title }}
              </div>
              <MetaActionItem
                v-for="row in section.rows"
                :id="row.domId"
                :key="row.target.fullId"
                class="FlowTargetItem"
                :data-meta-row-index="row.index"
                :label="row.target.name"
                :subtitle="row.subtitle"
                :icon="row.icon"
                :shortcuts="[]"
                :active="row.index === flow.activeIndex"
                :disabled="row.target.isEnabled === false"
                @run="selectFlowRow(row)"
                @hover="hoverFlowRow(row.index)"
              >
                <template v-if="row.target.requireConfirm" #trailing>
                  <i
                    class="FlowTargetItem-Confirm i-ri-shield-check-line"
                    role="img"
                    :aria-label="t('flow.requiresConfirmation')"
                    :title="t('flow.requiresConfirmation')"
                  />
                </template>
              </MetaActionItem>
            </div>
            <!-- Holds the one row the page was sized for while targets load; says so only after the
                 deferral, so a fast answer never flashes it. -->
            <p
              v-if="flow.loading || (flow.showLoading && flow.flatRows.length === 0)"
              class="MetaPanel-Empty MetaOverlay-FlowStatus"
            >
              <template v-if="flow.showLoading">
                <TxSpinner :size="12" :label="t('common.loading')" />
                <span aria-hidden="true">{{ t('common.loading') }}</span>
              </template>
            </p>
            <p v-else-if="flow.flatRows.length === 0" class="MetaPanel-Empty">
              {{ t('flow.noTargets') }}
            </p>
          </MetaPanelList>
          <MetaPanelFilter
            ref="flowFilterRef"
            v-model:query="flow.query"
            :list-id="META_FLOW_LIST_ID"
            :placeholder="t('flow.searchTargets')"
            :active-descendant="flow.activeRow?.domId"
            @composition="flow.composing = $event"
          >
            <template #key>
              <TxKbd class="MetaPanel-FilterKey">Esc</TxKbd>
            </template>
          </MetaPanelFilter>
        </div>

        <div v-else key="flow-confirm" class="MetaPanel-Page">
          <MetaFlowConfirm
            ref="confirmRef"
            :title="flow.confirmTitle"
            :description="flow.confirmDescription"
            :deny-label="t('flow.consentDeny')"
            :once-label="flow.onceLabel"
            :show-once="flow.showAlwaysAction"
            :primary-label="flow.primaryLabel"
            :loading="flow.consentLoading"
            @deny="denyConsent"
            @once="grantConsent('once')"
            @primary="grantConsent(flow.primaryMode)"
          />
        </div>
      </MetaPanel>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
/**
 * The light dim over the launcher: 10% black, from the overlay token, on every platform and in
 * both themes. No blur and no glass, so the panel reads the same on macOS, Windows and Linux.
 */
.MetaOverlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: color-mix(in srgb, var(--tx-overlay-color) 20%, transparent);
}

.FlowTargetItem-Confirm {
  display: inline-block;
  width: 14px;
  height: 14px;
  font-size: 14px;
  color: var(--tx-text-color-secondary);
}

.MetaOverlay-FlowStatus {
  gap: 8px;
}

// Entering only: the card leaves at once (`endLeave`).
.meta-panel-enter-active {
  transition: opacity 0.12s ease-out;
}

// `.MetaPanel` is MetaPanel's root element, which carries this view's scope id as well as its own,
// so these rules reach it.
.meta-panel-enter-active .MetaPanel {
  transition:
    opacity 0.12s ease-out,
    transform 0.12s ease-out;
}

.meta-panel-enter-from {
  opacity: 0;
}

.meta-panel-enter-from .MetaPanel {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .meta-panel-enter-active .MetaPanel {
    transition: opacity 0.12s ease-out;
  }

  .meta-panel-enter-from .MetaPanel {
    transform: none;
  }
}
</style>
