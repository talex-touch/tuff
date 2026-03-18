<script setup lang="ts">
import ThContent from '../article/ThContent.vue'

const props = withDefaults(defineProps<{
  data: string
  dotEnable?: boolean
  streamingGradient?: boolean
}>(), {
  streamingGradient: false,
})

const inner = ref()
const dot = ref<HTMLDivElement>()
const gradientPulse = ref(false)
const gradientPulseKey = ref(0)
const prefersReducedMotion = ref(false)

let timer: any
let dotUpdateTimer: any
let gradientPulseTimer: any
let gradientPulseThrottleTimer: any
let motionMediaQuery: MediaQueryList | null = null
let dotTrackingFrameId: number | null = null
let lastDotUpdateAt = 0
let lastGradientPulseAt = 0
const DOT_UPDATE_THROTTLE_MS = 0
const DOT_VERTICAL_OFFSET_PX = 3
const GRADIENT_PULSE_THROTTLE_MS = 180
const GRADIENT_PULSE_DURATION_MS = 520
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const DOT_ANCHOR_IGNORE_SELECTOR = [
  '.Generating-Dot',
  '.Streaming-GradientOverlay',
  '.Streaming-GradientLine',
  '.rich-copy',
  '.EditorCode-Header',
  '.EditorCode-ContentFav',
  '.EditorCode-ContentActions',
].join(',')

function handleGeneratingDotUpdate(rootEl: HTMLElement, cursor: HTMLElement) {
  if (!props.dotEnable || !rootEl || !cursor)
    return

  cursor.style.opacity = '1'
  timer && clearTimeout(timer)
  timer = setTimeout(() => {
    if (props.dotEnable)
      return

    cursor.style.opacity = '0'
  }, 2200)

  const anchor = resolveDotAnchor(rootEl)
  const range = document.createRange()
  let anchorRect: DOMRect | null = null

  if (anchor.textNode) {
    const textNode = anchor.textNode
    const rawContent = textNode.textContent || ''
    const endOffset = resolveRenderableTextEndOffset(rawContent)
    range.setStart(textNode, endOffset)
    range.collapse(true)

    if (endOffset > 0) {
      const tailRange = document.createRange()
      tailRange.setStart(textNode, endOffset - 1)
      tailRange.setEnd(textNode, endOffset)
      anchorRect = resolveCaretRectFromRange(tailRange)
    }
  }
  else {
    range.selectNodeContents(rootEl)
    range.collapse(false)
  }

  const caretRect = resolveCaretRectFromRange(range)
  const shouldPreferCaretAtLineEnd = /\n[ \t]*$/.test(props.data)
  const shouldUseFallbackAnchor = shouldPreferFallbackAnchor(anchor.textNode, anchor.fallbackElement)
  const fallbackAnchorPoint = anchor.fallbackElement
    ? resolveFallbackAnchorPoint(anchor.fallbackElement)
    : null
  const resolvedRect = shouldUseFallbackAnchor
    ? null
    : shouldPreferCaretAtLineEnd
      ? (caretRect || anchorRect)
      : (anchorRect || caretRect)
  const containerRect = resolveCursorContainerRect(rootEl, cursor)
  if (!resolvedRect && !fallbackAnchorPoint) {
    return
  }

  const cursorHeight = Math.max(cursor.offsetHeight || 8, 8)
  const useAnchorCharRect = !fallbackAnchorPoint && !!anchorRect && resolvedRect === anchorRect
  const top = fallbackAnchorPoint
    ? fallbackAnchorPoint.top - containerRect.top - cursorHeight / 2 + DOT_VERTICAL_OFFSET_PX
    : resolvedRect!.bottom - containerRect.top - cursorHeight * 0.8 + DOT_VERTICAL_OFFSET_PX
  const leftAnchor = fallbackAnchorPoint
    ? fallbackAnchorPoint.left
    : useAnchorCharRect
      ? anchorRect!.right
      : resolvedRect!.left
  const left = leftAnchor - containerRect.left + 1

  Object.assign(cursor!.style, {
    top: `${Math.max(0, top)}px`,
    left: `${Math.max(0, left)}px`,
  })

  // setTimeout(() => handleGeneratingDotUpdate(rootEl, cursor), 20)
}

