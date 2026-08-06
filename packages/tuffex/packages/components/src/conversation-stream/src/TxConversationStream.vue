<script setup lang="ts" generic="T">
import type { ConversationStreamKey, ConversationStreamProps } from './types'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createPositionCache } from './use-position-cache'
import { useStickToBottom } from './use-stick-to-bottom'

defineOptions({ name: 'TxConversationStream' })

const props = withDefaults(defineProps<ConversationStreamProps<T>>(), {
  estimatedItemHeight: 96,
  overscan: 4,
  streaming: false,
  // Explicit `undefined` opts out of Vue's absent-Boolean-prop → `false`
  // casting; "not provided" must stay distinguishable from "no history".
  hasMoreInitial: undefined,
})

const emit = defineEmits<{
  'at-bottom-change': [atBottom: boolean]
  'load-error': [error: unknown]
}>()

defineSlots<{
  item?: (props: { item: T, index: number }) => any
  empty?: () => any
  'top-loading'?: () => any
  'top-error'?: (props: { retry: () => void }) => any
  'top-done'?: () => any
  'scroll-to-bottom'?: (props: { streaming: boolean }) => any
}>()

const scrollerRef = ref<HTMLElement | null>(null)
const topZoneRef = ref<HTMLElement | null>(null)
const sentinelRef = ref<HTMLElement | null>(null)
const liveRef = ref<HTMLElement | null>(null)

const scrollTop = ref(0)
const viewportHeight = ref(0)
const topZoneHeight = ref(0)

/** Bumped on every cache mutation so layout computeds re-evaluate. */
const layoutVersion = ref(0)
const cache = createPositionCache(props.estimatedItemHeight)

const stick = useStickToBottom(scrollerRef)

watch(stick.atBottom, value => emit('at-bottom-change', value))

// ---------------------------------------------------------------------------
// Keys and zones. The live zone is always the last item — streaming or not —
// so a turn ending never moves a node between the virtual and live worlds
// mid-render; the item migrates only when the *next* message arrives, and it
// carries its measured height with it.
// ---------------------------------------------------------------------------

function keyOf(item: T, index: number): ConversationStreamKey {
  if (typeof props.itemKey === 'function')
    return props.itemKey(item, index)
  const value = (item as Record<string, unknown> | null | undefined)?.[props.itemKey]
  return (typeof value === 'string' || typeof value === 'number') ? value : index
}

const virtualItems = computed(() => props.items.slice(0, -1))
const virtualKeys = computed(() => virtualItems.value.map((item, index) => keyOf(item, index)))
const liveItem = computed(() => (props.items.length > 0 ? props.items[props.items.length - 1] : undefined))
const liveKey = computed(() =>
  props.items.length > 0 ? keyOf(props.items[props.items.length - 1] as T, props.items.length - 1) : null,
)

// ---------------------------------------------------------------------------
// Virtual window
// ---------------------------------------------------------------------------

const range = computed(() => {
  void layoutVersion.value
  const top = Math.max(0, scrollTop.value - topZoneHeight.value)
  return cache.visibleRange(top, viewportHeight.value, props.overscan)
})

const windowItems = computed(() => {
  void layoutVersion.value
  const { start, end } = range.value
  const result: Array<{ item: T, index: number, key: ConversationStreamKey, offset: number }> = []
  for (let index = start; index < end; index++) {
    const item = virtualItems.value[index]
    if (item === undefined)
      continue
    result.push({
      item,
      index,
      key: virtualKeys.value[index] ?? index,
      offset: cache.offsetOf(index),
    })
  }
  return result
})

const spacerHeight = computed(() => {
  void layoutVersion.value
  return cache.totalHeight()
})

// ---------------------------------------------------------------------------
// Measurement. One ResizeObserver serves every role; targets are told apart
// by identity (scroller / top zone / live) or membership (window items).
// ---------------------------------------------------------------------------

const elementToKey = new Map<Element, ConversationStreamKey>()
const keyToElement = new Map<ConversationStreamKey, Element>()
let observer: ResizeObserver | null = null

function entryHeight(entry: ResizeObserverEntry): number {
  return entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
}

