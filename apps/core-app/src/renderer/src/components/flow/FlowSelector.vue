<script setup lang="ts">
/**
 * The Flow picker: where to send the selected item. The ⌘K panel's card (`MetaPanel`), anchored the
 * same way bottom-right over the same light dim, with the targets grouped by plugin. A target that
 * needs consent or confirmation asks for it inside the card.
 *
 * Unlike the ⌘K panel it is drawn in the CoreBox window, under CoreBox's own keyboard handler. It
 * takes every key while open (see `handleKeyDown`), and asks CoreBox for window room through
 * `room` (`useFlowPanelRoom`), the way main grows the window for the ⌘K panel.
 */
import type { FlowPayload, FlowTargetInfo, ITuffIcon, TuffItem } from '@talex-touch/utils'
import type { FlowConsentCheckResponse } from '@talex-touch/utils/transport/events/types'
import type { MetaPanelAnchor } from '@talex-touch/utils/transport/events/types/meta-overlay'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { nextZIndex } from '@talex-touch/tuffex/utils'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { FlowEvents } from '@talex-touch/utils/transport/events'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MetaActionItem from '~/components/meta/MetaActionItem.vue'
import MetaPanel from '~/components/meta/MetaPanel.vue'
import { normalizeCoreBoxIcon } from '~/components/render/icon-color-mode'
import { isImeComposing } from '~/modules/box/meta-actions/meta-action-model'
import {
  matchesMetaPanelQuery,
  normalizeMetaPanelQuery
} from '~/modules/box/meta-actions/meta-panel-filter'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  estimateMetaPanelHeight,
  META_PANEL_ITEM_HEADER_HEIGHT,
  resolveMetaOverlayWindowHeight,
  resolveMetaPanelCssVars
} from '../../../../shared/meta-overlay-geometry'

interface Props {
  visible: boolean
  sessionId?: string
  payload?: FlowPayload | null
  /** Where the card anchors, by the ⌘K panel's rule (`useDetach`). */
  anchor?: MetaPanelAnchor
  /**
   * The CoreBox window's motion gate (`useMotionGate().shouldAnimate`), for the hover plate. Passed
   * in: the window has one gate.
   */
  shouldAnimate: () => boolean
}

const props = withDefaults(defineProps<Props>(), { anchor: 'corner' })

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'select',
    payload: { targetId: string; consentToken?: string; confirmationToken?: string }
  ): void
  /** The window height the card needs while open (CSS px), and 0 once it has left the screen. */
  (e: 'room', height: number): void
}>()

const { t } = useI18n()

const transport = useTuffTransport()
const flowSelectorLog = createRendererLogger('FlowSelector')

const LIST_ID = 'flow-panel-list'
const FALLBACK_HEADER_ICON: ITuffIcon = { type: 'class', value: 'i-ri-share-forward-line' }
/**
 * Height of the confirmation view: header 40, padding 12, title 20 (13px on a 20px line), gap 4,
 * up to four description lines of 12px at 1.5 (72), gap 12 (the column's 4 and the actions' 8),
 * two rows of TxButton `sm` (26 each, 8 apart) and padding 12, so 232. The second button row is
 * English's: its three labels wrap at this width, and its card measured 232px in the real window,
 * the Chinese one, on one row, 162px. A longer description scrolls inside the card.
 */
const FLOW_CONFIRM_PANEL_HEIGHT =
  META_PANEL_ITEM_HEADER_HEIGHT + 12 + 20 + 4 + 4 * 18 + 12 + (26 + 8 + 26) + 12
/**
 * Longest a closed card keeps its window room. `after-leave` gives the room back once the 120 ms
 * leave has run; this covers a leave whose frames never come, as when the window hides mid-fade,
 * after which CoreBox would show next at the old card's height.
 */
const ROOM_RELEASE_FALLBACK_MS = 400

// Opaque transport records: nothing here mutates them.
const targets = shallowRef<FlowTargetInfo[]>([])
const loading = ref(false)
const showLoading = useDeferredLoading(loading)
// The window's height when the card opened, which it asks for at least while its targets load.
const openWindowHeight = ref(0)
const searchQuery = ref('')
const activeIndex = ref(0)
const composing = ref(false)
const consentTarget = shallowRef<FlowTargetInfo | null>(null)
const consentRequiresAuthorization = ref(false)
const consentRequiresExecutionConfirmation = ref(false)
const consentLoading = ref(false)
const zIndex = nextZIndex()

