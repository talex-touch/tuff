<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ImagePreviewEmits, ImagePreviewIndicator, ImagePreviewItem, ImagePreviewProps } from './types'
import type { PreviewSize, PreviewView } from './zoom'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { hasDocument } from '../../../../utils/env'
import { trapTab } from '../../../../utils/focus-trap'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'
import { isTopmostModalDialog } from '../../../../utils/z-index-manager'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import { PREVIEW_ICONS } from './icons'
import ImagePreviewIcon from './ImagePreviewIcon.vue'
import ImagePreviewMenu from './ImagePreviewMenu.vue'
import ImagePreviewMinimap from './ImagePreviewMinimap.vue'
import ImagePreviewSlide from './ImagePreviewSlide.vue'
import ImagePreviewStrip from './ImagePreviewStrip.vue'
import ImagePreviewToolbar from './ImagePreviewToolbar.vue'
import { usePreviewActions } from './use-preview-actions'
import { SLIDE_GAP, usePreviewGestures } from './use-preview-gestures'
import { usePreviewMenu } from './use-preview-menu'
import { usePreviewOrigins } from './use-preview-origin'
import { usePreviewPictures } from './use-preview-pictures'
import { usePreviewPresence } from './use-preview-presence'
import { usePreviewSlides } from './use-preview-slides'
import { usePreviewStage } from './use-preview-stage'
import { usePreviewTransition } from './use-preview-transition'

// One picture at a time over the whole window, with its neighbours waiting on either side. This
// file puts the parts together, and owns the keyboard and the chrome around it all, which a touch
// tap hides and shows. The hands are use-preview-gestures'. Opening and closing are
// use-preview-presence's, on use-preview-transition's progress: a picture flies between its
// thumbnail, use-preview-origin's, and the stage on flight's poses. The stage is measured by
// use-preview-stage, its pages posed by use-preview-slides and drawn by ImagePreviewSlide, and
// the pictures loaded by use-preview-pictures. The actions are use-preview-actions', and their
// menu use-preview-menu's, drawn by ImagePreviewMenu as the zoom readout's is. The toolbar, the
// strip along the bottom and the minimap in the corner are ImagePreviewToolbar, ImagePreviewStrip
// and ImagePreviewMinimap.

defineOptions({ name: 'TxImagePreview' })

const props = withDefaults(defineProps<ImagePreviewProps>(), {
  images: () => [],
  maxScale: 4,
  transition: 'zoom',
  actions: () => ['rotate', 'copy', 'share', 'download'],
  contextMenu: true,
  indicator: 'thumbnails',
  minimap: true,
  bounce: 0.2,
  maskSurface: 'refraction',
  maskColor: 'rgb(10, 10, 12)',
  maskOpacity: 0.35,
  maskBlur: 12,
  controlSurface: 'blur',
  controlColor: 'rgb(64, 64, 70)',
  controlOpacity: 0.6,
  controlBlur: 16,
  label: 'Image preview',
  closeLabel: 'Close',
  previousLabel: 'Previous image',
  nextLabel: 'Next image',
  zoomInLabel: 'Zoom in',
  zoomOutLabel: 'Zoom out',
  zoomLabel: 'Zoom',
  resetLabel: 'Fit to screen',
  rotateLabel: 'Rotate',
  copyLabel: 'Copy image',
  shareLabel: 'Share',
  downloadLabel: 'Download',
  menuLabel: 'Image actions',
  indicatorLabel: 'Images',
  copiedText: 'Image copied',
  linkCopiedText: 'Link copied',
  copyFailedText: 'Could not copy the image',
  failedText: 'This image could not be loaded',
  counterFormatter: (current: number, total: number) => `${current} / ${total}`,
  scaleFormatter: (scale: number) => `${Math.round(scale * 100)}%`,
  indicatorItemFormatter: (current: number, total: number, name?: string) =>
    name ? `${name}, ${current} of ${total}` : `Image ${current} of ${total}`,
  labelFormatter: (label: string, name: string) => `${label}: ${name}`,
  readoutLabelFormatter: (readout: string, label: string) => `${readout}, ${label}`,
})

const emit = defineEmits<ImagePreviewEmits>()

const open = defineModel<boolean>('open', { default: false })
const index = defineModel<number>('index', { default: 0 })

const reduced = useReducedMotion()

