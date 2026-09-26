<script setup lang="ts">
import type { TuffItem } from '@talex-touch/utils'
import type {
  MetaActionExecuteRequest,
  MetaShowRequest
} from '@talex-touch/utils/transport/events/types/meta-overlay'
import type {
  MetaActionLabel,
  MetaActionModel,
  MetaActionRow
} from '~/modules/box/meta-actions/meta-action-model'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { TxIcon as TuffIcon } from '@talex-touch/tuffex/icon'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MetaActionItem from '~/components/meta/MetaActionItem.vue'
import { normalizeCoreBoxIcon } from '~/components/render/icon-color-mode'
import {
  buildMetaActionModel,
  isImeComposing,
  metaActionShortcutLabels,
  resolveMetaActionShortcut
} from '~/modules/box/meta-actions/meta-action-model'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import { shortcutChordLabel } from '~/modules/shortcuts/shortcut-chord'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  META_PANEL_EDGE_GAP,
  META_PANEL_FILTER_HEIGHT,
  META_PANEL_ITEM_HEADER_HEIGHT,
  META_PANEL_LIST_PADDING,
  META_PANEL_MAX_HEIGHT,
  META_PANEL_ROW_HEIGHT,
  META_PANEL_SECTION_GAP,
  META_PANEL_SECTION_TITLE_HEIGHT,
  META_PANEL_TOP_INSET,
  META_PANEL_WIDTH,
  resolveMetaPanelBottomInset
} from '../../../../shared/meta-overlay-geometry'

/**
 * The ⌘K action panel: a compact card anchored bottom-right, above the CoreBox footer's ⌘K hint
 * (or in the window corner when there is no footer), over a light dim of the launcher.
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

const searchInput = ref<HTMLInputElement>()
const listRef = ref<HTMLElement>()

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

/** Whether every query character appears in the text in order (`cp` → "Copy Path"). */
function isSubsequence(query: string, text: string): boolean {
  let cursor = 0
  for (const char of query) {
    const found = text.indexOf(char, cursor)
    if (found === -1) return false
    cursor = found + 1
  }
  return true
}

function matchesQuery(label: string, subtitle: string | undefined, query: string): boolean {
  if (!query) return true
  const title = label.toLowerCase()
  const detail = subtitle?.toLowerCase() ?? ''
  return title.includes(query) || detail.includes(query) || isSubsequence(query, title)
}