const rootRef = ref<HTMLElement>()
const panelRef = ref<InstanceType<typeof MetaPanel> | null>(null)
const confirmRef = ref<HTMLElement>()

// Bumped when the panel opens or closes: a reply that lands after that belongs to a panel that is
// gone, and must not select a target for the content of the next one.
let openGeneration = 0
// Taken when a target is picked, so a second Enter or click cannot dispatch the content twice.
// Denying the confirmation gives it back; the next open starts without it.
let selectionLocked = false
// What had focus when the panel opened. It gets focus back on close, as CoreBox's input does when
// main closes the ⌘K panel.
let returnFocusTo: HTMLElement | null = null
// Set from the moment the card closes until its room is given back (`releaseRoom`).
let roomReleaseTimer: ReturnType<typeof setTimeout> | null = null

const confirming = computed(() => consentTarget.value !== null)

const flowItem = computed<TuffItem | null>(() => {
  const data = props.payload?.data
  if (!data || typeof data !== 'object') return null
  const item = (data as { item?: unknown }).item
  return item && typeof item === 'object' ? (item as TuffItem) : null
})
const itemTitle = computed(() => flowItem.value?.render?.basic?.title?.trim() ?? '')
const headerTitle = computed(() => itemTitle.value || t('flow.selectTarget'))
const headerIcon = computed<ITuffIcon>(() =>
  flowItem.value ? normalizeCoreBoxIcon(flowItem.value.render?.basic?.icon) : FALLBACK_HEADER_ICON
)

interface TargetRow {
  target: FlowTargetInfo
  icon: ITuffIcon
  subtitle?: string
  /** Position in the flattened, filtered list: the keyboard index. */
  index: number
  domId: string
}

interface TargetSection {
  key: string
  title: string
  titleId: string
  rows: TargetRow[]
}

/** Targets by plugin, each plugin where main first lists one of its targets. */
const groups = computed(() => {
  const byPlugin = new Map<string, FlowTargetInfo[]>()
  for (const target of targets.value) {
    const group = byPlugin.get(target.pluginId)
    if (group) group.push(target)
    else byPlugin.set(target.pluginId, [target])
  }
  return [...byPlugin.values()]
})

const sections = computed<TargetSection[]>(() => {
  const query = normalizeMetaPanelQuery(searchQuery.value)
  let index = 0
  const result: TargetSection[] = []
  for (const group of groups.value) {
    const rows: TargetRow[] = []
    for (const target of group) {
      const subtitle = target.description || target.adaptationHint || undefined
      if (!matchesMetaPanelQuery(query, target.name, [subtitle, target.pluginName])) continue
      rows.push({
        target,
        // `ri:` names from main become `i-ri-` classes; no icon falls back to the plugin's.
        icon: normalizeCoreBoxIcon(target.icon || target.pluginIcon),
        subtitle,
        index,
        domId: `${LIST_ID}-option-${index}`
      })
      index += 1
    }
    if (rows.length === 0) continue
    const owner = group[0]!
    result.push({
      key: owner.pluginId,
      title: owner.pluginName || owner.pluginId,
      titleId: `${LIST_ID}-section-${result.length}`,
      rows
    })
  }
  return result
})

const flatRows = computed(() => sections.value.flatMap((section) => section.rows))
const activeRow = computed(() => flatRows.value[activeIndex.value] ?? null)
const activeRowHighlighted = computed(
  () => activeRow.value !== null && activeRow.value.target.isEnabled !== false
)

/**
 * The list view's height, from every target rather than the filtered ones: as with the ⌘K panel,
 * typing in the filter does not resize the window. Loading and an empty list draw one row.
 */
const listPanelHeight = computed(() => {
  const sectionCount = groups.value.length
  if (sectionCount === 0) {
    return estimateMetaPanelHeight({ rows: 1, sections: 1, titledSections: 0 })
  }
  return estimateMetaPanelHeight({
    rows: targets.value.length,
    sections: sectionCount,
    titledSections: sectionCount
  })
})
// Never shorter than the list: going back to it must not shrink the window and grow it again.
const panelHeight = computed(() =>
  confirming.value
    ? Math.max(listPanelHeight.value, FLOW_CONFIRM_PANEL_HEIGHT)
    : listPanelHeight.value
)
/**
 * The window height the card asks for. While its targets load the card is sized for one row, and
 * it asks for no less than the window it opened in. Picked from the ⌘K panel, it opens in a window
 * main grew for that panel, and main lets the first layout CoreBox sends after 流转 set the height
 * instead of restoring the old one: a one-row room would shrink that window, and the loaded list
 * then grow it again. Once the targets are known, the window moves once, in one direction.
 */