const items = computed<ImagePreviewItem[]>(() =>
  (props.images ?? []).map(source => (typeof source === 'string' ? { url: source } : source)),
)
const count = computed(() => items.value.length)

function clampIndex(value: number): number {
  const safe = Number.isFinite(value) ? Math.round(value) : 0
  return Math.min(Math.max(0, safe), Math.max(0, count.value - 1))
}

// Paging writes this at once and reports it, so two page turns inside one render still turn two
// pages; the host's own moves come back through the model.
const current = ref(clampIndex(index.value))
const currentItem = computed(() => items.value[current.value] ?? null)

function setCurrent(value: number): void {
  current.value = value
  index.value = value
}

const bounce = computed(() => (Number.isFinite(props.bounce) ? Math.min(0.9, Math.max(0, props.bounce)) : 0.2))

const maskMaterial = computed(() => ({
  mode: props.maskSurface,
  color: props.maskColor,
  opacity: props.maskOpacity,
  blur: props.maskBlur,
}))

const controlMaterial = computed(() => ({
  mode: props.controlSurface,
  color: props.controlColor,
  opacity: props.controlOpacity,
  blur: props.controlBlur,
}))

// -- The stage, use-preview-stage's: its size, and where a whole picture fits on it.

const overlayRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const fitRef = ref<HTMLElement | null>(null)
const { stageSize, fitBox, overlayPoint } = usePreviewStage({ overlay: overlayRef, stage: stageRef, fit: fitRef })

// -- Pictures, use-preview-pictures': their sizes once loaded, the failed ones, and the stand-ins.

const pictures = usePreviewPictures({
  items: () => items.value,
  current,
  hostFailed: () => props.failed,
  fitBox: () => fitBox.value,
  onError: (url, at) => emit('error', url, at),
})
const { sizes, isFailed, onImageLoad, onImageError, bindImage } = pictures

// -- Coming and going, use-preview-presence's. A picture flies out of the thumbnail the host
// points at, and back, only for `zoom`, and never with reduced motion.

const origins = usePreviewOrigins({
  origin: () => (props.transition === 'zoom' && !reduced.value ? props.origin ?? null : null),
  overlay: overlayRef,
})
const transition = usePreviewTransition({ bounce: () => bounce.value })
// A touch tap hides the chrome, so the picture can be seen whole.
const chromeHidden = ref(false)

const { rendered, closing, arrived, flight, zIndex, enter, leave, requestClose, settleOpen } = usePreviewPresence({
  open,
  items: () => items.value,
  current,
  clampIndex,
  overlay: overlayRef,
  stage: stageRef,
  transition,
  pictures,
  origins,
  drawnPose: size => drawnPose(size),
  onEnter: () => {
    chromeHidden.value = false
    closeMenu(false)
  },
  onLeave: () => {
    gestures.cancel()
    // A page half turned goes back as the neighbour fades: the host keeps the page that left.
    gestures.keepPage()
    closeMenu(false)
  },
  resetGestures: () => gestures.resetAll(),
  onGone: () => clearStatus(),
  onClose: () => emit('close'),
})

const PICTURE = '.tx-image-preview__image, .tx-image-preview__stand-in, .tx-image-preview__frame, .tx-image-preview__placeholder, .tx-image-preview__failed'

function isPicture(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(PICTURE) !== null
}

// -- Actions, use-preview-actions', in the toolbar and the menu, which is use-preview-menu's.

const { actionList, actionLabel, actionDisabled, runAction, statusText, statusLevel, clearStatus } = usePreviewActions(props, {
  item: () => currentItem.value,
  index: () => current.value,
  isFailed,
  sizes: () => sizes.value,
  canRotate: () => gestures.view.value !== null,
  rotate: direction => gestures.rotate(direction),
  live: () => rendered.value && !closing.value,
  emit: event => emit('action', event),
  level: transition.level,
})

