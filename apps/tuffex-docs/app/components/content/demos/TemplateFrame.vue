<script setup lang="ts">
// Shared stage for the Templates tab. A template is a page-level composition,
// so it needs two sizes: the ~784px docs column and a near-fullscreen view.
// Expanding moves the *same* instance into an overlay through a Teleport whose
// `disabled` flag flips, so whatever the reader did inside (a selected row, a
// half-streamed answer, a filter) survives the round trip.
//
// Contract for the templates that sit in it:
// - Lay out with `@container template (…)` — the stage, not the viewport, is
//   what changes width. Numeric props a query cannot reach (chart heights,
//   flowchart coordinates, table max-height) read the slot's `width`/`height`.
// - Start scripted playback on `@enter`, not in `onMounted`: the docs wrapper
//   mounts demos 240px before they scroll into view.
// - A template that handles Escape itself calls `preventDefault()`, otherwise
//   the same key press also collapses the overlay. An always-open combobox
//   (an inline result list) marks an ancestor `data-template-esc="self"`: it
//   is not a popup that closes on Escape, so once it lets a press through the
//   overlay collapses instead of treating it as a menu that is still open.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(defineProps<{
  /** Names the overlay: its header text and its accessible name. */
  title: string
  /** Stage height in the docs column, in px. */
  height?: number
}>(), {
  height: 540,
})

const emit = defineEmits<{
  /** Fires once, the first time at least 35% of the stage is on screen. */
  enter: []
}>()

defineSlots<{
  default: (props: { expanded: boolean, width: number, height: number }) => unknown
}>()

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      expand: '展开',
      expandLabel: `全屏查看「${props.title}」`,
      collapse: '收起',
      collapseLabel: `退出「${props.title}」全屏`,
      placeholder: '模板正在全屏中显示',
    }
  : {
      expand: 'Expand',
      expandLabel: `View ${props.title} full screen`,
      collapse: 'Collapse',
      collapseLabel: `Exit ${props.title} full screen`,
      placeholder: 'This template is open full screen',
    })

// Just under the tuffex allocator's floor (DEFAULT_Z_INDEX_SEED = 2000), so every
// popover, dialog and drawer a template opens still stacks above the overlay.
// Not taken from the allocator on purpose: in a production build the
// auto-registered components compile from tuffex source while
// `@talex-touch/tuffex/utils` resolves to dist, so the two sides hold separate
// allocators and a number taken from one says nothing about the other. The site
// header's z-index 10000 does not compete: it lives inside `.docs-layout-root`,
// which isolates, so the whole docs layout paints below a body-level layer.
const OVERLAY_Z_INDEX = 1900
const ENTER_RATIO = 0.35

const expanded = ref(false)
const width = ref(0)
const bodyHeight = ref(0)

const stageRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const expandButtonRef = ref<HTMLButtonElement | null>(null)
const collapseButtonRef = ref<HTMLButtonElement | null>(null)

let resizeObserver: ResizeObserver | null = null
let visibilityObserver: IntersectionObserver | null = null
let entered = false
let lockedRoot: { overflow: string, paddingRight: string } | null = null

function markEntered() {
  if (entered)
    return
  entered = true
  visibilityObserver?.disconnect()
  visibilityObserver = null
  emit('enter')
}

function lockScroll() {
  const root = document.documentElement
  if (lockedRoot)
    return
  lockedRoot = { overflow: root.style.overflow, paddingRight: root.style.paddingRight }
  // Hiding the scrollbar widens the page; pad it back so the column underneath
  // does not jump sideways behind the backdrop.
  const scrollbar = window.innerWidth - root.clientWidth
  root.style.overflow = 'hidden'
  if (scrollbar > 0)
    root.style.paddingRight = `${scrollbar}px`
}

function unlockScroll() {
  if (!lockedRoot)
    return
  const root = document.documentElement
  root.style.overflow = lockedRoot.overflow
  root.style.paddingRight = lockedRoot.paddingRight
  lockedRoot = null
}

