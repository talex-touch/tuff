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
  scrollToBottomLabel: 'Scroll to bottom',
  emptyAlign: 'center',
  // Explicit `undefined` opts out of Vue's absent-Boolean-prop → `false`
  // casting; "not provided" must stay distinguishable from "no history".
  hasMoreInitial: undefined,
})

const emit = defineEmits<{
  'at-bottom-change': [atBottom: boolean]
  'following-change': [following: boolean]
  'active-index-change': [index: number]
  'load-error': [error: unknown]
}>()

defineSlots<{
  item?: (props: { item: T, index: number }) => any
  empty?: () => any
  header?: () => any
  footer?: () => any
  'top-loading'?: () => any
  'top-error'?: (props: { retry: () => void }) => any
  'top-done'?: () => any
  'scroll-to-bottom'?: (props: { streaming: boolean, scrollToBottom: (behavior?: ScrollBehavior) => void }) => any
  rail?: (props: {
    items: T[]
    activeIndex: number
    scrollToIndex: (index: number) => void
    scrollToBottom: (behavior?: ScrollBehavior) => void
  }) => any
  overlay?: (props: {
    atBottom: boolean
    following: boolean
    streaming: boolean
    scrollToBottom: (behavior?: ScrollBehavior) => void
  }) => any
}>()

const scrollerRef = ref<HTMLElement | null>(null)
const headerRef = ref<HTMLElement | null>(null)
const topZoneRef = ref<HTMLElement | null>(null)
const sentinelRef = ref<HTMLElement | null>(null)
const spacerRef = ref<HTMLElement | null>(null)
const liveRef = ref<HTMLElement | null>(null)

const scrollTop = ref(0)
const viewportHeight = ref(0)
const headerHeight = ref(0)
const topZoneHeight = ref(0)

/**
 * Where the spacer's content actually starts inside the scroller — top zone
 * plus whatever padding or extra content the host put above the transcript.
 * Assuming "top zone only" made every range and anchor computation wrong by
 * exactly the host's padding.
 */
const spacerTop = ref(0)

function measureSpacerTop(): void {
  const scroller = scrollerRef.value
  const spacer = spacerRef.value
  if (!scroller || !spacer)
    return
  const scrollerRect = scroller.getBoundingClientRect()
  const spacerRect = spacer.getBoundingClientRect()
  const hasLayoutBox
    = scrollerRect.height !== 0
      || scrollerRect.width !== 0
      || spacerRect.height !== 0
      || spacerRect.width !== 0
      || spacerRect.top !== 0
      || scrollerRect.top !== 0
  if (hasLayoutBox) {
    spacerTop.value = spacerRect.top - scrollerRect.top + scroller.scrollTop
    return
  }
  spacerTop.value = headerHeight.value + topZoneHeight.value
}

// The spacer mounts and unmounts with the item count crossing zero.
watch(spacerRef, () => measureSpacerTop())

/** Bumped on every cache mutation so layout computeds re-evaluate. */
const layoutVersion = ref(0)
const cache = createPositionCache(props.estimatedItemHeight)

const stick = useStickToBottom(scrollerRef)

watch(stick.atBottom, value => emit('at-bottom-change', value))
watch(stick.following, value => emit('following-change', value))

function toCssLength(value?: number | string): string | undefined {
  if (value === undefined || value === null || value === '')
    return undefined
  return typeof value === 'number' ? `${value}px` : value
}

const rootStyle = computed(() => {
  const vars: Record<string, string> = {}
  const top = toCssLength(props.topPadding)
  const bottom = toCssLength(props.bottomClearance)
  const pill = toCssLength(props.pillBottom)
  const gap = toCssLength(props.itemGap)
  if (top)
    vars['--tx-conversation-stream-pad-top'] = top
  if (bottom)
    vars['--tx-conversation-stream-pad-bottom'] = bottom
  if (pill)
    vars['--tx-conversation-stream-pill-bottom'] = pill
  if (gap)
    vars['--tx-conversation-stream-item-gap'] = gap
  return vars
})

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
const allKeys = computed(() => props.items.map((item, index) => keyOf(item, index)))