const actionMenu = ref<InstanceType<typeof ImagePreviewMenu> | null>(null)
const toolbarRef = ref<InstanceType<typeof ImagePreviewToolbar> | null>(null)
const {
  menuOpen,
  menuArmed,
  menuLevel,
  menuItems,
  menuPlace,
  openMenu,
  closeMenu,
  chooseFromMenu,
  openMenuFromKeyboard,
  onContextMenu,
  onMouseDown,
} = usePreviewMenu({
  enabled: () => props.contextMenu,
  live: () => rendered.value && !closing.value,
  overlay: overlayRef,
  holdsFocus: () => actionMenu.value?.holdsFocus() ?? false,
  actions: () => actionList.value,
  label: actionLabel,
  disabled: actionDisabled,
  run: runAction,
  fitBox: () => fitBox.value,
  isPicture,
  point: overlayPoint,
  settle: settleOpen,
  endPress: () => gestures.endPress(),
  level: transition.level,
})

const gestures = usePreviewGestures({
  stage: stageRef,
  size: () => stageSize.value,
  box: () => fitBox.value,
  image: () => {
    const item = currentItem.value
    return item && !isFailed(item.url) ? sizes.value.get(item.url) ?? null : null
  },
  maxScale: () => (Number.isFinite(props.maxScale) && props.maxScale > 0 ? props.maxScale : 4),
  active: () => rendered.value && !closing.value && !menuOpen.value,
  canStep: step => current.value + step >= 0 && current.value + step < count.value,
  // A zoomed or turned picture paged away from keeps its view as it slides out, and one still
  // flying out stays in the air, to land beside the one turned to (see use-preview-slides).
  onStep: (step) => {
    holdOutgoing()
    setCurrent(clampIndex(current.value + step))
    gestures.resetView()
  },
  onDismiss: velocity => requestClose(velocity),
  isPicture,
  onBackdrop: () => {
    requestClose()
  },
  onTap: () => {
    chromeHidden.value = !chromeHidden.value
    // A hidden button that held focus would drop it to <body>, outside the dialog.
    const root = overlayRef.value
    if (chromeHidden.value && root && hasDocument() && root.contains(document.activeElement) && document.activeElement !== root)
      root.focus({ preventScroll: true })
  },
  onLongPress: point => openMenu(point, 'touch', true),
  bounce: () => bounce.value,
})

// -- Drawing, use-preview-slides': the current page and its neighbours, at rest or in flight.

const { drawnSlides, boxStyle, drawnPose, holdOutgoing } = usePreviewSlides({
  items: () => items.value,
  current,
  gestures,
  pictures,
  stageSize: () => stageSize.value,
  fitBox: () => fitBox.value,
  flight: () => flight.value,
  presence: () => transition.presence.value,
  closing: () => closing.value,
})

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

const dismissing = computed(() => gestures.gesture.value === 'dismiss' || gestures.dismissProgress.value > 0)
const chromeWanted = computed(() => rendered.value && arrived.value && !closing.value && !chromeHidden.value && !dismissing.value)
const chromeLevel = transition.level(() => chromeWanted.value, 180)
// The mask comes and goes with the picture, and thins out as a drag pulls the picture away.
const maskLevel = computed(() => clamp01(transition.presence.value) * (1 - gestures.dismissProgress.value))
// A fade carries the pictures in and out; a flight carries itself.
const stageLevel = computed(() => (!arrived.value ? 0 : transition.kind.value === 'fade' ? clamp01(transition.presence.value) : 1))

// Once everything an opening touches is there, as the model may be open from the start.
watch(open, (value) => {
  if (value)
    enter()
  else
    leave()
}, { immediate: true, flush: 'sync' })

watch(index, (value) => {
  const next = clampIndex(value)
  if (next === current.value)
    return
  settleOpen()
  current.value = next
  gestures.resetAll()
})

// The list is the host's and can change under an open preview.
watch(count, (length) => {
  if (length === 0) {
    open.value = false
    return
  }
  const next = clampIndex(current.value)
  if (next !== current.value) {
    setCurrent(next)
    gestures.resetAll()
  }
})

const dialogLabel = computed(() => (currentItem.value?.name ? props.labelFormatter(props.label, currentItem.value.name) : props.label))
const counterText = computed(() => props.counterFormatter(current.value + 1, count.value))
const canZoomOut = computed(() => gestures.view.value !== null && !gestures.atMinScale.value)
const canZoomIn = computed(() => gestures.view.value !== null && !gestures.atMaxScale.value)

// -- Controls. They stay focusable at the ends (aria-disabled): a disabled button that held
// focus would drop it to <body>, outside the dialog.