function handleResizeEntries(entries: ResizeObserverEntry[]): void {
  const scroller = scrollerRef.value
  let compensation = 0
  let grew = false

  for (const entry of entries) {
    const target = entry.target

    if (target === scroller) {
      viewportHeight.value = entryHeight(entry)
      // Late layout constraints shrink the viewport after items were already
      // measured (no item deltas left to fire) — a following reader must be
      // re-pinned or they strand at the top with `following` still true.
      grew = true
      continue
    }

    if (target === topZoneRef.value) {
      const next = entryHeight(entry)
      const delta = next - topZoneHeight.value
      topZoneHeight.value = next
      // The top zone collapsing (hasMore → false) must not slide the
      // transcript up under the reader.
      if (delta !== 0 && scrollTop.value > 0 && !stick.atBottom.value)
        compensation += delta
      continue
    }

    if (target === liveRef.value) {
      // Not part of the virtual layout, but remembered by key: when the next
      // message arrives this item joins the cache pre-measured.
      if (liveKey.value != null)
        cache.setHeight(liveKey.value, entryHeight(entry))
      grew = true
      continue
    }

    const key = elementToKey.get(target)
    if (key === undefined)
      continue
    const delta = cache.setHeight(key, entryHeight(entry))
    if (delta === 0)
      continue
    layoutVersion.value += 1
    // Settled items can still grow after mount (async images, diagrams). A
    // following reader stays pinned through that; a detached one gets the
    // same-callback compensation below instead.
    grew = true
    // Corrections above the viewport shift everything below them; compensate
    // in the same callback (post-layout, pre-paint) so the view holds still.
    const index = virtualKeys.value.indexOf(key)
    if (index >= 0 && cache.offsetOf(index) + topZoneHeight.value < scrollTop.value && !stick.atBottom.value)
      compensation += delta
  }

  if (compensation !== 0 && scroller) {
    scroller.scrollTop += compensation
    scrollTop.value = scroller.scrollTop
  }

  // After the reactive flush, not in the RO callback: item deltas change the
  // spacer height through a Vue re-render, so scrolling now would target a
  // stale scrollHeight — and the spacer applying later fires no resize of its
  // own to correct it.
  if (grew)
    void nextTick(() => stick.followIfSticking())
}

function trackItem(el: unknown, key: ConversationStreamKey): void {
  const element = el instanceof Element ? el : null

  if (!element) {
    const previous = keyToElement.get(key)
    if (previous) {
      observer?.unobserve(previous)
      elementToKey.delete(previous)
      keyToElement.delete(key)
    }
    return
  }

  const previous = keyToElement.get(key)
  if (previous && previous !== element) {
    observer?.unobserve(previous)
    elementToKey.delete(previous)
  }
  elementToKey.set(element, key)
  keyToElement.set(key, element)
  observer?.observe(element)
}

// ---------------------------------------------------------------------------
// Prepend anchoring: any batch of items appearing before the previously-first
// key shifts the layout by exactly their prefix height — add it back to
// scrollTop after the DOM settles and the viewport doesn't move.
// ---------------------------------------------------------------------------

watch(
  virtualKeys,
  (nextKeys, previousKeys) => {
    cache.syncKeys(nextKeys)
    layoutVersion.value += 1

    if (!previousKeys || previousKeys.length === 0)
      return

    const previousFirst = previousKeys[0]
    if (previousFirst === undefined)
      return
    const shifted = nextKeys.indexOf(previousFirst)
    if (shifted <= 0)
      return

    void nextTick(() => {
      const scroller = scrollerRef.value
      if (!scroller)
        return
      scroller.scrollTop += cache.prefixHeight(shifted)
      scrollTop.value = scroller.scrollTop
    })
  },
  { immediate: true },
)

// ---------------------------------------------------------------------------
// History loading
// ---------------------------------------------------------------------------

const hasMore = ref(props.hasMoreInitial ?? !!props.loadOlder)
const loading = ref(false)
const loadFailed = ref(false)
let intersectionObserver: IntersectionObserver | null = null
let autoLoadUsed = false
let interactedSinceAutoLoad = false

