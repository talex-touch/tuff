<script setup lang="ts">
import type { ITuffIcon } from '@talex-touch/utils'
import { TxIcon as TuffIcon } from '@talex-touch/tuffex/icon'
import { useResizeObserver } from '@vueuse/core'
import { ref, watch } from 'vue'

/**
 * The card of the ⌘K panels: a header naming the item, a grouped list under one hover plate, and
 * the filter field at the bottom. `views/meta/MetaOverlay.vue` draws the action panel with it, and
 * `components/flow/FlowSelector.vue` the Flow picker.
 *
 * The owner keeps what is its own: the dim the card sits on, where it is anchored (the custom
 * properties of `resolveMetaPanelCssVars`, set on the owner's root), the keyboard, and the rows.
 * It renders the list's contents into the default slot with this card's class names
 * (`MetaPanel-Section`, `MetaPanel-SectionTitle`, `MetaPanel-Empty`) and marks every row with
 * `data-meta-row-index`, its position in the flattened list. That content carries the owner's
 * scope id, not this one, so the styles below reach it through `:deep()` from the list.
 */

const props = withDefaults(
  defineProps<{
    /** Header text, and the dialog's accessible name. */
    title: string
    icon: ITuffIcon
    listId: string
    /** The listbox's accessible name. */
    listLabel: string
    placeholder: string
    /** `data-meta-row-index` of the active row. */
    activeIndex: number
    /** DOM id of the active row, for the filter's `aria-activedescendant`. */
    activeDescendant?: string
    /** Whether the active row can carry the plate: it exists and is not disabled. */
    highlight: boolean
    /** Changes whenever the rows do, so the plate is measured again. */
    layoutKey: unknown
    /**
     * The owner window's motion gate (`useMotionGate().shouldAnimate`). Passed in, not called
     * here: a window has one gate, and a second call would be a second writer of the low-battery
     * attribute.
     */
    shouldAnimate: () => boolean
    /** `body` replaces the list and the filter with the `body` slot, under the same header. */
    view?: 'list' | 'body'
  }>(),
  { view: 'list' }
)

const emit = defineEmits<{
  /** IME composition in the filter field started (`true`) or ended (`false`). */
  (e: 'composition', composing: boolean): void
}>()

const query = defineModel<string>('query', { required: true })

const inputRef = ref<HTMLInputElement>()
const listRef = ref<HTMLElement>()
const indicatorRef = ref<HTMLElement>()
const hasFollowHighlight = ref(false)
// Set by `glideNext()`; the watch below spends it on its next run.
let glidePending = false

function activeRowElement(): HTMLElement | null {
  return (
    listRef.value?.querySelector<HTMLElement>(`[data-meta-row-index="${props.activeIndex}"]`) ??
    null
  )
}

function syncHighlight(glide: boolean): void {
  const list = listRef.value
  const indicator = indicatorRef.value
  const row = activeRowElement()
  hasFollowHighlight.value = false
  if (!list || !indicator || !row || !props.highlight) {
    if (indicator) indicator.style.opacity = '0'
    return
  }

  const listRect = list.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  if (listRect.width <= 0 || listRect.height <= 0 || rowRect.height <= 0) {
    indicator.style.opacity = '0'
    return
  }
  // Panel entrance scales visually; the plate is measured in the scroller's layout pixels.
  const scaleX = list.offsetWidth > 0 ? listRect.width / list.offsetWidth : 1
  const scaleY = list.offsetHeight > 0 ? listRect.height / list.offsetHeight : 1
  const x = (rowRect.left - listRect.left) / scaleX - list.clientLeft + list.scrollLeft
  const y = (rowRect.top - listRect.top) / scaleY - list.clientTop + list.scrollTop
  // The PromptBar menu uses a compositor clock too. Native views may starve JS RAF while
  // inactive; one transform target per selection keeps hover motion on wall-clock time.
  indicator.classList.toggle('is-following-pointer', glide && props.shouldAnimate())
  indicator.style.width = `${rowRect.width / scaleX}px`
  indicator.style.height = `${rowRect.height / scaleY}px`
  indicator.style.transform = `translate3d(${x}px, ${y}px, 0)`
  indicator.style.opacity = '1'
  hasFollowHighlight.value = true
}

watch(
  [
    () => props.activeIndex,
    () => props.layoutKey,
    () => props.highlight,
    listRef,
    indicatorRef,
    () => props.shouldAnimate()
  ],
  () => {
    const glide = glidePending
    glidePending = false
    syncHighlight(glide)
  },
  { flush: 'post' }
)
useResizeObserver(listRef, () => syncHighlight(false))

/** Focuses the filter field; the owner calls it once the card is on screen. */
function focusFilter(): void {
  inputRef.value?.focus()
}

/**
 * Lets the plate's next move glide instead of landing. The owner calls it right before a pointer
 * hover changes `activeIndex`; keyboard steps, filtering, the first show and resizes never do, so
 * they land in place.
 */
function glideNext(): void {
  glidePending = true
}

/** Brings the active row into view, after a keyboard step or a new filter. */
function scrollActiveIntoView(): void {
  // Instant: a smooth scroll would trail behind a held arrow key.
  activeRowElement()?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
}

defineExpose({ focusFilter, glideNext, scrollActiveIntoView })
</script>

<template>
  <section class="MetaPanel" role="dialog" aria-modal="true" :aria-label="title">
    <header class="MetaPanel-Header">
      <TuffIcon :icon="icon" :size="16" class="MetaPanel-HeaderIcon" />
      <span class="MetaPanel-HeaderTitle" :title="title">{{ title }}</span>
      <slot name="header-meta" />
    </header>

    <slot v-if="view === 'body'" name="body" />
    <template v-else>
      <div
        :id="listId"
        ref="listRef"
        class="MetaPanel-List"
        :class="{ 'has-follow-highlight': hasFollowHighlight }"
        role="listbox"
        :aria-label="listLabel"
      >
        <slot />
        <div ref="indicatorRef" class="MetaPanel-Highlight" aria-hidden="true" />
      </div>

      <footer class="MetaPanel-Filter">
        <i class="MetaPanel-FilterIcon i-ri-search-line" aria-hidden="true" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          class="SearchInput"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          :aria-controls="listId"
          :aria-activedescendant="activeDescendant"
          :aria-label="placeholder"
          :placeholder="placeholder"
          @compositionstart="emit('composition', true)"
          @compositionend="emit('composition', false)"
        />
        <slot name="filter-key" />
      </footer>
    </template>
  </section>
</template>

<style scoped lang="scss">
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
  position: relative;
  isolation: isolate;
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--meta-list-padding);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.MetaPanel-Highlight {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  border-radius: 6px;
  background: var(--tx-fill-color);
  opacity: 0;
  pointer-events: none;

  &.is-following-pointer {
    transition: transform 220ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }
}

.MetaPanel-List :deep(.MetaPanel-Section) {
  position: relative;
  z-index: 1;
}

.MetaPanel-List.has-follow-highlight :deep(.MetaActionItem.is-active) {
  background: transparent;
}

.MetaPanel-List :deep(.MetaPanel-Section + .MetaPanel-Section) {
  margin-top: var(--meta-section-gap);
}

.MetaPanel-List :deep(.MetaPanel-SectionTitle) {
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

.MetaPanel-List :deep(.MetaPanel-Empty) {
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

.MetaPanel-Filter :deep(.MetaPanel-FilterKey) {
  flex: none;
}
</style>