function step(direction: -1 | 1): void {
  if (current.value + direction >= 0 && current.value + direction < count.value)
    gestures.go(direction)
}

function zoomIn(): void {
  if (canZoomIn.value)
    gestures.zoomIn()
}

function zoomOut(): void {
  if (canZoomOut.value)
    gestures.zoomOut()
}

function resetZoom(): void {
  if (canZoomOut.value)
    gestures.resetZoom()
}

// -- The strip along the bottom, ImagePreviewStrip's: thumbnails or dots, following the pages.

const indicator = computed<ImagePreviewIndicator>(() => {
  if (count.value <= 1)
    return 'none'
  return props.indicator === 'dots' || props.indicator === 'none' ? props.indicator : 'thumbnails'
})

/** Where the pages are, in pictures: the current one, less the share of a page a slide has gone. */
const stripPosition = computed(() => {
  const width = stageSize.value.width + SLIDE_GAP
  const f = stageSize.value.width > 0 ? current.value - gestures.track.value / width : current.value
  return Math.min(Math.max(f, 0), Math.max(0, count.value - 1))
})

/** Shows picture `at` at once, with no slide. */
function showAt(at: number): void {
  if (!rendered.value || closing.value || at < 0 || at >= count.value)
    return
  settleOpen()
  setCurrent(at)
  gestures.resetAll()
}

function stepFromStrip(direction: 1 | -1): void {
  if (rendered.value && !closing.value)
    gestures.go(direction)
}

// -- The minimap in the corner, ImagePreviewMinimap's: the whole picture while it is zoomed in.

interface MinimapPicture {
  src: string
  size: PreviewSize
  turns: number
  view: PreviewView
  stage: PreviewSize
}

/** The current picture while it is zoomed in, at rest on its page and turned square. */
const minimapPicture = computed<MinimapPicture | null>(() => {
  const item = currentItem.value
  const size = item && !isFailed(item.url) ? sizes.value.get(item.url) : undefined
  const view = gestures.view.value
  if (!props.minimap || !item || !size || !view || !gestures.zoomed.value || gestures.track.value !== 0 || gestures.angle.value !== gestures.turns.value * 90)
    return null
  return { src: item.url, size, turns: gestures.turns.value, view, stage: stageSize.value }
})
// Springing back to the whole picture, it fades as the spring sets off, following the view meanwhile.
const minimapWanted = computed(() => chromeWanted.value && minimapPicture.value !== null && !gestures.fitting.value)
const minimapLevel = transition.level(() => minimapWanted.value, 180)
// It fades out on what it showed last: before a turn, a page turned, or the whole picture again.
const minimapShown = shallowRef<MinimapPicture | null>(null)
watch(minimapPicture, (picture) => {
  if (picture)
    minimapShown.value = picture
}, { immediate: true })
const minimapDragging = ref(false)

// A wheel over the minimap zooms about the middle of the stage, which its frame is drawn around,
// rather than about the corner of the picture under the pointer.
function onMinimapWheel(event: WheelEvent): void {
  gestures.onWheel(event, { x: stageSize.value.width / 2, y: stageSize.value.height / 2 })
}

watch(current, () => closeMenu(false))

const overlayClass = computed(() => ({
  'is-closing': closing.value,
  'is-single': count.value <= 1,
  'is-zoomed': gestures.zoomed.value,
  'is-moving': gestures.moving.value || gestures.gesture.value !== 'idle' || minimapDragging.value,
  'is-grabbing': gestures.gesture.value === 'pan' || gestures.gesture.value === 'swipe',
  'is-dismissing': dismissing.value,
  'is-chrome-hidden': !chromeWanted.value,
  'is-chrome-off': chromeLevel.value === 0 && !chromeWanted.value,
  'is-flying': flight.value !== null,
  'is-menu-open': menuOpen.value,
  'has-thumbnails': indicator.value === 'thumbnails',
  'has-dots': indicator.value === 'dots',
  'has-strip': indicator.value !== 'none',
  'has-actions': actionList.value.length > 0,
}))

const overlayStyle = computed<CSSProperties>(() => ({
  'zIndex': zIndex.value,
  '--tx-image-preview-mask': `${maskLevel.value}`,
  '--tx-image-preview-stage': `${stageLevel.value}`,
  '--tx-image-preview-chrome': `${chromeLevel.value}`,
  '--tx-image-preview-minimap': `${minimapLevel.value}`,
  '--tx-image-preview-status': `${statusLevel.value}`,
  '--tx-image-preview-bounce-ease': `cubic-bezier(0.32, ${1 + bounce.value * 1.6}, 0.5, 1)`,
}))