async function triggerLoad(): Promise<void> {
  const loadOlder = props.loadOlder
  if (!loadOlder || loading.value || !hasMore.value)
    return

  // An under-filled list keeps its sentinel permanently visible; without this
  // guard the loader would chain until the viewport fills or history runs dry.
  const scroller = scrollerRef.value
  const scrollable = scroller ? scroller.scrollHeight > scroller.clientHeight + 1 : false
  if (!scrollable) {
    if (autoLoadUsed && !interactedSinceAutoLoad)
      return
    autoLoadUsed = true
    interactedSinceAutoLoad = false
  }

  loading.value = true
  loadFailed.value = false
  try {
    const result = await loadOlder()
    hasMore.value = !!result?.hasMore
  }
  catch (error) {
    loadFailed.value = true
    emit('load-error', error)
  }
  finally {
    loading.value = false
  }
}

function retryLoad(): void {
  void triggerLoad()
}

/**
 * The sentinel lives inside the `v-else` of `v-if="items.length === 0"`, so a
 * stream that mounts with an empty list has no sentinel at mount time. Attaching
 * only in onMounted left history loading permanently dead for that case, so the
 * observer is (re)built whenever the sentinel or the gating state changes.
 */
function setupHistoryObserver(): void {
  intersectionObserver?.disconnect()
  intersectionObserver = null

  const scroller = scrollerRef.value
  const sentinel = sentinelRef.value
  if (typeof IntersectionObserver === 'undefined')
    return
  if (!props.loadOlder || !hasMore.value || !sentinel || !scroller)
    return

  intersectionObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some(entry => entry.isIntersecting))
        void triggerLoad()
    },
    { root: scroller, rootMargin: '200px 0px 0px 0px' },
  )
  intersectionObserver.observe(sentinel)
}

watch(sentinelRef, () => {
  setupHistoryObserver()
})

// hasMoreInitial was read once at setup and never re-synced, so re-supplying
// `true` for a different conversation could not revive history loading.
watch(
  () => props.hasMoreInitial,
  (next) => {
    if (next === undefined)
      return
    hasMore.value = next
  },
)

watch(hasMore, (value) => {
  if (!value) {
    intersectionObserver?.disconnect()
    intersectionObserver = null
    return
  }
  setupHistoryObserver()
})

// ---------------------------------------------------------------------------
// Scroll plumbing
// ---------------------------------------------------------------------------

function onScroll(): void {
  const scroller = scrollerRef.value
  if (!scroller)
    return
  scrollTop.value = scroller.scrollTop
  stick.handleScroll()
  interactedSinceAutoLoad = true
}

function onWheel(event: WheelEvent): void {
  stick.handleWheel(event)
  if (event.deltaY < 0)
    interactedSinceAutoLoad = true
}

function scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
  stick.scrollToBottom(behavior)
  const scroller = scrollerRef.value
  if (scroller)
    scrollTop.value = scroller.scrollTop
}

function scrollToIndex(index: number): void {
  const scroller = scrollerRef.value
  if (!scroller)
    return
  if (index >= props.items.length - 1) {
    scrollToBottom()
    return
  }
  scroller.scrollTop = topZoneHeight.value + cache.offsetOf(Math.max(0, index))
  scrollTop.value = scroller.scrollTop
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  const scroller = scrollerRef.value

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(handleResizeEntries)
    if (scroller)
      observer.observe(scroller)
    if (topZoneRef.value)
      observer.observe(topZoneRef.value)
    if (liveRef.value)
      observer.observe(liveRef.value)
  }

  if (scroller)
    viewportHeight.value = scroller.clientHeight

  setupHistoryObserver()

  // A conversation opens at its latest message.
  void nextTick(() => scrollToBottom())
})

// The live wrapper mounts/unmounts with the item count crossing zero, and its
// element identity changes when the live item's key changes.
watch(liveRef, (next, previous) => {
  if (previous)
    observer?.unobserve(previous)
  if (next)
    observer?.observe(next)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  intersectionObserver?.disconnect()
  intersectionObserver = null
  elementToKey.clear()
  keyToElement.clear()
})

defineExpose({
  scrollToBottom,
  scrollToIndex,
  // A ComputedRef rather than `readonly(ref)`: read-only to consumers either
  // way, but the flat named type keeps the drift contract's structural
  // comparison stable where DeepReadonly's conditionals are not.
  atBottom: computed(() => stick.atBottom.value),
})
</script>