const sections = computed<PanelSection[]>(() => {
  const resolved = model.value.rows.map((row) => ({ row, label: resolveLabel(row.label) }))
  // A subtitle is noise unless two rows would otherwise read the same.
  const labelCounts = new Map<string, number>()
  for (const entry of resolved) {
    labelCounts.set(entry.label, (labelCounts.get(entry.label) ?? 0) + 1)
  }

  const query = searchQuery.value.trim().toLowerCase()
  let index = 0
  const result: PanelSection[] = []
  for (const section of model.value.sections) {
    const rows: PanelRow[] = []
    for (const entry of resolved) {
      if (entry.row.section !== section.key) continue
      const subtitle = (labelCounts.get(entry.label) ?? 0) > 1 ? entry.row.subtitle : undefined
      if (!matchesQuery(entry.label, subtitle ?? entry.row.subtitle, query)) continue
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

const headerTitle = computed(
  () => item.value?.render?.basic?.title?.trim() || t('corebox.actions.title')
)
const headerIcon = computed(() => normalizeCoreBoxIcon(item.value?.render?.basic?.icon))
const toggleKeyLabel = shortcutChordLabel({ code: 'KeyK' }, isMac)

/** Geometry the panel's CSS reads; the same numbers main grows the window with. */
const overlayStyle = computed(() => ({
  '--meta-panel-width': `${META_PANEL_WIDTH}px`,
  '--meta-panel-max-height': `${META_PANEL_MAX_HEIGHT}px`,
  '--meta-panel-right': `${META_PANEL_EDGE_GAP}px`,
  '--meta-panel-top': `${META_PANEL_TOP_INSET}px`,
  '--meta-panel-bottom': `${resolveMetaPanelBottomInset(request.value?.anchor)}px`,
  '--meta-header-height': `${META_PANEL_ITEM_HEADER_HEIGHT}px`,
  '--meta-filter-height': `${META_PANEL_FILTER_HEIGHT}px`,
  '--meta-list-padding': `${META_PANEL_LIST_PADDING}px`,
  '--meta-row-height': `${META_PANEL_ROW_HEIGHT}px`,
  '--meta-section-title-height': `${META_PANEL_SECTION_TITLE_HEIGHT}px`,
  '--meta-section-gap': `${META_PANEL_SECTION_GAP}px`
}))

function firstSelectableIndex(): number {
  const found = flatRows.value.find((entry) => !entry.row.disabled)
  return found ? found.index : 0
}

function scrollActiveIntoView(): void {
  const element = listRef.value?.querySelector<HTMLElement>(
    `[data-meta-row-index="${activeIndex.value}"]`
  )
  // Instant: a smooth scroll would trail behind a held arrow key.
  element?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
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
  if (entry && !entry.row.disabled && index !== activeIndex.value) activeIndex.value = index
}

// Listen for show/hide messages from main process via IPC
const unregShow = transport.on(MetaOverlayEvents.ui.show, (data: MetaShowRequest) => {
  item.value = data.item
  request.value = data
  executingActionId.value = null
  visible.value = true
  return { accepted: true }
})

const unregHide = transport.on(MetaOverlayEvents.ui.hide, () => {
  visible.value = false
  searchQuery.value = ''
  activeIndex.value = 0
  executingActionId.value = null
  composing.value = false
})

// Focus the filter when shown. `nextTick` rather than a timeout: the input exists as soon as the
// `v-if` subtree is patched, and a fixed delay only postponed a usable panel.
watch(visible, async (newVisible) => {
  if (!newVisible) return
  searchQuery.value = ''
  activeIndex.value = firstSelectableIndex()
  await nextTick()
  searchInput.value?.focus()
})

// A new request (a reopen, or a different item) starts on its primary row again.
watch(request, () => {
  activeIndex.value = firstSelectableIndex()
})

watch(
  () => searchQuery.value.trim().toLowerCase(),
  () => {
    activeIndex.value = firstSelectableIndex()
    void nextTick(scrollActiveIntoView)
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

function handleKeyDown(event: KeyboardEvent): void {
  if (!visible.value) return
  // The IME owns arrows and Enter while it composes: they pick candidates, not actions.
  if (isImeComposing(event) || composing.value) return

  if (event.key === 'Escape') {
    stop(event)
    void handleClose()
    return
  }

  // ⌘K closes the panel it opened. Not on auto-repeat: a held ⌘K keeps repeating into the panel
  // once it has focus, and toggling on each repeat would flicker it open and shut.
  if (isPanelToggle(event)) {
    stop(event)
    if (!event.repeat) void handleClose()
    return
  }

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

function handleActionExecute(row: MetaActionRow): void {
  if (executingActionId.value || row.disabled) {
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
  const pending = transport.send(MetaOverlayEvents.action.execute, payload)
  searchQuery.value = ''
  activeIndex.value = 0
  executingActionId.value = null

  void pending
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
  <Transition name="meta-panel">
    <div v-if="visible" class="MetaOverlay" :style="overlayStyle" @click.self="handleClose">
      <section class="MetaPanel" role="dialog" aria-modal="true" :aria-label="headerTitle">
        <header class="MetaPanel-Header">
          <TuffIcon :icon="headerIcon" :size="16" class="MetaPanel-HeaderIcon" />
          <span class="MetaPanel-HeaderTitle" :title="headerTitle">{{ headerTitle }}</span>
        </header>

        <div
          :id="LIST_ID"
          ref="listRef"
          class="MetaPanel-List"
          role="listbox"
          :aria-label="t('corebox.actions.title')"
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
        </div>

        <footer class="MetaPanel-Filter">
          <i class="MetaPanel-FilterIcon i-ri-search-line" aria-hidden="true" />
          <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            class="SearchInput"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            :aria-controls="LIST_ID"
            :aria-activedescendant="activeRow?.domId"
            :aria-label="t('corebox.meta.searchPlaceholder')"
            :placeholder="t('corebox.meta.searchPlaceholder')"
            @compositionstart="composing = true"
            @compositionend="composing = false"
          />
          <TxKbd class="MetaPanel-FilterKey">{{ toggleKeyLabel }}</TxKbd>
        </footer>
      </section>
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

.MetaPanel {
  position: absolute;
  right: var(--meta-panel-right);
  bottom: var(--meta-panel-bottom);
  display: flex;
  flex-direction: column;
  width: var(--meta-panel-width);
  max-width: calc(100vw - 2 * var(--meta-panel-right));
  max-height: min(
    var(--meta-panel-max-height),
    calc(100vh - var(--meta-panel-top) - var(--meta-panel-bottom))
  );
  overflow: hidden;
  border-radius: 12px;
  background: var(--tx-bg-color);
  // A ring, not a border, next to a shadow (tuffex-design-rules).
  box-shadow:
    0 0 0 1px var(--tx-border-color-lighter),
    var(--tx-elevation-4);
  transform-origin: bottom right;
}

.MetaPanel-Header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: var(--meta-header-height);
  padding: 0 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.MetaPanel-HeaderIcon {
  flex: none;
}

.MetaPanel-HeaderTitle {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.MetaPanel-List {
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--meta-list-padding);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.MetaPanel-Section + .MetaPanel-Section {
  margin-top: var(--meta-section-gap);
}

.MetaPanel-SectionTitle {
  display: flex;
  align-items: flex-end;
  box-sizing: border-box;
  height: var(--meta-section-title-height);
  padding: 0 10px 4px;
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.MetaPanel-Empty {
  display: flex;
  align-items: center;
  height: var(--meta-row-height);
  margin: 0;
  padding: 0 10px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

.MetaPanel-Filter {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: var(--meta-filter-height);
  padding: 0 8px 0 12px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.MetaPanel-FilterIcon {
  flex: none;
  display: inline-block;
  width: 14px;
  height: 14px;
  font-size: 14px;
  color: var(--tx-text-color-secondary);
}

.SearchInput {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--tx-text-color-primary);
  font: inherit;
  font-size: 13px;

  &::placeholder {
    color: var(--tx-text-color-placeholder);
  }
}

.MetaPanel-FilterKey {
  flex: none;
}

.meta-panel-enter-active,
.meta-panel-leave-active {
  transition: opacity 0.12s ease-out;
}

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