// Moving the body between parents, which the Teleport does whenever `disabled`
// flips, drops every scroll offset inside it without firing a scroll event: a
// list read halfway down would be back at its top after each toggle. A scroller
// that sat at its end (a chat, a log) goes back to its end instead, because the
// old offset means something else once the viewport height changes.
type ScrollSnapshot = Array<{ element: Element, top: number, left: number, atEnd: boolean }>

function snapshotScroll(): ScrollSnapshot {
  const body = bodyRef.value
  if (!body)
    return []
  const snapshot: ScrollSnapshot = []
  for (const element of [body, ...body.querySelectorAll('*')]) {
    const { scrollTop: top, scrollLeft: left } = element
    if (top || left)
      snapshot.push({ element, top, left, atEnd: top + element.clientHeight >= element.scrollHeight - 2 })
  }
  return snapshot
}

// Once right after the move, so the first painted frame is already in place,
// and once more a frame later for content that re-rendered at the new size.
function restoreScroll(snapshot: ScrollSnapshot) {
  if (!snapshot.length)
    return
  const apply = () => {
    for (const { element, top, left, atEnd } of snapshot) {
      if (!element.isConnected)
        continue
      element.scrollTop = atEnd ? element.scrollHeight : top
      element.scrollLeft = left
    }
  }
  apply()
  requestAnimationFrame(apply)
}

async function expand() {
  if (expanded.value)
    return
  const scroll = snapshotScroll()
  lockScroll()
  expanded.value = true
  await nextTick()
  restoreScroll(scroll)
  collapseButtonRef.value?.focus({ preventScroll: true })
}

async function collapse() {
  if (!expanded.value)
    return
  const scroll = snapshotScroll()
  expanded.value = false
  unlockScroll()
  await nextTick()
  restoreScroll(scroll)
  expandButtonRef.value?.focus({ preventScroll: true })
}

function onOverlayKeydown(event: KeyboardEvent) {
  if (!expanded.value || event.key !== 'Escape' || event.defaultPrevented)
    return
  // A menu or combobox trigger with its popup open closes that popup on
  // Escape; closing the overlay on the same press would take both down. The
  // state lives on the trigger's wrapper (`.tx-popover__reference`), not on the
  // button that holds focus, hence `closest`.
  const target = event.target as HTMLElement | null
  if (target?.closest('[aria-expanded="true"]:is([aria-haspopup], [role="combobox"])')
    && !target.closest('[data-template-esc="self"]'))
    return
  event.preventDefault()
  void collapse()
}

onMounted(() => {
  const body = bodyRef.value
  if (body && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect)
        return
      width.value = Math.round(rect.width)
      bodyHeight.value = Math.round(rect.height)
    })
    resizeObserver.observe(body)
  }

  const stage = stageRef.value
  if (!stage || !('IntersectionObserver' in window)) {
    markEntered()
    return
  }
  visibilityObserver = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= ENTER_RATIO))
      markEntered()
  }, { threshold: [0, ENTER_RATIO] })
  visibilityObserver.observe(stage)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  visibilityObserver?.disconnect()
  visibilityObserver = null
  unlockScroll()
})
</script>