<template>
  <div class="tx-conversation-stream">
    <div
      ref="scrollerRef"
      class="tx-conversation-stream__scroller"
      @scroll.passive="onScroll"
      @wheel.passive="onWheel"
    >
      <div v-if="items.length === 0" class="tx-conversation-stream__empty">
        <slot name="empty" />
      </div>

      <template v-else>
        <div v-if="loadOlder" ref="topZoneRef" class="tx-conversation-stream__top">
          <div ref="sentinelRef" class="tx-conversation-stream__sentinel" aria-hidden="true" />
          <template v-if="hasMore">
            <slot v-if="loadFailed" name="top-error" :retry="retryLoad">
              <button
                type="button"
                class="tx-conversation-stream__retry"
                @click="retryLoad"
              >
                Failed to load history — retry
              </button>
            </slot>
            <slot v-else name="top-loading">
              <span
                class="tx-conversation-stream__spinner"
                :class="{ 'is-loading': loading }"
                role="status"
                :aria-label="loading ? 'Loading history' : undefined"
              />
            </slot>
          </template>
          <slot v-else name="top-done" />
        </div>

        <div class="tx-conversation-stream__spacer" :style="{ height: `${spacerHeight}px` }">
          <div
            v-for="entry in windowItems"
            :key="entry.key"
            :ref="el => trackItem(el, entry.key)"
            class="tx-conversation-stream__item"
            :style="{ transform: `translateY(${entry.offset}px)` }"
          >
            <slot name="item" :item="entry.item" :index="entry.index" />
          </div>
        </div>

        <div v-if="liveItem !== undefined" ref="liveRef" class="tx-conversation-stream__live">
          <slot name="item" :item="liveItem" :index="items.length - 1" />
        </div>
      </template>
    </div>

    <button
      v-if="!stick.atBottom.value && items.length > 0"
      type="button"
      class="tx-conversation-stream__pill"
      :class="{ 'is-streaming': streaming }"
      aria-label="Scroll to bottom"
      @click="scrollToBottom('smooth')"
    >
      <slot name="scroll-to-bottom" :streaming="streaming">
        <span class="tx-conversation-stream__pill-arrow" aria-hidden="true">↓</span>
      </slot>
    </button>
  </div>
</template>

<style lang="scss">
.tx-conversation-stream {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.tx-conversation-stream__scroller {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  // The component runs its own anchoring; the browser's would double-correct.
  overflow-anchor: none;
}

.tx-conversation-stream__top {
  position: relative;
  display: grid;
  place-items: center;
  // Reserved while history may exist, so the spinner toggling never shifts
  // the transcript. Collapse on "no more" is compensated in scroll math.
  min-height: 40px;
}

.tx-conversation-stream__sentinel {
  position: absolute;
  top: 0;
  width: 100%;
  height: 1px;
  pointer-events: none;
}

.tx-conversation-stream__spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--tx-border-color-light, #e4e7ed);
  border-radius: 999px;
  opacity: 0;
  transition: opacity 0.15s ease;

  &.is-loading {
    border-top-color: var(--tx-color-primary, #409eff);
    opacity: 1;
    animation: tx-conversation-stream-spin 0.8s linear infinite;
  }
}

.tx-conversation-stream__retry {
  padding: 4px 12px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 999px;
  background: transparent;
  color: var(--tx-text-color-secondary, #6b7280);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    border-color: var(--tx-color-primary, #409eff);
    color: var(--tx-color-primary, #409eff);
  }
}

.tx-conversation-stream__spacer {
  position: relative;
  width: 100%;
}

.tx-conversation-stream__item {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  box-sizing: border-box;
}

.tx-conversation-stream__live {
  width: 100%;
  box-sizing: border-box;
}

.tx-conversation-stream__empty {
  display: grid;
  place-items: center;
  height: 100%;
}

.tx-conversation-stream__pill {
  position: absolute;
  bottom: 16px;
  left: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  border-radius: 999px;
  background: var(--tx-fill-color-blank, #fff);
  color: var(--tx-text-color-primary, #303133);
  box-shadow: 0 2px 10px color-mix(in srgb, #000 12%, transparent);
  cursor: pointer;
  transform: translateX(-50%);
  animation: tx-conversation-stream-pill-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both;

  &:hover {
    border-color: var(--tx-color-primary, #409eff);
  }

  // Streaming while detached: the pill doubles as a "new content" beacon.
  &.is-streaming {
    border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
    color: var(--tx-color-primary, #409eff);
  }
}

@keyframes tx-conversation-stream-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes tx-conversation-stream-pill-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-conversation-stream__pill {
    animation: none;
  }
}
</style>