function resolveCaretRectFromRange(range: Range): DOMRect | null {
  const rectList = range.getClientRects()
  if (rectList.length > 0) {
    return rectList[rectList.length - 1] || null
  }
  const rect = range.getBoundingClientRect()
  if (!rect) {
    return null
  }
  if (rect.width === 0 && rect.height === 0 && rect.left === 0 && rect.top === 0) {
    return null
  }
  return rect
}

function isIgnoredAnchorElement(element: Element | null): boolean {
  if (!element) {
    return false
  }
  return Boolean(element.closest(DOT_ANCHOR_IGNORE_SELECTOR))
}

function isMeaningfulFallbackElement(element: HTMLElement): boolean {
  const tagName = element.tagName
  return tagName === 'LI'
    || tagName === 'P'
    || tagName === 'PRE'
    || tagName === 'CODE'
    || tagName === 'TD'
    || tagName === 'TH'
    || tagName === 'BLOCKQUOTE'
    || tagName === 'H1'
    || tagName === 'H2'
    || tagName === 'H3'
    || tagName === 'H4'
    || tagName === 'H5'
    || tagName === 'H6'
}

function hasRenderableFallbackContent(element: HTMLElement): boolean {
  if (element.tagName === 'LI') {
    return true
  }
  const normalizedText = String(element.textContent || '').replace(/\u200B/g, '')
  return resolveRenderableTextEndOffset(normalizedText) > 0
}

function resolveCursorContainerRect(rootEl: HTMLElement, cursor: HTMLElement): DOMRect {
  const offsetParent = cursor.offsetParent
  if (offsetParent instanceof HTMLElement) {
    return offsetParent.getBoundingClientRect()
  }
  return rootEl.getBoundingClientRect()
}

function shouldPreferFallbackAnchor(textNode: Text | null, fallbackElement: HTMLElement | null): boolean {
  if (!fallbackElement) {
    return false
  }

  if (fallbackElement.tagName === 'LI' && textNode) {
    const fallbackText = String(fallbackElement.textContent || '').replace(/\u200B/g, '')
    if (resolveRenderableTextEndOffset(fallbackText) === 0) {
      return false
    }
  }

  if (!textNode) {
    return true
  }
  if (fallbackElement.contains(textNode)) {
    return false
  }
  const position = textNode.compareDocumentPosition(fallbackElement)
  return Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)
}

function resolveDotAnchor(rootEl: HTMLElement): { textNode: Text | null, fallbackElement: HTMLElement | null } {
  let textNode: Text | null = null
  let fallbackElement: HTMLElement | null = null

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let current: Node | null = walker.nextNode()

  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const nextTextNode = current as Text
      const parentElement = nextTextNode.parentElement
      const text = String(nextTextNode.textContent || '').replace(/\u200B/g, '')
      if (resolveRenderableTextEndOffset(text) > 0 && parentElement && !isIgnoredAnchorElement(parentElement)) {
        textNode = nextTextNode
      }
    }
    else if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as HTMLElement
      if (element !== rootEl && !isIgnoredAnchorElement(element)) {
        const style = window.getComputedStyle(element)
        if (
          style.display !== 'none'
          && style.visibility !== 'hidden'
          && element.getClientRects().length > 0
          && isMeaningfulFallbackElement(element)
          && hasRenderableFallbackContent(element)
        ) {
          fallbackElement = element
        }
      }
    }
    current = walker.nextNode()
  }

  return {
    textNode,
    fallbackElement,
  }
}