const roomHeight = computed(() => {
  const needed =
    resolveMetaOverlayWindowHeight({
      anchor: props.anchor,
      desiredPanelHeight: panelHeight.value
    }) ?? 0
  return loading.value ? Math.max(needed, openWindowHeight.value) : needed
})

/** Geometry the card's CSS reads, the numbers the window room is computed with. */
const rootStyle = computed(() => ({ ...resolveMetaPanelCssVars(props.anchor), zIndex }))

const senderId = computed(() => props.payload?.context?.sourcePluginId || 'corebox')
const consentTargetName = computed(
  () => consentTarget.value?.pluginName || consentTarget.value?.name || t('flow.defaultTarget')
)
const consentDialogTitle = computed(() => {
  if (consentRequiresAuthorization.value && consentRequiresExecutionConfirmation.value) {
    return t('flow.authorizationAndConfirmationTitle')
  }
  if (consentRequiresExecutionConfirmation.value) {
    return t('flow.executionConfirmationTitle')
  }
  return t('flow.consentTitle')
})
const consentDialogDescription = computed(() => {
  // Both bundles name the sender `{source}`.
  const params = {
    source: senderId.value,
    target: consentTargetName.value
  }
  if (consentRequiresAuthorization.value && consentRequiresExecutionConfirmation.value) {
    return t('flow.authorizationAndConfirmationDesc', params)
  }
  if (consentRequiresExecutionConfirmation.value) {
    return t('flow.executionConfirmationDesc', params)
  }
  return t('flow.consentDesc', params)
})
const onceConsentLabel = computed(() =>
  consentRequiresExecutionConfirmation.value && consentRequiresAuthorization.value
    ? t('flow.allowAndConfirmOnce')
    : consentRequiresExecutionConfirmation.value
      ? t('flow.confirmOnce')
      : t('flow.consentOnce')
)
const showAlwaysConsentAction = computed(() => consentRequiresAuthorization.value)
const primaryConsentLabel = computed(() =>
  consentRequiresExecutionConfirmation.value && consentRequiresAuthorization.value
    ? t('flow.confirmAndSend')
    : consentRequiresExecutionConfirmation.value
      ? t('flow.confirmOnce')
      : t('flow.consentAlways')
)
const primaryConsentMode = computed<'once' | 'always'>(() =>
  showAlwaysConsentAction.value ? 'always' : 'once'
)

async function loadTargets(generation: number): Promise<void> {
  loading.value = true
  try {
    const response = await transport.send(FlowEvents.getTargets, {
      payloadType: props.payload?.type
    })
    if (generation !== openGeneration) return

    if (response?.success) {
      targets.value = response.data || []
    } else {
      flowSelectorLog.error('Failed to load targets:', response?.error)
      targets.value = []
    }
  } catch (error) {
    if (generation !== openGeneration) return
    flowSelectorLog.error('Error loading targets:', error)
    targets.value = []
  } finally {
    if (generation === openGeneration) loading.value = false
  }
}

async function selectTarget(target: FlowTargetInfo): Promise<void> {
  if (selectionLocked || target.isEnabled === false) return
  selectionLocked = true
  const generation = openGeneration

  let response: FlowConsentCheckResponse | undefined
  try {
    response = await transport.send(FlowEvents.checkConsent, {
      senderId: senderId.value,
      targetId: target.fullId
    })
  } catch (error) {
    if (generation !== openGeneration) return
    flowSelectorLog.error('Failed to check consent:', error)
    selectionLocked = false
    return
  }
  if (generation !== openGeneration) return

  const allowed = response?.success === true && response.data?.allowed === true
  const requiresConfirmation = response?.data?.requiresConfirmation === true
  if (allowed && !requiresConfirmation) {
    emit('select', { targetId: target.fullId })
    return
  }
  consentRequiresAuthorization.value = !allowed
  consentRequiresExecutionConfirmation.value = requiresConfirmation
  consentTarget.value = target
}