// -- Keyboard. Tab stays inside the dialog: aria-modal promises the page behind is inert.

const PAGE_KEYS = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End'])

function onKeydown(event: KeyboardEvent): void {
  if (!rendered.value || closing.value || event.defaultPrevented)
    return
  if (!isTopmostModalDialog(overlayRef.value))
    return
  // Keys the menu does not take reach nothing else while it is open.
  if (menuOpen.value) {
    actionMenu.value?.onKey(event)
    return
  }
  // The zoom menu's keys reach it wherever focus is; the others still work the picture under it.
  if (toolbarRef.value?.onMenuKey(event))
    return
  // A keyboard has nothing to tap the chrome back with.
  chromeHidden.value = false
  if (event.key === 'Tab') {
    if (overlayRef.value)
      trapTab(event, overlayRef.value)
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    if (!gestures.cancel())
      requestClose()
    return
  }
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    if (openMenuFromKeyboard())
      event.preventDefault()
    return
  }
  const plain = !event.ctrlKey && !event.metaKey && !event.altKey
  if ((event.key === 'r' || event.key === 'R') && plain && actionList.value.includes('rotate')) {
    event.preventDefault()
    runAction('rotate', event.shiftKey)
    return
  }
  if ((event.key === 'c' || event.key === 'C') && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && actionList.value.includes('copy')) {
    event.preventDefault()
    runAction('copy')
    return
  }
  if (gestures.onKey(event)) {
    event.preventDefault()
    return
  }
  // Nothing in the dialog scrolls, so these would scroll the page behind it; a button keeps
  // its Space.
  const onButton = event.target instanceof Element && event.target.closest('button') !== null
  if (PAGE_KEYS.has(event.key) && !(onButton && event.key === ' ') && plain)
    event.preventDefault()
}

// Safari's trackpad pinch: no template binding exists for these events.
watch(overlayRef, (root, old) => {
  old?.removeEventListener('gesturestart', gestures.onGestureStart)
  old?.removeEventListener('gesturechange', gestures.onGestureChange)
  old?.removeEventListener('gestureend', gestures.onGestureEnd)
  root?.addEventListener('gesturestart', gestures.onGestureStart)
  root?.addEventListener('gesturechange', gestures.onGestureChange)
  root?.addEventListener('gestureend', gestures.onGestureEnd)
}, { flush: 'post' })

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})

defineExpose({
  /** Opens the preview, at `index` when given. */
  show(at?: number): void {
    if (typeof at === 'number')
      setCurrent(clampIndex(at))
    open.value = true
  },
  /** Closes the preview without emitting `close`, which reports the person closing it. */
  close(): void {
    open.value = false
  },
  next: () => step(1),
  prev: () => step(-1),
  zoomIn,
  zoomOut,
  /** Back to the whole picture. */
  reset: resetZoom,
  /** Turns the picture a quarter clockwise, or back with `-1`, without emitting `action`. */
  rotate: (direction: 1 | -1 = 1): void => gestures.rotate(direction),
})
</script>