const activeIndex = computed(() => {
  const total = props.items.length
  if (total === 0)
    return -1
  if (stick.atBottom.value)
    return total - 1
  void layoutVersion.value
  const focusOffset = Math.max(0, scrollTop.value - spacerTop.value + viewportHeight.value * 0.35)
  if (focusOffset >= cache.totalHeight())
    return total - 1
  const { start } = cache.visibleRange(focusOffset, 1, 0)
  return Math.max(0, Math.min(total - 1, start))
})

watch(activeIndex, index => emit('active-index-change', index))

// ---------------------------------------------------------------------------
// Virtual window
// ---------------------------------------------------------------------------

/**
 * Hands back the previous object while the window's start and end stand still.
 * Every scroll frame writes `scrollTop`, and a fresh `{ start, end }` per frame
 * rebuilt `windowItems` and re-ran every visible row's slot on each frame of a
 * glide, though the window only changes when the viewport crosses a row
 * boundary. A computed that returns the same value does not wake its
 * dependents; offsets still refresh through `windowItems`' own read of
 * `layoutVersion`.
 */
const range = computed<{ start: number, end: number }>((previous) => {
  void layoutVersion.value
  const top = Math.max(0, scrollTop.value - spacerTop.value)
  const next = cache.visibleRange(top, viewportHeight.value, props.overscan)
  return previous && previous.start === next.start && previous.end === next.end ? previous : next
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
let pendingVirtualCompensation = 0
let pendingFollow = false
let flushScheduled = false

function entryHeight(entry: ResizeObserverEntry): number {
  return entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
}

function handleResizeEntries(entries: ResizeObserverEntry[]): void {
  const scroller = scrollerRef.value
  let domCompensation = 0

  for (const entry of entries) {
    const target = entry.target
    const nextHeight = entryHeight(entry)

    if (target === scroller) {
      if (nextHeight <= 0)
        continue
      viewportHeight.value = nextHeight
      measureSpacerTop()
      // Late layout constraints shrink the viewport after items were already
      // measured (no item deltas left to fire) — a following reader must be
      // re-pinned or they strand at the top with `following` still true.
      pendingFollow = true
      continue
    }

    if (target === headerRef.value) {
      if (nextHeight <= 0 && (!scroller || scroller.clientHeight === 0))
        continue
      const delta = nextHeight - headerHeight.value
      headerHeight.value = nextHeight
      measureSpacerTop()
      if (delta !== 0) {
        if (scrollTop.value > 0 && !stick.atBottom.value)
          domCompensation += delta
        else
          pendingFollow = true
      }
      continue
    }

    if (target === topZoneRef.value) {
      if (nextHeight <= 0 && (!scroller || scroller.clientHeight === 0))
        continue
      const delta = nextHeight - topZoneHeight.value
      topZoneHeight.value = nextHeight
      measureSpacerTop()
      // The top zone collapsing (hasMore → false) must not slide the
      // transcript up under the reader.
      if (delta !== 0 && scrollTop.value > 0 && !stick.atBottom.value)
        domCompensation += delta
      continue
    }

    if (target === liveRef.value) {
      if (nextHeight <= 0 && (!scroller || scroller.clientHeight === 0))
        continue
      // Not part of the virtual layout, but remembered by key: when the next
      // message arrives this item joins the cache pre-measured.
      if (liveKey.value != null)
        cache.setHeight(liveKey.value, nextHeight)
      pendingFollow = true
      continue
    }

    const key = elementToKey.get(target)
    if (key === undefined)
      continue
    if (nextHeight <= 0 && (!scroller || scroller.clientHeight === 0))
      continue
    const delta = cache.setHeight(key, nextHeight)
    if (delta === 0)
      continue
    layoutVersion.value += 1
    // Settled items can still grow after mount (async images, diagrams). A
    // following reader stays pinned through that; a detached one gets
    // post-flush compensation below instead.
    pendingFollow = true
    // Only rows whose entire previous box sat above the viewport push visible
    // content when they resize. A row straddling `scrollTop` growing at its
    // bottom (e.g. hover footer or expanded thought) leaves the visible top
    // intact — compensating it would jump the reader and can loop hover.
    const index = virtualKeys.value.indexOf(key)
    const prevBottom = index >= 0 ? cache.offsetOf(index) + (nextHeight - delta) + spacerTop.value : Number.POSITIVE_INFINITY
    if (index >= 0 && prevBottom <= scrollTop.value + pendingVirtualCompensation && !stick.atBottom.value)
      pendingVirtualCompensation += delta
  }

  // Header and top-zone resizes already updated layout before RO fired.
  if (domCompensation !== 0 && scroller) {
    scroller.scrollTop += domCompensation
    scrollTop.value = scroller.scrollTop
    stick.syncPosition()
  }

  // Virtual item deltas change the spacer height and row offsets in the next
  // Vue flush, so both virtual compensation and follow-to-bottom run after
  // `nextTick` against the settled scrollHeight. While a response streams,
  // the follow glides instead of snapping — per-token growth reads as one
  // continuous slide.
  if ((pendingVirtualCompensation !== 0 || pendingFollow) && !flushScheduled) {
    flushScheduled = true
    void nextTick(() => {
      flushScheduled = false
      const compensation = pendingVirtualCompensation
      const shouldFollow = pendingFollow
      pendingVirtualCompensation = 0
      pendingFollow = false
      const liveScroller = scrollerRef.value
      if (compensation !== 0 && liveScroller && !stick.following.value) {
        liveScroller.scrollTop += compensation
        scrollTop.value = liveScroller.scrollTop
        stick.syncPosition()
      }
      if (shouldFollow)
        stick.followIfSticking(props.streaming ? 220 : 0)
    })
  }
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
// Prepend anchoring & tail-append follow: track the previously-first key
// across all items (including 1-item threads where virtualKeys was empty). Any
// batch prepended ahead of it shifts scrollTop by the prefix height once DOM settles.
// ---------------------------------------------------------------------------

let previousFirstKey: ConversationStreamKey | null = null

watch(
  allKeys,
  (nextAllKeys, previousAllKeys) => {
    // The live key rides along un-listed: its height is recorded while it
    // streams, and pruning it here would send the row that is about to
    // migrate back to the estimate.
    cache.syncKeys(virtualKeys.value, liveKey.value)
    layoutVersion.value += 1

    const prevFirst = previousFirstKey
    previousFirstKey = nextAllKeys[0] ?? null

    if (prevFirst !== null) {
      const shifted = nextAllKeys.indexOf(prevFirst)
      if (shifted > 0) {
        void nextTick(() => {
          const scroller = scrollerRef.value
          if (!scroller)
            return
          scroller.scrollTop += cache.prefixHeight(shifted)
          scrollTop.value = scroller.scrollTop
          stick.syncPosition()
        })
        return
      }
    }

    // When new items append at the tail while sticking, re-follow even if the
    // new live wrapper happens to have the same height as the prior turn.
    if (previousAllKeys && nextAllKeys.length > previousAllKeys.length)
      void nextTick(() => stick.followIfSticking(props.streaming ? 220 : 0))
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

/**
 * The "make room" beat: glides to the bottom over a fixed duration, keeping
 * the virtual window in step each frame, and resolves once the glide landed
 * (`false` when the user or a newer scroll interrupted it). Callers time
 * follow-up motion — an entrance animation, say — off that settlement.
 */
async function tweenToBottom(duration?: number): Promise<boolean> {
  const landed = await stick.tweenToBottom(duration)
  const scroller = scrollerRef.value
  if (scroller)
    scrollTop.value = scroller.scrollTop
  return landed
}

function scrollToIndex(index: number): void {
  const scroller = scrollerRef.value
  if (!scroller)
    return
  if (index >= props.items.length - 1) {
    scrollToBottom()
    return
  }
  scroller.scrollTop = spacerTop.value + cache.offsetOf(Math.max(0, index))
  scrollTop.value = scroller.scrollTop
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  const scroller = scrollerRef.value
  if (headerRef.value)
    headerHeight.value = headerRef.value.getBoundingClientRect().height

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(handleResizeEntries)
    if (scroller)
      observer.observe(scroller)
    if (headerRef.value)
      observer.observe(headerRef.value)
    if (topZoneRef.value)
      observer.observe(topZoneRef.value)
    if (liveRef.value)
      observer.observe(liveRef.value)
    // Function refs run during the first render, before this hook: the rows
    // rendered then were registered with no observer to hand them to. A window
    // that never moves after mount — a short restored thread — would otherwise
    // keep every row at its estimate, stacked over its neighbours.
    for (const element of elementToKey.keys())
      observer.observe(element)
  }

  if (scroller)
    viewportHeight.value = scroller.clientHeight
  measureSpacerTop()

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
  pendingVirtualCompensation = 0
  pendingFollow = false
})

defineExpose({
  scrollToBottom,
  scrollToIndex,
  tweenToBottom,
  // A ComputedRef rather than `readonly(ref)`: read-only to consumers either
  // way, but the flat named type keeps the drift contract's structural
  // comparison stable where DeepReadonly's conditionals are not.
  atBottom: computed(() => stick.atBottom.value),
  following: computed(() => stick.following.value),
})
</script>

<template>
  <div class="tx-conversation-stream" :style="rootStyle">
    <div
      ref="scrollerRef"
      class="tx-conversation-stream__scroller"
      @scroll.passive="onScroll"
      @wheel.passive="onWheel"
    >
      <div ref="headerRef" class="tx-conversation-stream__header">
        <slot name="header" />
      </div>

      <div
        v-if="items.length === 0"
        class="tx-conversation-stream__empty"
        :class="{
          'is-top': emptyAlign === 'top',
          'is-bottom': emptyAlign === 'bottom',
        }"
      >
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

        <div
          ref="spacerRef"
          class="tx-conversation-stream__spacer"
          :style="{ height: `${spacerHeight}px` }"
        >
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

        <div
          v-if="liveItem !== undefined"
          ref="liveRef"
          class="tx-conversation-stream__live"
        >
          <slot name="item" :item="liveItem" :index="items.length - 1" />
        </div>
      </template>

      <slot name="footer" />
    </div>

    <slot
      name="rail"
      :items="items"
      :active-index="activeIndex"
      :scroll-to-index="scrollToIndex"
      :scroll-to-bottom="scrollToBottom"
    />

    <slot
      name="overlay"
      :at-bottom="stick.atBottom.value"
      :following="stick.following.value"
      :streaming="streaming"
      :scroll-to-bottom="scrollToBottom"
    />

    <!-- Only for a reader who left the bottom: while the stream glides there on its own (a send, a
         programmatic scroll) it is not at the bottom yet, but nobody needs to be offered a way back. -->
    <button
      v-if="!stick.following.value && !stick.atBottom.value && items.length > 0"
      type="button"
      class="tx-conversation-stream__pill"
      :class="{ 'is-streaming': streaming }"
      :aria-label="scrollToBottomLabel"
      @click="scrollToBottom('smooth')"
    >
      <slot name="scroll-to-bottom" :streaming="streaming" :scroll-to-bottom="scrollToBottom">
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
  box-sizing: border-box;
  padding-top: var(--tx-conversation-stream-pad-top, 0px);
  padding-bottom: var(--tx-conversation-stream-pad-bottom, 0px);
  overflow-y: auto;
  // The component runs its own anchoring; the browser's would double-correct.
  overflow-anchor: none;
}

.tx-conversation-stream__header {
  display: flow-root;
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
  padding-bottom: var(--tx-conversation-stream-item-gap, 0px);
}

.tx-conversation-stream__live {
  width: 100%;
  box-sizing: border-box;
}

.tx-conversation-stream__empty {
  display: grid;
  place-items: center;
  min-height: 100%;
  box-sizing: border-box;

  &.is-top {
    place-items: start center;
  }

  &.is-bottom {
    place-items: end center;
  }
}

.tx-conversation-stream__pill {
  position: absolute;
  bottom: var(--tx-conversation-stream-pill-bottom, 16px);
  left: 50%;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-fill-color-blank, #fff) 88%, transparent);
  backdrop-filter: blur(12px) saturate(160%);
  color: var(--tx-text-color-primary, #303133);
  box-shadow:
    inset 0 0 0 1px var(--tx-border-color-light, #e4e7ed),
    1px 2px 10px color-mix(in srgb, var(--tx-color-black, #000) 12%, transparent);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transform: translateX(-50%);
  animation: tx-conversation-stream-pill-in 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) both;

  &:hover {
    box-shadow:
      inset 0 0 0 1px var(--tx-color-primary, #409eff),
      1px 2px 12px color-mix(in srgb, var(--tx-color-black, #000) 14%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
  }

  // Streaming while detached: the pill doubles as a "new content" beacon.
  &.is-streaming {
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent),
      1px 2px 12px color-mix(in srgb, var(--tx-color-black, #000) 14%, transparent);
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
  .tx-conversation-stream__pill,
  .tx-conversation-stream__spinner.is-loading {
    animation: none;
  }
}
</style>