async function handleConsent(mode: 'once' | 'always'): Promise<void> {
  const target = consentTarget.value
  if (!target || consentLoading.value) return
  consentLoading.value = true
  const generation = openGeneration

  try {
    const response = await transport.send(FlowEvents.grantConsent, {
      senderId: senderId.value,
      targetId: target.fullId,
      mode
    })
    if (generation !== openGeneration) return
    if (response?.success) {
      emit('select', {
        targetId: target.fullId,
        consentToken: response.data?.token,
        confirmationToken: response.data?.confirmationToken
      })
      // The buttons stay disabled until CoreBox closes the panel: the content is on its way.
      return
    }
    flowSelectorLog.error('Failed to grant consent:', response?.error)
  } catch (error) {
    if (generation !== openGeneration) return
    flowSelectorLog.error('Failed to grant consent:', error)
  }
  consentLoading.value = false
}

function resetConsent(): void {
  consentTarget.value = null
  consentRequiresAuthorization.value = false
  consentRequiresExecutionConfirmation.value = false
  consentLoading.value = false
}

/** Back to the list, with nothing granted and nothing sent. */
async function handleConsentDeny(): Promise<void> {
  resetConsent()
  selectionLocked = false
  // The list and the filter are mounted again; the active row may sit below the fold.
  await nextTick()
  panelRef.value?.focusFilter()
  panelRef.value?.scrollActiveIntoView()
}

function handleClose(): void {
  emit('close')
}

function firstSelectableIndex(): number {
  const found = flatRows.value.find((row) => row.target.isEnabled !== false)
  return found ? found.index : 0
}

function scrollActiveIntoView(): void {
  panelRef.value?.scrollActiveIntoView()
}

function step(delta: number): void {
  const selectable = flatRows.value.filter((row) => row.target.isEnabled !== false)
  if (selectable.length === 0) return
  const position = selectable.findIndex((row) => row.index === activeIndex.value)
  const next =
    position < 0
      ? selectable[delta > 0 ? 0 : selectable.length - 1]!
      : selectable[(position + delta + selectable.length) % selectable.length]!
  activeIndex.value = next.index
  void nextTick(scrollActiveIntoView)
}

/** Pointer hover follows real movement only: a card opening under a resting cursor keeps ↵. */
function hoverRow(index: number): void {
  const row = flatRows.value[index]
  if (row && row.target.isEnabled !== false && index !== activeIndex.value) {
    panelRef.value?.glideNext()
    activeIndex.value = index
  }
}

function runRow(row: TargetRow): void {
  void selectTarget(row.target)
}

function confirmButtons(): HTMLButtonElement[] {
  return Array.from(confirmRef.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])
}

/** Tab moves between the buttons natively; past either end it wraps instead of leaving the card. */
function keepFocusOnButtons(event: KeyboardEvent): void {
  const buttons = confirmButtons().filter((button) => !button.disabled)
  const position = buttons.findIndex((button) => button === document.activeElement)
  const next = position + (event.shiftKey ? -1 : 1)
  if (position >= 0 && next >= 0 && next < buttons.length) return
  event.preventDefault()
  const wrapped = event.shiftKey ? buttons.at(-1) : buttons[0]
  wrapped?.focus()
}

function handleListKey(event: KeyboardEvent): void {
  // The IME owns arrows and Enter while it composes: they pick candidates, not targets.
  if (isImeComposing(event) || composing.value) return

  if (event.key === 'Escape') {
    event.preventDefault()
    handleClose()
    return
  }

  // The filter is the card's one focus stop; Tab would leave it for CoreBox behind the dim.
  if (event.key === 'Tab') {
    event.preventDefault()
    return
  }

  const bare = !event.metaKey && !event.ctrlKey && !event.altKey
  if (bare && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    step(event.key === 'ArrowDown' ? 1 : -1)
    return
  }

  if (bare && !event.shiftKey && event.key === 'Enter') {
    event.preventDefault()
    // A fresh press only. The Enter that picked 流转 in the ⌘K panel can still be held down when
    // this card opens, and its auto-repeat must not pick the first target.
    if (!event.repeat && activeRow.value) void selectTarget(activeRow.value.target)
  }
}

function handleConfirmKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    // Once the grant is under way there is nothing left to deny.
    if (consentLoading.value) handleClose()
    else void handleConsentDeny()
    return
  }

  if (event.key === 'Tab') {
    keepFocusOnButtons(event)
    return
  }

  const bare = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
  if (bare && event.key === 'Enter') {
    event.preventDefault()
    // The press that picked the target may still be held: its repeats must not also confirm it.
    if (event.repeat) return
    // Run explicitly: propagation is stopped, and a button that has focus is the one meant.
    const focused = confirmButtons().find((button) => button === document.activeElement)
    if (focused) focused.click()
    else void handleConsent(primaryConsentMode.value)
  }
}

/**
 * The card is modal and takes every key while it is open. CoreBox listens on the document, after
 * this capture listener on the window, and would otherwise run the result behind the dim on Enter,
 * move its selection on the arrows and close CoreBox on Escape. A key the card does not use keeps
 * its default action, so typing still reaches the filter.
 */
function handleKeyDown(event: KeyboardEvent): void {
  if (!props.visible) return
  event.stopPropagation()
  if (confirming.value) handleConfirmKey(event)
  else handleListKey(event)
}

function restoreFocus(): void {
  const target = returnFocusTo
  returnFocusTo = null
  if (!target?.isConnected) return
  // Only from where the card left it: focus the user moved elsewhere stays there.
  const active = document.activeElement
  if (active && active !== document.body && !rootRef.value?.contains(active)) return
  target.focus()
}

watch(
  () => props.visible,
  (visible) => {
    openGeneration += 1
    if (!visible) {
      loading.value = false
      restoreFocus()
      return
    }

    const active = document.activeElement
    returnFocusTo = active instanceof HTMLElement && active !== document.body ? active : null
    selectionLocked = false
    composing.value = false
    resetConsent()
    searchQuery.value = ''
    targets.value = []
    activeIndex.value = 0
    openWindowHeight.value = window.innerHeight
    void loadTargets(openGeneration)
    void nextTick(() => panelRef.value?.focusFilter())
  }
)

// Loaded targets start on their first row again.
watch(targets, () => {
  activeIndex.value = firstSelectableIndex()
})

watch(
  () => normalizeMetaPanelQuery(searchQuery.value),
  () => {
    activeIndex.value = firstSelectableIndex()
    void nextTick(scrollActiveIntoView)
  }
)

// The confirmation starts on its primary button: Enter confirms, Escape denies.
watch(
  confirming,
  (isConfirming) => {
    if (!isConfirming) return
    confirmRef.value?.querySelector<HTMLButtonElement>('.FlowSelector-ConfirmPrimary')?.focus()
  },
  { flush: 'post' }
)

function cancelRoomRelease(): void {
  if (roomReleaseTimer === null) return
  clearTimeout(roomReleaseTimer)
  roomReleaseTimer = null
}

/**
 * Gives a closed card's window room back, on `after-leave` or from the fallback timer, whichever
 * comes first. Nothing is pending once the card opens again: Vue then ends the old card's leave at
 * once, and the room stays with the new card.
 */
function releaseRoom(): void {
  if (roomReleaseTimer === null) return
  cancelRoomRelease()
  emit('room', 0)
}