<template>
  <!-- The condition sits on the Teleport: a host that empties <body> under an open preview leaves
       its root without a parent, and swapping that root for the v-if's placeholder would throw. -->
  <Teleport v-if="rendered" to="body">
    <div
      ref="overlayRef"
      class="tx-image-preview"
      :class="overlayClass"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      :aria-label="dialogLabel"
      :aria-hidden="closing || undefined"
      :inert="closing || undefined"
      :style="overlayStyle"
      @pointerdown.capture="settleOpen"
      @mousedown="onMouseDown"
      @wheel="gestures.onWheel"
      @contextmenu="onContextMenu"
    >
      <TxBaseSurface class="tx-image-preview__backdrop tx-image-preview__surface" fake v-bind="maskMaterial" aria-hidden="true" />

      <div
        ref="stageRef"
        class="tx-image-preview__stage"
        @pointerdown="gestures.onPointerDown"
        @pointermove="gestures.onPointerMove"
        @pointerup="gestures.onPointerUp"
        @pointercancel="gestures.onPointerCancel"
        @lostpointercapture="gestures.onLostPointerCapture"
        @click="gestures.onClick"
        @dragstart.prevent
      >
        <div ref="fitRef" class="tx-image-preview__fit" aria-hidden="true" />
        <ImagePreviewSlide
          v-for="slide in drawnSlides"
          :key="slide.key"
          :slide="slide"
          :box-style="boxStyle"
          :failed-text="failedText"
          :bind="bindImage"
          @load="onImageLoad"
          @error="onImageError($event, slide.index)"
        />
      </div>

      <div class="tx-image-preview__bar tx-image-preview__chrome">
        <div class="tx-image-preview__heading tx-image-preview__part" aria-live="polite" aria-atomic="true">
          <span v-if="currentItem?.name" class="tx-image-preview__name">{{ currentItem.name }}</span>
          <span v-if="count > 1" class="tx-image-preview__counter">{{ counterText }}</span>
        </div>
        <button type="button" class="tx-image-preview__button" :aria-label="closeLabel" @click="requestClose()">
          <TxBaseSurface class="tx-image-preview__surface tx-image-preview__control-surface" tag="span" fake v-bind="controlMaterial" />
          <ImagePreviewIcon :paths="PREVIEW_ICONS.close" />
        </button>
      </div>

      <button
        v-if="count > 1"
        type="button"
        class="tx-image-preview__button tx-image-preview__nav tx-image-preview__chrome is-previous"
        :aria-label="previousLabel"
        :aria-disabled="current <= 0 || undefined"
        @click="step(-1)"
      >
        <TxBaseSurface class="tx-image-preview__surface tx-image-preview__control-surface" tag="span" fake v-bind="controlMaterial" />
        <ImagePreviewIcon :paths="PREVIEW_ICONS.previous" />
      </button>

      <ImagePreviewStrip
        v-if="indicator !== 'none'"
        :kind="indicator"
        :items="items"
        :current="current"
        :position="stripPosition"
        :sizes="sizes"
        :failed="isFailed"
        :label="indicatorLabel"
        :formatter="indicatorItemFormatter"
        :material="controlMaterial"
        @show="showAt"
        @step="stepFromStrip"
      />

      <ImagePreviewToolbar
        ref="toolbarRef"
        :scale="gestures.view.value?.k"
        :presets="gestures.presets.value"
        :formatter="scaleFormatter"
        :label="zoomLabel"
        :label-formatter="readoutLabelFormatter"
        :reset-label="resetLabel"
        :zoom-in-label="zoomInLabel"
        :zoom-out-label="zoomOutLabel"
        :can-zoom-in="canZoomIn"
        :can-zoom-out="canZoomOut"
        :actions="actionList"
        :action-label="actionLabel"
        :action-disabled="actionDisabled"
        :material="controlMaterial"
        :level="transition.level"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @zoom-to="gestures.zoomTo"
        @reset="resetZoom"
        @action="runAction"
      />

      <ImagePreviewMinimap
        v-if="minimapShown && (minimapWanted || minimapLevel > 0)"
        v-bind="minimapShown"
        :shown="minimapWanted"
        :material="controlMaterial"
        @look="gestures.lookAt"
        @drag="minimapDragging = $event"
        @wheel="onMinimapWheel"
      />

      <button
        v-if="count > 1"
        type="button"
        class="tx-image-preview__button tx-image-preview__nav tx-image-preview__chrome is-next"
        :aria-label="nextLabel"
        :aria-disabled="current >= count - 1 || undefined"
        @click="step(1)"
      >
        <TxBaseSurface class="tx-image-preview__surface tx-image-preview__control-surface" tag="span" fake v-bind="controlMaterial" />
        <ImagePreviewIcon :paths="PREVIEW_ICONS.next" />
      </button>

      <div class="tx-image-preview__status" role="status" aria-live="polite" aria-atomic="true">
        <div v-if="statusText" class="tx-image-preview__status-pill">
          <TxBaseSurface class="tx-image-preview__surface tx-image-preview__control-surface" fake v-bind="controlMaterial" />
          <span class="tx-image-preview__status-text tx-image-preview__part">{{ statusText }}</span>
        </div>
      </div>

      <ImagePreviewMenu
        ref="actionMenu"
        :open="menuOpen"
        :armed="menuArmed"
        :level="menuLevel"
        :label="menuLabel"
        :items="menuItems"
        :place="menuPlace"
        :material="controlMaterial"
        @choose="chooseFromMenu"
        @close="closeMenu(true)"
      />
    </div>
  </Teleport>