<template>
  <div class="template-frame not-prose" :style="{ '--template-frame-height': `${props.height}px` }">
    <div class="template-frame__toolbar">
      <span class="template-frame__readout" aria-hidden="true">
        <span class="template-frame__readout-icon i-carbon-screen" />
        {{ width }} × {{ bodyHeight }}
      </span>
      <button
        ref="expandButtonRef"
        type="button"
        class="template-frame__button"
        :aria-label="copy.expandLabel"
        :disabled="expanded"
        @click="expand"
      >
        <span class="template-frame__button-icon i-carbon-maximize" aria-hidden="true" />
        {{ copy.expand }}
      </button>
    </div>

    <div ref="stageRef" class="template-frame__stage">
      <div v-if="expanded" class="template-frame__placeholder">
        <span>{{ copy.placeholder }}</span>
        <button type="button" class="template-frame__button" @click="collapse">
          <span class="template-frame__button-icon i-carbon-minimize" aria-hidden="true" />
          {{ copy.collapse }}
        </button>
      </div>

      <Teleport to="body" :disabled="!expanded">
        <div
          class="template-frame__host not-prose"
          :class="{ 'is-expanded': expanded }"
          :style="expanded ? { zIndex: OVERLAY_Z_INDEX } : undefined"
          @keydown="onOverlayKeydown"
        >
          <div v-if="expanded" class="template-frame__backdrop" aria-hidden="true" @click="collapse" />
          <div
            ref="panelRef"
            class="template-frame__panel"
            :role="expanded ? 'dialog' : undefined"
            :aria-modal="expanded ? 'true' : undefined"
            :aria-label="expanded ? props.title : undefined"
            :tabindex="expanded ? -1 : undefined"
          >
            <div v-if="expanded" class="template-frame__overlay-bar">
              <span class="template-frame__overlay-title">{{ props.title }}</span>
              <span class="template-frame__readout" aria-hidden="true">
                <span class="template-frame__readout-icon i-carbon-screen" />
                {{ width }} × {{ bodyHeight }}
              </span>
              <button
                ref="collapseButtonRef"
                type="button"
                class="template-frame__button"
                :aria-label="copy.collapseLabel"
                @click="collapse"
              >
                <span class="template-frame__button-icon i-carbon-minimize" aria-hidden="true" />
                {{ copy.collapse }}
                <kbd class="template-frame__kbd">Esc</kbd>
              </button>
            </div>
            <div ref="bodyRef" class="template-frame__body">
              <slot :expanded="expanded" :width="width" :height="bodyHeight" />
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.template-frame {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.template-frame__toolbar,
.template-frame__overlay-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.template-frame__toolbar {
  justify-content: space-between;
}

.template-frame__readout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.template-frame__readout-icon {
  font-size: 13px;
}

.template-frame__button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tx-text-color-secondary, #909399);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.template-frame__button:hover:not(:disabled) {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.template-frame__button:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.template-frame__button:disabled {
  cursor: default;
  opacity: 0.45;
}

.template-frame__button-icon {
  font-size: 13px;
}

.template-frame__kbd {
  padding: 1px 5px;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-light, #e4e7ed);
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-family: inherit;
  font-size: 11px;
  line-height: 1.4;
}

.template-frame__stage {
  position: relative;
  height: var(--template-frame-height);
}

.template-frame__placeholder {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border-radius: 14px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 13px;
}

/* In the docs column the host simply fills the stage. */
.template-frame__host {
  height: 100%;
}

.template-frame__panel {
  display: flex;
  height: 100%;
  flex-direction: column;
}

.template-frame__body {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  border-radius: 14px;
  background: var(--tx-bg-color, #ffffff);
  box-shadow: 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  container-name: template;
  container-type: inline-size;
}

/* Expanded: the same host, moved under <body>. */
.template-frame__host.is-expanded {
  position: fixed;
  display: flex;
  justify-content: center;
  padding: 24px;
  inset: 0;
  animation: template-frame-in 0.18s ease-out;
}

.template-frame__backdrop {
  position: absolute;
  /* The page colour rather than a black scrim: on the dark docs theme a 50%
     black barely dims the column underneath, and its text read straight
     through around the panel. */
  background: color-mix(in srgb, var(--tx-bg-color-page, #f2f3f5) 86%, transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  inset: 0;
}

.template-frame__host.is-expanded .template-frame__panel {
  position: relative;
  width: min(1440px, 100%);
  gap: 10px;
  outline: none;
}

.template-frame__overlay-bar {
  padding: 0 4px;
}

.template-frame__overlay-title {
  margin-right: auto;
  color: var(--tx-text-color-primary, #303133);
  font-size: 14px;
  font-weight: 600;
}

.template-frame__host.is-expanded .template-frame__body {
  box-shadow: var(--tx-elevation-5, 6px 14px 40px rgba(0, 0, 0, 0.11));
}

@keyframes template-frame-in {
  from {
    opacity: 0;
  }
}

@media (max-width: 640px) {
  .template-frame__host.is-expanded {
    padding: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .template-frame__host.is-expanded {
    animation: none;
  }
}
</style>