// The window fits the card for as long as it is on screen, its fade-out included: the card is
// anchored to the window's bottom edge and capped at its height, so a window shrinking under the
// fade-out squeezed it as it went. The room goes back once the card has left (`releaseRoom`).
watch([() => props.visible, roomHeight], ([visible, height], [wasVisible]) => {
  if (visible) {
    cancelRoomRelease()
    emit('room', height)
  } else if (wasVisible) {
    roomReleaseTimer = setTimeout(releaseRoom, ROOM_RELEASE_FALLBACK_MS)
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
  cancelRoomRelease()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="meta-panel" @after-leave="releaseRoom">
      <div
        v-if="visible"
        ref="rootRef"
        class="FlowSelector"
        :style="rootStyle"
        @click.self="handleClose"
      >
        <MetaPanel
          ref="panelRef"
          v-model:query="searchQuery"
          :title="headerTitle"
          :icon="headerIcon"
          :list-id="LIST_ID"
          :list-label="t('flow.selectTarget')"
          :placeholder="t('flow.searchTargets')"
          :active-index="activeIndex"
          :active-descendant="activeRow?.domId"
          :highlight="activeRowHighlighted"
          :layout-key="sections"
          :should-animate="shouldAnimate"
          :view="confirming ? 'body' : 'list'"
          @composition="composing = $event"
        >
          <template v-if="itemTitle" #header-meta>
            <span class="FlowSelector-HeaderMeta">{{ t('flow.selectTarget') }}</span>
          </template>

          <div
            v-for="section in sections"
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
              :active="row.index === activeIndex"
              :disabled="row.target.isEnabled === false"
              @run="runRow(row)"
              @hover="hoverRow(row.index)"
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
          <!-- Holds the one row the card was sized for while targets load; says so only after the
               deferral, so a fast answer never flashes it. -->
          <p
            v-if="loading || (showLoading && flatRows.length === 0)"
            class="MetaPanel-Empty FlowSelector-Status"
          >
            <template v-if="showLoading">
              <TxSpinner :size="12" :label="t('common.loading')" />
              <span aria-hidden="true">{{ t('common.loading') }}</span>
            </template>
          </p>
          <p v-else-if="flatRows.length === 0" class="MetaPanel-Empty">
            {{ t('flow.noTargets') }}
          </p>

          <template #filter-key>
            <TxKbd class="MetaPanel-FilterKey">Esc</TxKbd>
          </template>

          <template #body>
            <div
              ref="confirmRef"
              class="FlowSelector-Confirm"
              role="group"
              aria-labelledby="flow-panel-confirm-title"
              aria-describedby="flow-panel-confirm-description"
            >
              <p id="flow-panel-confirm-title" class="FlowSelector-ConfirmTitle">
                {{ consentDialogTitle }}
              </p>
              <p id="flow-panel-confirm-description" class="FlowSelector-ConfirmDescription">
                {{ consentDialogDescription }}
              </p>
              <div class="FlowSelector-ConfirmActions">
                <TxButton
                  variant="secondary"
                  size="sm"
                  :disabled="consentLoading"
                  @click="handleConsentDeny"
                >
                  {{ t('flow.consentDeny') }}
                </TxButton>
                <TxButton
                  v-if="showAlwaysConsentAction"
                  variant="secondary"
                  size="sm"
                  :disabled="consentLoading"
                  @click="handleConsent('once')"
                >
                  {{ onceConsentLabel }}
                </TxButton>
                <TxButton
                  class="FlowSelector-ConfirmPrimary"
                  variant="primary"
                  size="sm"
                  :disabled="consentLoading"
                  @click="handleConsent(primaryConsentMode)"
                >
                  {{ primaryConsentLabel }}
                </TxButton>
              </div>
            </div>
          </template>
        </MetaPanel>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
// The ⌘K panel's light dim: 20% of the overlay token, no blur, on every platform and in both themes.
.FlowSelector {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--tx-overlay-color) 20%, transparent);
}

.FlowSelector-HeaderMeta {
  flex: none;
  margin-left: auto;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.FlowTargetItem-Confirm {
  display: inline-block;
  width: 14px;
  height: 14px;
  font-size: 14px;
  color: var(--tx-text-color-secondary);
}

.FlowSelector-Status {
  gap: 8px;
}

.FlowSelector-Confirm {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.FlowSelector-ConfirmTitle {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}

.FlowSelector-ConfirmDescription {
  margin: 0;
  // Read before deciding: `secondary` ink is under AA for text (tuffex-design-rules).
  color: var(--tx-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
}

.FlowSelector-ConfirmActions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.meta-panel-enter-active,
.meta-panel-leave-active {
  transition: opacity 0.12s ease-out;
}

// `.MetaPanel` is MetaPanel's root element, which carries this component's scope id as well as its
// own, so these rules reach it.
.meta-panel-enter-active .MetaPanel,
.meta-panel-leave-active .MetaPanel {
  transition:
    opacity 0.12s ease-out,
    transform 0.12s ease-out;
}

.meta-panel-enter-from,
.meta-panel-leave-to {
  opacity: 0;
}

.meta-panel-enter-from .MetaPanel,
.meta-panel-leave-to .MetaPanel {
  opacity: 0;
  transform: translateY(4px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .meta-panel-enter-active .MetaPanel,
  .meta-panel-leave-active .MetaPanel {
    transition: opacity 0.12s ease-out;
  }

  .meta-panel-enter-from .MetaPanel,
  .meta-panel-leave-to .MetaPanel {
    transform: none;
  }
}
</style>