</template>

<style lang="scss">
@use '../../../style/mixins.scss' as *;
@use './preview-shared' as *;

// Teleported to <body>, so nothing here may be nested in a host's class. Always dark, as a
// photo viewer is, whatever the page's theme. Each part styles its own pieces; what they share
// is here.

// A part fades with its container's level (`--tx-image-preview-level`, 0 to 1), from nothing up
// to the opacity it has at rest: its animation is held that far through, and at 1 is over and
// leaves the part be. Only parts fade, never what holds them: an ancestor with an opacity is a
// backdrop root, and every material inside it would blur nothing but that ancestor's own paint.
@keyframes tx-image-preview-part {
  from {
    opacity: 0;
  }
}

@mixin tx-image-preview-part {
  animation: tx-image-preview-part 1s linear paused;
  animation-delay: calc(var(--tx-image-preview-level, 1) * -1s);
}

.tx-image-preview {
  --tx-image-preview-ink: rgba(255, 255, 255, 0.94);
  --tx-image-preview-ink-muted: rgba(255, 255, 255, 0.6);
  --tx-image-preview-ink-disabled: rgba(255, 255, 255, 0.32);
  --tx-image-preview-tint-hover: rgba(255, 255, 255, 0.1);
  --tx-image-preview-tint-active: rgba(255, 255, 255, 0.18);
  // The wash the materials lay over what they blur: dark here, whatever the page's theme.
  --tx-bg-color-overlay: rgb(28, 28, 32);

  position: fixed;
  inset: 0;
  overflow: hidden;
  outline: none;
  color: var(--tx-image-preview-ink);
  font-size: 13px;
  // The preview owns every touch: no page pan, no pinch zoom, no double-tap zoom behind it.
  touch-action: none;
  overscroll-behavior: contain;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}

// iOS Safari's fixed `inset: 0` follows the largest viewport, so the toolbar slid under the
// browser's own; the dynamic viewport is the part actually showing.
@supports (height: 100dvh) {
  .tx-image-preview {
    bottom: auto;
    height: 100dvh;
  }
}

// -- Levels: each container hands its parts the level they fade with.

.tx-image-preview__backdrop {
  --tx-image-preview-level: var(--tx-image-preview-mask, 1);
}

.tx-image-preview__chrome {
  --tx-image-preview-level: var(--tx-image-preview-chrome, 1);
}

.tx-image-preview__status {
  --tx-image-preview-level: var(--tx-image-preview-status, 1);
}

.tx-image-preview__part,
.tx-image-preview__icon,
.tx-image-preview__bar::before,
.tx-image-preview__button::after,
.tx-image-preview__menu-item::after,
.tx-image-preview__surface::before,
.tx-image-preview__surface > .tx-base-surface__layer {
  @include tx-image-preview-part;
}

// A high-contrast surface is one solid fill with no material to blind, and fades whole.
.tx-image-preview__surface {
  @include tx-when-high-contrast {
    @include tx-image-preview-part;
  }
}

// -- Materials. The mask behind the picture, and each control's, fill their holder from behind.

.tx-image-preview__backdrop.tx-image-preview__backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: 0;
}

.tx-image-preview__control-surface.tx-image-preview__control-surface {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
}

// -- The stage. Its pages are ImagePreviewSlide's.

.tx-image-preview__stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  opacity: var(--tx-image-preview-stage, 1);
  transform: scale(calc(0.96 + 0.04 * var(--tx-image-preview-stage, 1)));
}

// Where a whole picture fits: clear of the top bar, the side buttons, the strip and the toolbar.
.tx-image-preview__fit {
  position: absolute;
  inset: 64px 88px 96px;
  visibility: hidden;
  pointer-events: none;
}

.tx-image-preview.is-single .tx-image-preview__fit {
  right: 24px;
  left: 24px;
}

.tx-image-preview.has-thumbnails .tx-image-preview__fit {
  bottom: 144px;
}

.tx-image-preview.has-dots .tx-image-preview__fit {
  bottom: 120px;
}