function resolveFallbackAnchorPoint(element: HTMLElement): { top: number, left: number } | null {
  const normalizedText = String(element.textContent || '').replace(/\u200B/g, '')
  const isEmptyListItem = element.tagName === 'LI' && resolveRenderableTextEndOffset(normalizedText) === 0
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  const caretRect = resolveCaretRectFromRange(range)
  if (caretRect) {
    let left = caretRect.left + 1
    if (isEmptyListItem) {
      const style = window.getComputedStyle(element)
      const fontSize = Number.parseFloat(style.fontSize || '16') || 16
      left = caretRect.left + Math.max(12, Math.round(fontSize * 1.05))
    }
    return {
      top: caretRect.bottom,
      left,
    }
  }

  const rect = element.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) {
    return null
  }

  const style = window.getComputedStyle(element)
  const fontSize = Number.parseFloat(style.fontSize || '16') || 16
  const lineHeight = Number.parseFloat(style.lineHeight || '')
  const fallbackLineHeight = Number.isFinite(lineHeight) ? lineHeight : Math.max(fontSize * 1.25, 16)

  let left = rect.left + 2
  if (element.tagName === 'LI') {
    left = rect.left + Math.max(18, Math.round(fontSize * 1.35))
  }
  else if (element.tagName === 'PRE' || element.tagName === 'CODE') {
    left = rect.left + 8
  }

  const top = rect.top + Math.min(rect.height, fallbackLineHeight * 0.96)
  return { top, left }
}

function resolveRenderableTextEndOffset(text: string): number {
  if (!text) {
    return 0
  }

  for (let index = text.length - 1; index >= 0; index--) {
    const char = text[index]
    if (char === '\u200B' || char === '\uFEFF') {
      continue
    }
    if (/\s/.test(char)) {
      continue
    }
    return index + 1
  }

  return 0
}

function clearDotUpdateTimer() {
  if (!dotUpdateTimer) {
    return
  }
  clearTimeout(dotUpdateTimer)
  dotUpdateTimer = null
}

function clearDotTrackingFrame() {
  if (dotTrackingFrameId === null) {
    return
  }
  cancelAnimationFrame(dotTrackingFrameId)
  dotTrackingFrameId = null
}

function clearGradientPulseTimer() {
  if (!gradientPulseTimer) {
    return
  }
  clearTimeout(gradientPulseTimer)
  gradientPulseTimer = null
}

function clearGradientPulseThrottleTimer() {
  if (!gradientPulseThrottleTimer) {
    return
  }
  clearTimeout(gradientPulseThrottleTimer)
  gradientPulseThrottleTimer = null
}

function stopGradientPulse() {
  gradientPulse.value = false
  clearGradientPulseTimer()
  clearGradientPulseThrottleTimer()
}

function applyReducedMotionPreference(matches: boolean) {
  prefersReducedMotion.value = matches
  if (matches) {
    stopGradientPulse()
  }
}

function handleReducedMotionMediaChange(event: MediaQueryListEvent) {
  applyReducedMotionPreference(event.matches)
}

function setupReducedMotionPreference() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return
  }
  motionMediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
  applyReducedMotionPreference(motionMediaQuery.matches)

  if (typeof motionMediaQuery.addEventListener === 'function') {
    motionMediaQuery.addEventListener('change', handleReducedMotionMediaChange)
    return
  }
  motionMediaQuery.addListener(handleReducedMotionMediaChange)
}

function teardownReducedMotionPreference() {
  if (!motionMediaQuery) {
    return
  }
  if (typeof motionMediaQuery.removeEventListener === 'function') {
    motionMediaQuery.removeEventListener('change', handleReducedMotionMediaChange)
  }
  else {
    motionMediaQuery.removeListener(handleReducedMotionMediaChange)
  }
  motionMediaQuery = null
}

const gradientEnabled = computed(() => {
  return !!props.streamingGradient && !!props.dotEnable && !prefersReducedMotion.value
})

