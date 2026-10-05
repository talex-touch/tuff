<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { ref, watch } from 'vue'

/**
 * The list of a `MetaPanel` page: grouped rows under one hover plate. The action list and the Flow
 * targets each draw one, so a page brings its own list into the card and takes it along when the
 * card pushes the next page in.
 *
 * The owner renders the rows into the default slot with the card's class names
 * (`MetaPanel-Section`, `MetaPanel-SectionTitle`, `MetaPanel-Empty`) and marks every row with
 * `data-meta-row-index`, its position in the flattened list. That content carries the owner's scope
 * id, not this one, so the styles below reach it through `:deep()` from the list.
 */

const props = defineProps<{
  listId: string
  /** The listbox's accessible name. */
  listLabel: string
  /** `data-meta-row-index` of the active row. */
  activeIndex: number
  /** Whether the active row can carry the plate: it exists and is not disabled. */
  highlight: boolean
  /** Changes whenever the rows do, so the plate is measured again. */
  layoutKey: unknown
  /**
   * The owner window's motion gate (`useMotionGate().shouldAnimate`). Passed in, not called here:
   * a window has one gate, and a second call would be a second writer of the low-battery attribute.
   */
  shouldAnimate: () => boolean
}>()

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

/**
 * Lets the plate's next move glide instead of landing. The owner calls it when a pointer hover
 * changes `activeIndex`; keyboard steps, filtering, the first show and resizes never do, so they
 * land in place.
 */
function glideNext(): void {
  glidePending = true
}

/** Brings the active row into view, after a keyboard step or a new filter. */
function scrollActiveIntoView(): void {
  // Instant: a smooth scroll would trail behind a held arrow key.
  activeRowElement()?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
}

defineExpose({ glideNext, scrollActiveIntoView })
</script>

<template>
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
</template>

<style scoped lang="scss">
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
</style>