.tx-image-preview.is-grabbing .tx-image-preview__stage {
  cursor: grabbing;
}

// -- Chrome. Hidden, it lets the pointer through to the picture as it fades, and once gone it
// leaves the tab order.

.tx-image-preview.is-chrome-hidden .tx-image-preview__chrome,
.tx-image-preview.is-chrome-hidden .tx-image-preview__chrome * {
  pointer-events: none;
}

.tx-image-preview.is-chrome-off .tx-image-preview__chrome {
  visibility: hidden;
}

.tx-image-preview__bar {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  gap: 12px;
  align-items: center;
  padding: calc(12px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) 12px calc(20px + env(safe-area-inset-left));
  // Drags that start beside the title reach the stage; only the controls catch the pointer.
  pointer-events: none;

  // A scrim for when a zoomed picture runs under the title.
  &::before {
    position: absolute;
    inset: 0 0 -28px;
    background: linear-gradient(rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0));
    content: '';
  }
}

.tx-image-preview__heading {
  position: relative;
  display: flex;
  flex: 1;
  gap: 10px;
  align-items: baseline;
  min-width: 0;
}

.tx-image-preview__name {
  overflow: hidden;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-image-preview__counter {
  flex-shrink: 0;
  color: var(--tx-image-preview-ink-muted);
  font-variant-numeric: tabular-nums;
}

.tx-image-preview__button {
  position: relative;
  isolation: isolate;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 999px;
  color: inherit;
  font: inherit;
  background: none;
  cursor: pointer;
  pointer-events: auto;
  transition:
    color 0.15s ease,
    transform 0.15s ease;

  // The tint a hover or a press lays over the material.
  &::after {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    background-color: transparent;
    content: '';
    pointer-events: none;
    transition: background-color 0.15s ease;
  }

  &:hover::after {
    background-color: var(--tx-image-preview-tint-hover);
  }

  &:active {
    transform: scale(0.94);
  }

  &:active::after {
    background-color: var(--tx-image-preview-tint-active);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-image-preview-ink);
    outline-offset: 2px;
  }

  // Dimmed by its ink alone: an opacity of the button's own would blind the material inside it.
  &[aria-disabled='true'] {
    color: var(--tx-image-preview-ink-disabled);
    cursor: default;
    transform: none;

    &::after {
      background-color: transparent;
    }
  }

  @include tx-when-high-contrast {
    box-shadow: inset 0 0 0 1px var(--tx-image-preview-ink);
  }
}

.tx-image-preview__nav {
  position: absolute;
  top: 50%;
  width: 48px;
  height: 48px;
  margin-top: -24px;

  &.is-previous {
    left: calc(20px + env(safe-area-inset-left));
  }

  &.is-next {
    right: calc(20px + env(safe-area-inset-right));
  }
}

// -- The status.

.tx-image-preview__status {
  position: absolute;
  top: calc(64px + env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
}

.tx-image-preview__status-pill {
  position: relative;
  isolation: isolate;
  padding: 8px 16px;
  border-radius: 999px;
  white-space: nowrap;
}

.tx-image-preview__status-text {
  position: relative;
  z-index: 1;
}

// -- Phones (see preview-shared): the picture takes the whole screen, under the chrome.
@media #{$tx-image-preview-phone} {
  .tx-image-preview__fit,
  .tx-image-preview.is-single .tx-image-preview__fit,
  .tx-image-preview.has-thumbnails .tx-image-preview__fit,
  .tx-image-preview.has-dots .tx-image-preview__fit {
    inset: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  }

  .tx-image-preview__bar {
    padding: calc(6px + env(safe-area-inset-top)) calc(8px + env(safe-area-inset-right)) 6px calc(16px + env(safe-area-inset-left));

    .tx-image-preview__button {
      width: 44px;
      height: 44px;
    }
  }

  .tx-image-preview__nav {
    top: auto;
    bottom: calc(12px + env(safe-area-inset-bottom));
    width: 44px;
    height: 44px;
    margin-top: 0;

    &.is-previous {
      left: calc(12px + env(safe-area-inset-left));
    }

    &.is-next {
      right: calc(12px + env(safe-area-inset-right));
    }
  }

  .tx-image-preview.has-strip .tx-image-preview__nav {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-image-preview__stage {
    transform: none;
  }
}
</style>