function startGradientPulse() {
  if (!gradientEnabled.value) {
    return
  }

  lastGradientPulseAt = Date.now()
  gradientPulseKey.value += 1
  gradientPulse.value = false

  nextTick(() => {
    if (!gradientEnabled.value) {
      return
    }
    gradientPulse.value = true
    clearGradientPulseTimer()
    gradientPulseTimer = setTimeout(() => {
      gradientPulse.value = false
      gradientPulseTimer = null
    }, GRADIENT_PULSE_DURATION_MS)
  })
}

function scheduleGradientPulse() {
  if (!gradientEnabled.value) {
    return
  }

  const now = Date.now()
  const elapsed = now - lastGradientPulseAt
  if (elapsed >= GRADIENT_PULSE_THROTTLE_MS) {
    startGradientPulse()
    return
  }

  if (gradientPulseThrottleTimer) {
    return
  }

  gradientPulseThrottleTimer = setTimeout(() => {
    gradientPulseThrottleTimer = null
    startGradientPulse()
  }, Math.max(0, GRADIENT_PULSE_THROTTLE_MS - elapsed))
}

function resolveMarkdownRoot(): HTMLElement | null {
  const el = inner.value as HTMLElement | undefined
  if (!el) {
    return null
  }
  return el.querySelector('.MilkContent')
}

function scheduleGeneratingDotUpdate(rootEl: HTMLElement, cursor: HTMLElement) {
  if (!props.dotEnable || !rootEl || !cursor) {
    return
  }

  if (DOT_UPDATE_THROTTLE_MS <= 0) {
    handleGeneratingDotUpdate(rootEl, cursor)
    return
  }

  const now = Date.now()
  const elapsed = now - lastDotUpdateAt
  if (elapsed >= DOT_UPDATE_THROTTLE_MS) {
    lastDotUpdateAt = now
    handleGeneratingDotUpdate(rootEl, cursor)
    return
  }

  if (dotUpdateTimer) {
    return
  }

  dotUpdateTimer = setTimeout(() => {
    dotUpdateTimer = null
    lastDotUpdateAt = Date.now()
    handleGeneratingDotUpdate(rootEl, cursor)
  }, Math.max(0, DOT_UPDATE_THROTTLE_MS - elapsed))
}

function trackGeneratingDotPosition() {
  if (!props.dotEnable) {
    clearDotTrackingFrame()
    return
  }

  const dom = resolveMarkdownRoot()
  const cursor = dot.value
  if (dom && cursor) {
    scheduleGeneratingDotUpdate(dom, cursor)
  }

  dotTrackingFrameId = requestAnimationFrame(trackGeneratingDotPosition)
}

function startDotTracking() {
  if (typeof window === 'undefined' || dotTrackingFrameId !== null || !props.dotEnable) {
    return
  }
  dotTrackingFrameId = requestAnimationFrame(trackGeneratingDotPosition)
}

function stopDotTracking() {
  clearDotTrackingFrame()
}

const value = ref('')

watchEffect(() => {
  value.value = props.data

  const dom = resolveMarkdownRoot()
  const cursor = dot.value
  if (!dom || !cursor) {
    return
  }

  nextTick(() => scheduleGeneratingDotUpdate(dom, cursor))
})

watch(gradientEnabled, (enabled) => {
  if (enabled) {
    return
  }
  stopGradientPulse()
})

watch(() => props.data, (next, prev) => {
  if (!gradientEnabled.value || typeof prev !== 'string') {
    return
  }
  if (next === prev || next.length <= prev.length) {
    return
  }
  const delta = next.startsWith(prev) ? next.slice(prev.length) : next
  if (!delta.includes('\n')) {
    return
  }
  scheduleGradientPulse()
})

watch(() => props.dotEnable, (enabled) => {
  if (enabled) {
    startDotTracking()
    return
  }
  stopDotTracking()
}, { immediate: true })

onMounted(() => {
  setupReducedMotionPreference()
  startDotTracking()
})

onBeforeUnmount(() => {
  timer && clearTimeout(timer)
  clearDotUpdateTimer()
  stopDotTracking()
  stopGradientPulse()
  teardownReducedMotionPreference()
})
</script>

<template>
  <div ref="inner" class="RenderContent">
    <ThContent v-model="value" readonly />
    <div v-if="gradientEnabled" class="Streaming-GradientLine" />
    <div
      v-if="gradientEnabled && gradientPulse"
      :key="gradientPulseKey"
      class="Streaming-GradientOverlay"
    />
    <div v-if="dotEnable" ref="dot" class="Generating-Dot" />
  </div>
</template>

<style lang="scss">
.RenderContent {
  .MilkContent {
    padding: 0;
  }
}

.Generating-Dot {
  position: absolute;

  top: 0;
  left: 0;

  width: 8px;
  height: 8px;

  opacity: 0;
  z-index: 3;
  border-radius: 50%;
  pointer-events: none;
  background-color: var(--el-text-color-primary);

  transition: opacity 0.1s linear;
  will-change: top, left, opacity;
  animation: dot-frames 0.5s infinite;
}

.Streaming-GradientOverlay {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  height: 2px;
  z-index: 2;
  pointer-events: none;
  border-radius: 999px;
  opacity: 0;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(120, 168, 245, 0.16) 36%,
    rgba(120, 168, 245, 0.72) 50%,
    rgba(120, 168, 245, 0.16) 64%,
    rgba(255, 255, 255, 0) 100%
  );
  animation: markdown-gradient-pulse 0.52s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
}

.Streaming-GradientLine {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  height: 1px;
  z-index: 1;
  pointer-events: none;
  opacity: 0.45;
  border-radius: 999px;
  background-color: rgba(120, 168, 245, 0.28);
}

@media (prefers-reduced-motion: reduce) {
  .Streaming-GradientOverlay {
    animation: none;
    opacity: 0;
  }
}

@keyframes markdown-gradient-pulse {
  0% {
    opacity: 0;
    transform: translateX(-48%);
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(48%);
  }
}

@keyframes dot-frames {
  0% {
    opacity: 0;
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

// .language-echarts,
.language-abc svg {
  border-radius: 16px;
  background: #ffffff;
}

.language-echarts {
  // padding: 0.5rem 0;
  border-radius: 4px;

  // box-sizing: border-box;
}

.RenderContent {
  position: relative;

  .language-mermaid {
    min-width: 500px;
  }

  // &-Wrapper {
  //   padding-bottom: 1rem;
  // }

  // .el-scrollbar__bar.is-horizontal {
  //   height: 3px;
  //   left: 0;
  // }
  h1 {
    font-size: 1.5rem;
  }

  h2 {
    font-size: 1.25rem;
  }

  h3 {
    font-size: 1.125rem;
  }

  // pre {
  //   margin: 0.5rem 0;
  //   padding: 0.5rem 0.25rem;

  //   max-width: 100%;

  //   overflow-x: scroll;
  //   border-radius: 12px;
  //   background-color: var(--el-bg-color-page);
  // }
  // .language-abc {
  //   margin: 1rem 0;
  // }

  pre code {
    span.hljs-keyword {
      color: #cb5a3d;
      // color: var(--el-color-primary);
    }

    span.hljs-name {
      color: #25aff3;
    }
    color: var(--el-text-color-primary);
    background-color: transparent;
  }

  table {
    th {
      background-color: var(--el-bg-color-page);
    }
    tr {
      border-top: 1px solid var(--el-border-color);
      background-color: var(--el-fill-color-light);
    }

    td,
    th {
      border: 1px solid var(--el-border-color);
    }

    tbody tr:nth-child(2n) {
      background-color: var(--el-fill-color-lighter);
    }
  }
}
</style>
