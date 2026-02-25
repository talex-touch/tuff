<script lang="ts">
const STACK_MATCH_PIXEL_THRESHOLD = 8
const STACK_MATCH_RATIO_THRESHOLD = 0.05
const STACK_LAYER_OFFSET_Y = -18
const STACK_LAYER_SCALE_STEP = 0.05
const STACK_LAYER_MAX_DEPTH = 3
const STACK_OPACITY_BY_DEPTH = [1, 0.92, 0.78, 0.62, 0.38, 0.16, 0] as const
const STACK_STATE_EPSILON = 0.001

interface FlipOverlayStackEntry {
  id: string
  zIndex: number
  openSequence: number
  width: number
  height: number
  visible: boolean
  globalMask: boolean
  maskClass: string
}

const overlayStackRegistry = new Map<string, FlipOverlayStackEntry>()
const overlayStackSubscribers = new Set<() => void>()
let overlayStackVersion = 0
let overlayInstanceSeed = 0
let overlayOpenSequenceSeed = 0
let sharedGlobalMaskElement: HTMLDivElement | null = null

function canUseDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function resolveVisibleStackBounds(entries: FlipOverlayStackEntry[]): { minZIndex: number, topEntry: FlipOverlayStackEntry } | null {
  if (entries.length === 0)
    return null

  let minZIndex = entries[0]!.zIndex
  for (const entry of entries) {
    if (entry.zIndex < minZIndex)
      minZIndex = entry.zIndex
  }

  return {
    minZIndex,
    topEntry: entries[entries.length - 1]!,
  }
}

function removeSharedGlobalMaskElement(): void {
  if (!sharedGlobalMaskElement)
    return
  sharedGlobalMaskElement.remove()
  sharedGlobalMaskElement = null
}

function ensureSharedGlobalMaskElement(): HTMLDivElement | null {
  if (!canUseDom())
    return null

  if (!sharedGlobalMaskElement) {
    sharedGlobalMaskElement = document.createElement('div')
    sharedGlobalMaskElement.className = 'TxFlipOverlay-GlobalMask'
    document.body.appendChild(sharedGlobalMaskElement)
  }

  return sharedGlobalMaskElement
}

function applySharedGlobalMaskState(): void {
  if (!canUseDom())
    return

  const visibleEntries = getVisibleOverlayStackEntries()
  const bounds = resolveVisibleStackBounds(visibleEntries)

  // Single overlay keeps its local mask behavior for backward-compatible visuals/transitions.
  if (!bounds || visibleEntries.length <= 1 || !bounds.topEntry.globalMask) {
    removeSharedGlobalMaskElement()
    return
  }

  const maskElement = ensureSharedGlobalMaskElement()
  if (!maskElement)
    return

  maskElement.className = 'TxFlipOverlay-GlobalMask'
  maskElement.style.zIndex = String(Math.max(0, bounds.minZIndex - 1))
  maskElement.style.opacity = '1'
}

function markOverlayStackChanged(): void {
  overlayStackVersion += 1
  applySharedGlobalMaskState()
  overlayStackSubscribers.forEach((listener) => {
    try {
      listener()
    }
    catch {
      // ignore subscriber errors
    }
  })
}

function subscribeOverlayStackChanged(listener: () => void): () => void {
  overlayStackSubscribers.add(listener)
  return () => overlayStackSubscribers.delete(listener)
}

function getOverlayStackVersion(): number {
  return overlayStackVersion
}

function getVisibleOverlayStackEntries(): FlipOverlayStackEntry[] {
  return Array
    .from(overlayStackRegistry.values())
    .filter(entry => entry.visible)
    .sort((a, b) => {
      if (a.zIndex !== b.zIndex)
        return a.zIndex - b.zIndex
      return a.openSequence - b.openSequence
    })
}

function isOverlaySizeMatched(current: FlipOverlayStackEntry, above: FlipOverlayStackEntry): boolean {
  const widthDelta = Math.abs(current.width - above.width)
  const heightDelta = Math.abs(current.height - above.height)
  const widthTolerance = Math.max(STACK_MATCH_PIXEL_THRESHOLD, above.width * STACK_MATCH_RATIO_THRESHOLD)
  const heightTolerance = Math.max(STACK_MATCH_PIXEL_THRESHOLD, above.height * STACK_MATCH_RATIO_THRESHOLD)
  return widthDelta <= widthTolerance && heightDelta <= heightTolerance
}

function resolveStackOpacity(depth: number): number {
  if (depth < 0)
    return 1
  if (depth >= STACK_OPACITY_BY_DEPTH.length)
    return 0
  return STACK_OPACITY_BY_DEPTH[depth] ?? 0
}

function nextOverlayInstanceId(): string {
  overlayInstanceSeed += 1
  return `tx-flip-overlay-${overlayInstanceSeed}`
}

function nextOverlayOpenSequence(): number {
  overlayOpenSequenceSeed += 1
  return overlayOpenSequenceSeed
}
</script>

<script setup lang="ts">
import type { BaseSurfaceMode } from '../../base-surface/src/types'
import type { FlipOverlayEmits, FlipOverlayProps, FlipOverlaySlotProps } from './types'
import TxButton from '../../button/src/button.vue'
import gsap from 'gsap'
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from 'vue'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import { hasWindow } from '../../../../utils/env'
import { getZIndex, nextZIndex } from '../../../../utils/z-index-manager'

defineOptions({
  name: 'TxFlipOverlay',
})

const props = withDefaults(defineProps<FlipOverlayProps>(), {
  modelValue: false,
  source: null,
  sourceRadius: null,
  duration: 480,
  rotateX: 6,
  rotateY: 8,
  tiltRange: 2,
  perspective: 1200,
  speedBoost: 1.12,
  speedBoostAt: 0.7,
  easeOut: 'back.out(1.25)',
  easeIn: 'back.in(1)',
  maskClosable: true,
  preventAccidentalClose: false,
  transitionName: 'TxFlipOverlay-Mask',
  maskClass: '',
  cardClass: '',
  globalMask: true,
  border: 'solid',
  surface: 'refraction',
  surfaceColor: '',
  surfaceOpacity: 0.96,
  header: true,
  headerTitle: '',
  headerDesc: '',
  closable: true,
  closeAriaLabel: 'Close',
  scrollable: true,
  randomTilt: true,
})

const emit = defineEmits<FlipOverlayEmits>()
const slots = useSlots()
const instanceId = nextOverlayInstanceId()

const cardRef = ref<HTMLElement | null>(null)
const visible = ref(Boolean(props.modelValue))
const expanded = ref(typeof props.expanded === 'boolean' ? props.expanded : false)
const animating = ref(typeof props.animating === 'boolean' ? props.animating : false)
const zIndex = ref(getZIndex())
const sourceRect = ref<DOMRect | null>(null)
const sourceRadius = ref<string | null>(null)
const tilt = ref({ x: 0, y: 0 })
const blockedCloseWarning = ref(false)
const openSequence = ref(0)
const localStackVersion = ref(getOverlayStackVersion())
const unsubscribeStackChange = hasWindow()
  ? subscribeOverlayStackChanged(() => {
      localStackVersion.value += 1
    })
  : () => {}
let tween: gsap.core.Tween | null = null
let stackTween: gsap.core.Tween | null = null
let appliedStackState: { y: number, scale: number, opacity: number } | null = null
let runId = 0
let blockedCloseTimer: ReturnType<typeof setTimeout> | null = null
let pageExitGuardBound = false

const stackMeta = computed(() => {
  localStackVersion.value

  if (!visible.value) {
    return {
      depth: 0,
      stackSize: 0,
      isMaskOwner: true,
      isLayered: false,
      isDepthHidden: false,
      translateY: 0,
      scale: 1,
      opacity: 1,
    }
  }

  const stackEntries = getVisibleOverlayStackEntries()
  const selfIndex = stackEntries.findIndex(entry => entry.id === instanceId)

  if (selfIndex < 0) {
    return {
      depth: 0,
      stackSize: stackEntries.length,
      isMaskOwner: true,
      isLayered: false,
      isDepthHidden: false,
      translateY: 0,
      scale: 1,
      opacity: 1,
    }
  }

  const topIndex = stackEntries.length - 1
  const depth = topIndex - selfIndex
  const selfEntry = stackEntries[selfIndex]
  const aboveEntry = depth > 0 ? stackEntries[selfIndex + 1] : undefined
  let isLayered = false
  if (selfEntry && aboveEntry) {
    const isSizeReady = selfEntry.width > 0
      && selfEntry.height > 0
      && aboveEntry.width > 0
      && aboveEntry.height > 0
    isLayered = !isSizeReady || isOverlaySizeMatched(selfEntry, aboveEntry)
  }
  const layeredDepth = isLayered ? Math.min(depth, STACK_LAYER_MAX_DEPTH) : 0
  const scale = Math.max(0, 1 - STACK_LAYER_SCALE_STEP * layeredDepth)
  const opacity = resolveStackOpacity(depth)

  return {
    depth,
    stackSize: stackEntries.length,
    isMaskOwner: depth === 0,
    isLayered,
    isDepthHidden: opacity <= 0,
    translateY: STACK_LAYER_OFFSET_Y * layeredDepth,
    scale,
    opacity,
  }
})

const maskClassName = computed(() => {
  const classes = ['TxFlipOverlay-Mask']
  if (props.maskClass) {
    const customMaskClasses = props.maskClass
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean)
    classes.push(...customMaskClasses)
  }
  if (!stackMeta.value.isMaskOwner)
    classes.push('is-stack-underlay-mask')
  if (blockedCloseWarning.value)
    classes.push('is-close-guard-warning')
  if (props.maskClass)
    classes.push(props.maskClass)
  return classes
})

const cardClassName = computed(() => {
  let borderStyle: 'solid' | 'dashed' | 'none' = 'solid'
  if (props.border === 'none') {
    borderStyle = 'none'
  }
  else if (props.border === 'dashed' || props.border === 'dash') {
    borderStyle = 'dashed'
  }

  const classes: Array<string | Record<string, boolean>> = [
    'TxFlipOverlay-Card',
    `is-border-${borderStyle}`,
    {
      'is-expanded': expanded.value,
      'is-close-guard-warning': blockedCloseWarning.value,
      'is-stack-layered': stackMeta.value.isLayered,
      'is-stack-depth-hidden': stackMeta.value.isDepthHidden,
    },
  ]
  if (props.cardClass)
    classes.push(props.cardClass)
  return classes
})

const bodyClassName = computed(() => {
  const classes: Array<string | Record<string, boolean>> = [
    'TxFlipOverlay-Body',
    'TxFlipOverlay-Content',
    { 'is-scrollable': props.scrollable },
  ]
  return classes
})

const shellClassName = computed(() => {
  const classes: Array<string | Record<string, boolean>> = [
    'TxFlipOverlay-Shell',
    { 'is-close-guard-focus': blockedCloseWarning.value },
  ]
  return classes
})

const maskStyle = computed(() => {
  const style: Record<string, number | string> = {
    zIndex: zIndex.value,
    pointerEvents: stackMeta.value.isMaskOwner ? 'auto' : 'none',
  }

  const usesSharedStackMask = props.globalMask && stackMeta.value.stackSize > 1
  if (usesSharedStackMask || !stackMeta.value.isMaskOwner) {
    style.background = 'transparent'
    style.backdropFilter = 'none'
    style.WebkitBackdropFilter = 'none'
  }

  return style
})

const surfaceMode = computed<BaseSurfaceMode>(() => {
  if (props.surface === 'pure'
    || props.surface === 'mask'
    || props.surface === 'blur'
    || props.surface === 'glass'
    || props.surface === 'refraction') {
    return props.surface
  }
  return 'mask'
})

const surfaceColor = computed(() => {
  if (props.surfaceColor)
    return props.surfaceColor
  return 'var(--tx-bg-color-overlay, var(--tx-card-fake-background, #fff))'
})

const surfaceOpacity = computed(() => {
  const value = typeof props.surfaceOpacity === 'number' ? props.surfaceOpacity : 0.96
  if (!Number.isFinite(value))
    return 0.96
  return Math.max(0, Math.min(1, value))
})

const bodyLockCountKey = 'txFlipOverlayLockCount'
const bodyLockOverflowKey = 'txFlipOverlayLockOverflow'
const bodyLockPaddingKey = 'txFlipOverlayLockPaddingRight'

const transitionName = computed(() => props.transitionName || 'TxFlipOverlay-Mask')
const useMaskCssTransition = computed(() => {
  if (!visible.value)
    return true
  // Keep mask brightness stable while handing off ownership in stacked state.
  if (stackMeta.value.isMaskOwner && stackMeta.value.stackSize > 1)
    return false
  return true
})
const hasCustomHeaderSlot = computed(() => Boolean(slots.header))
const hasHeaderDisplaySlot = computed(() => Boolean(slots['header-display']))
const hasHeaderActionsSlot = computed(() => Boolean(slots['header-actions']))
const hasHeaderContent = computed(() => Boolean(props.headerTitle || props.headerDesc))
const shouldRenderBuiltInHeader = computed(() => {
  if (hasCustomHeaderSlot.value || !props.header)
    return false
  if (props.closable)
    return true
  return hasHeaderDisplaySlot.value || hasHeaderActionsSlot.value || hasHeaderContent.value
})

function syncExpanded(value: boolean): void {
  if (expanded.value === value)
    return
  expanded.value = value
}

function syncAnimating(value: boolean): void {
  if (animating.value === value)
    return
  animating.value = value
}

function clearBlockedCloseWarning(): void {
  if (blockedCloseTimer) {
    clearTimeout(blockedCloseTimer)
    blockedCloseTimer = null
  }
  blockedCloseWarning.value = false
}

function triggerBlockedCloseWarning(): void {
  if (!visible.value || !props.preventAccidentalClose)
    return

  if (blockedCloseTimer) {
    clearTimeout(blockedCloseTimer)
    blockedCloseTimer = null
  }

  blockedCloseWarning.value = false
  if (hasWindow())
    void cardRef.value?.offsetWidth
  blockedCloseWarning.value = true

  blockedCloseTimer = setTimeout(() => {
    blockedCloseWarning.value = false
    blockedCloseTimer = null
  }, 720)
}

watch(
  () => props.expanded,
  (value) => {
    if (typeof value === 'boolean')
      syncExpanded(value)
  },
)

watch(
  () => props.animating,
  (value) => {
    if (typeof value === 'boolean')
      syncAnimating(value)
  },
)

watch(expanded, value => emit('update:expanded', value))
watch(animating, value => emit('update:animating', value))
const bodyScrollLocked = ref(false)

function clearTween(): void {
  if (!tween)
    return
  tween.kill()
  tween = null
}

function clearStackTween(): void {
  if (!stackTween)
    return
  stackTween.kill()
  stackTween = null
}

function isSameStackState(
  current: { y: number, scale: number, opacity: number } | null,
  next: { y: number, scale: number, opacity: number },
): boolean {
  if (!current)
    return false

  return Math.abs(current.y - next.y) <= STACK_STATE_EPSILON
    && Math.abs(current.scale - next.scale) <= STACK_STATE_EPSILON
    && Math.abs(current.opacity - next.opacity) <= STACK_STATE_EPSILON
}

function resolveCardSize(card: HTMLElement | null): { width: number, height: number } {
  if (!card)
    return { width: 0, height: 0 }

  const widthByOffset = card.offsetWidth || 0
  const heightByOffset = card.offsetHeight || 0

  if (widthByOffset > 0 && heightByOffset > 0) {
    return {
      width: widthByOffset,
      height: heightByOffset,
    }
  }

  let widthByStyle = 0
  let heightByStyle = 0
  if (hasWindow()) {
    const cardStyles = getComputedStyle(card)
    widthByStyle = Number.parseFloat(cardStyles.width) || 0
    heightByStyle = Number.parseFloat(cardStyles.height) || 0
  }

  if (widthByStyle > 0 && heightByStyle > 0) {
    return {
      width: widthByStyle,
      height: heightByStyle,
    }
  }

  const rect = card.getBoundingClientRect()
  return {
    width: rect.width || 0,
    height: rect.height || 0,
  }
}

function upsertStackEntry(): void {
  if (!hasWindow()) {
    return
  }

  if (!visible.value) {
    removeStackEntry()
    return
  }

  const size = resolveCardSize(cardRef.value)
  const nextEntry: FlipOverlayStackEntry = {
    id: instanceId,
    zIndex: zIndex.value,
    openSequence: openSequence.value,
    width: size.width,
    height: size.height,
    visible: true,
    globalMask: props.globalMask,
    maskClass: props.maskClass,
  }

  const previousEntry = overlayStackRegistry.get(instanceId)
  if (previousEntry
    && previousEntry.zIndex === nextEntry.zIndex
    && previousEntry.openSequence === nextEntry.openSequence
    && previousEntry.width === nextEntry.width
    && previousEntry.height === nextEntry.height
    && previousEntry.visible === nextEntry.visible
    && previousEntry.globalMask === nextEntry.globalMask
    && previousEntry.maskClass === nextEntry.maskClass) {
    return
  }

  overlayStackRegistry.set(instanceId, nextEntry)
  markOverlayStackChanged()
}

function removeStackEntry(): void {
  if (!overlayStackRegistry.has(instanceId))
    return

  overlayStackRegistry.delete(instanceId)
  markOverlayStackChanged()
}

function applyStackCardState(forceImmediate = false): void {
  const card = cardRef.value
  if (!card)
    return

  if (!visible.value || !expanded.value || animating.value) {
    clearStackTween()
    appliedStackState = null
    return
  }

  const { translateY, scale, opacity } = stackMeta.value
  const nextState = {
    y: translateY,
    scale,
    opacity,
  }

  if (!forceImmediate && isSameStackState(appliedStackState, nextState))
    return

  clearStackTween()

  if (forceImmediate || stackMeta.value.depth === 0) {
    gsap.set(card, {
      y: translateY,
      scaleX: scale,
      scaleY: scale,
      opacity,
    })
    appliedStackState = nextState
    return
  }

  appliedStackState = nextState
  stackTween = gsap.to(card, {
    y: translateY,
    scaleX: scale,
    scaleY: scale,
    opacity,
    duration: 0.26,
    ease: 'power2.out',
    overwrite: 'auto',
    onComplete: () => {
      stackTween = null
    },
  })
}

function lockBodyScroll(): void {
  if (!hasWindow())
    return

  const body = window.document.body
  if (!body)
    return

  const currentCount = Number.parseInt(body.dataset[bodyLockCountKey] || '0', 10)

  if (currentCount === 0) {
    body.dataset[bodyLockOverflowKey] = body.style.overflow || ''
    body.dataset[bodyLockPaddingKey] = body.style.paddingRight || ''

    const scrollbarWidth = window.innerWidth - window.document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbarWidth > 0)
      body.style.paddingRight = `${scrollbarWidth}px`
  }

  body.dataset[bodyLockCountKey] = String(currentCount + 1)
}

function unlockBodyScroll(): void {
  if (!hasWindow())
    return

  const body = window.document.body
  if (!body)
    return

  const currentCount = Number.parseInt(body.dataset[bodyLockCountKey] || '0', 10)
  if (currentCount <= 0)
    return

  const nextCount = currentCount - 1
  if (nextCount === 0) {
    body.style.overflow = body.dataset[bodyLockOverflowKey] || ''
    body.style.paddingRight = body.dataset[bodyLockPaddingKey] || ''
    delete body.dataset[bodyLockCountKey]
    delete body.dataset[bodyLockOverflowKey]
    delete body.dataset[bodyLockPaddingKey]
    return
  }

  body.dataset[bodyLockCountKey] = String(nextCount)
}

function resolveSource(): void {
  if (!hasWindow()) {
    sourceRect.value = null
    sourceRadius.value = null
    return
  }

  const source = props.source
  if (!source) {
    sourceRect.value = null
    sourceRadius.value = props.sourceRadius ?? null
    return
  }

  if (source instanceof HTMLElement) {
    sourceRect.value = source.getBoundingClientRect()
    sourceRadius.value = props.sourceRadius ?? getComputedStyle(source).borderRadius
    return
  }

  sourceRect.value = source
  sourceRadius.value = props.sourceRadius ?? null
}

function resolveTilt(): void {
  if (!props.randomTilt) {
    tilt.value = { x: 0, y: 0 }
    return
  }
  const tiltX = (Math.random() > 0.5 ? 1 : -1) * (props.rotateX + Math.random() * props.tiltRange)
  const tiltY = (Math.random() > 0.5 ? 1 : -1) * (props.rotateY + Math.random() * props.tiltRange)
  tilt.value = { x: tiltX, y: tiltY }
}

function applySpeedBoost(): void {
  if (!tween)
    return
  if (tween.progress() > props.speedBoostAt)
    tween.timeScale(props.speedBoost)
}

function startOpenAnimation(currentRunId: number): void {
  const card = cardRef.value
  const from = sourceRect.value
  if (!card || !hasWindow()) {
    syncExpanded(true)
    syncAnimating(false)
    emit('opened')
    return
  }

  if (!from) {
    const visibleStackCount = getVisibleOverlayStackEntries().length
    const isStackPushOpen = visibleStackCount > 1

    if (isStackPushOpen) {
      clearTween()
      clearStackTween()
      syncAnimating(true)
      gsap.set(card, {
        autoAlpha: 0,
        xPercent: -50,
        yPercent: -50,
        x: 0,
        y: 10,
        scaleX: 0.985,
        scaleY: 0.985,
      })
      syncExpanded(true)
      tween = gsap.to(card, {
        autoAlpha: 1,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        duration: 0.22,
        ease: 'power2.out',
        overwrite: true,
        onComplete: () => {
          if (currentRunId !== runId)
            return
          syncAnimating(false)
          tween = null
          emit('opened')
        },
      })
      return
    }

    gsap.set(card, {
      autoAlpha: 1,
      xPercent: -50,
      yPercent: -50,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
    })
    syncExpanded(true)
    syncAnimating(false)
    emit('opened')
    return
  }

  const fromCenterX = from.left + from.width / 2
  const fromCenterY = from.top + from.height / 2
  const viewportCenterX = window.innerWidth / 2
  const viewportCenterY = window.innerHeight / 2
  const translateX = fromCenterX - viewportCenterX
  const translateY = fromCenterY - viewportCenterY
  const to = card.getBoundingClientRect()
  const scaleX = from.width / to.width
  const scaleY = from.height / to.height
  const targetRadius = getComputedStyle(card).borderRadius
  const initialRadius = sourceRadius.value || targetRadius
  const tiltValue = tilt.value

  clearTween()
  clearStackTween()
  syncAnimating(true)
  gsap.set(card, {
    xPercent: -50,
    yPercent: -50,
    x: translateX,
    y: translateY,
    scaleX,
    scaleY,
    rotateX: tiltValue.x,
    rotateY: tiltValue.y,
    transformPerspective: props.perspective,
    borderRadius: initialRadius,
    autoAlpha: 1,
  })
  syncExpanded(true)
  tween = gsap.to(card, {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotateX: 0,
    rotateY: 0,
    borderRadius: targetRadius,
    duration: props.duration / 1000,
    ease: props.easeOut,
    overwrite: true,
    onUpdate: applySpeedBoost,
    onComplete: () => {
      if (currentRunId !== runId)
        return
      syncAnimating(false)
      tween = null
      emit('opened')
    },
  })
  tween.timeScale(1)
}

function startCloseAnimation(currentRunId: number): void {
  const card = cardRef.value
  const from = sourceRect.value
  if (!card || !hasWindow() || !from) {
    visible.value = false
    syncAnimating(false)
    removeStackEntry()
    if (props.modelValue)
      emit('update:modelValue', false)
    emit('closed')
    return
  }

  const fromCenterX = from.left + from.width / 2
  const fromCenterY = from.top + from.height / 2
  const viewportCenterX = window.innerWidth / 2
  const viewportCenterY = window.innerHeight / 2
  const translateX = fromCenterX - viewportCenterX
  const translateY = fromCenterY - viewportCenterY
  const to = card.getBoundingClientRect()
  const scaleX = from.width / to.width
  const scaleY = from.height / to.height
  const tiltValue = tilt.value

  clearTween()
  clearStackTween()
  syncAnimating(true)
  tween = gsap.to(card, {
    x: translateX,
    y: translateY,
    scaleX,
    scaleY,
    rotateX: tiltValue.x,
    rotateY: tiltValue.y,
    borderRadius: sourceRadius.value || getComputedStyle(card).borderRadius,
    duration: props.duration / 1000,
    ease: props.easeIn,
    overwrite: true,
    onUpdate: applySpeedBoost,
    onComplete: () => {
      if (currentRunId !== runId)
        return
      visible.value = false
      syncAnimating(false)
      removeStackEntry()
      tween = null
      emit('update:modelValue', false)
      emit('closed')
    },
  })
  tween.timeScale(1)
}

function requestOpen(): void {
  zIndex.value = nextZIndex()
  openSequence.value = nextOverlayOpenSequence()
  if (!hasWindow()) {
    visible.value = true
    syncExpanded(true)
    emit('opened')
    return
  }
  visible.value = true
  upsertStackEntry()
  runId += 1
  const currentRunId = runId
  resolveSource()
  resolveTilt()
  syncExpanded(false)
  emit('open')
  nextTick(() => {
    if (currentRunId !== runId)
      return
    upsertStackEntry()
    startOpenAnimation(currentRunId)
  })
}

function requestClose(): void {
  if (!visible.value)
    return
  runId += 1
  const currentRunId = runId
  syncExpanded(false)
  emit('close')
  nextTick(() => {
    if (currentRunId !== runId)
      return
    startCloseAnimation(currentRunId)
  })
}

function handleMaskClick(): void {
  if (props.preventAccidentalClose) {
    triggerBlockedCloseWarning()
    return
  }
  if (!props.maskClosable)
    return
  requestClose()
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!visible.value || !props.preventAccidentalClose)
    return
  triggerBlockedCloseWarning()
  event.preventDefault()
  event.returnValue = ''
}

function bindPageExitGuard(): void {
  if (!hasWindow() || pageExitGuardBound)
    return
  window.addEventListener('beforeunload', handleBeforeUnload)
  pageExitGuardBound = true
}

function unbindPageExitGuard(): void {
  if (!hasWindow() || !pageExitGuardBound)
    return
  window.removeEventListener('beforeunload', handleBeforeUnload)
  pageExitGuardBound = false
}

watch(
  () => props.modelValue,
  (value) => {
    if (value) {
      requestOpen()
    }
    else if (visible.value) {
      requestClose()
    }
  },
  { immediate: true },
)

watch(
  () => [
    visible.value,
    expanded.value,
    animating.value,
    zIndex.value,
    openSequence.value,
    props.globalMask,
    props.maskClass,
    localStackVersion.value,
  ],
  () => {
    upsertStackEntry()
    applyStackCardState()
  },
  { immediate: true, flush: 'post' },
)

watch(
  cardRef,
  () => {
    upsertStackEntry()
    applyStackCardState(true)
  },
  { flush: 'post' },
)

watch(
  visible,
  (value) => {
    if (value && !bodyScrollLocked.value) {
      lockBodyScroll()
      bodyScrollLocked.value = true
      return
    }
    if (!value && bodyScrollLocked.value) {
      unlockBodyScroll()
      bodyScrollLocked.value = false
    }
  },
  { immediate: true },
)

watch(
  [visible, () => props.preventAccidentalClose],
  ([isVisible, preventAccidentalClose]) => {
    if (isVisible && preventAccidentalClose) {
      bindPageExitGuard()
      return
    }
    unbindPageExitGuard()
    if (!isVisible)
      clearBlockedCloseWarning()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  unsubscribeStackChange()
  clearTween()
  clearStackTween()
  unbindPageExitGuard()
  clearBlockedCloseWarning()
  removeStackEntry()
  if (bodyScrollLocked.value) {
    unlockBodyScroll()
    bodyScrollLocked.value = false
  }
})

defineExpose({
  close: requestClose,
})

const slotProps = computed<FlipOverlaySlotProps>(() => ({
  close: requestClose,
  expanded: expanded.value,
  animating: animating.value,
  closable: props.closable,
  headerTitle: props.headerTitle || undefined,
  headerDesc: props.headerDesc || undefined,
}))
</script>

<template>
  <Transition :name="transitionName" :css="useMaskCssTransition">
    <div v-if="visible" :class="maskClassName" :style="maskStyle" @click="handleMaskClick">
      <div
        v-if="props.globalMask && stackMeta.isMaskOwner && stackMeta.stackSize <= 1"
        class="TxFlipOverlay-GlobalMask"
      />
      <div ref="cardRef" :class="cardClassName" @click.stop>
        <TxBaseSurface
          class="TxFlipOverlay-Surface"
          preset="card"
          fake
          :mode="surfaceMode"
          :color="surfaceColor"
          :opacity="surfaceOpacity"
          :moving="animating"
        />
        <div :class="shellClassName">
          <slot v-if="hasCustomHeaderSlot" name="header" v-bind="slotProps" />
          <div v-else-if="shouldRenderBuiltInHeader" class="TxFlipOverlay-Header">
            <div class="TxFlipOverlay-HeaderDisplay">
              <slot name="header-display" v-bind="slotProps">
                <p v-if="props.headerTitle" class="TxFlipOverlay-HeaderTitle">
                  {{ props.headerTitle }}
                </p>
                <p v-if="props.headerDesc" class="TxFlipOverlay-HeaderDesc">
                  {{ props.headerDesc }}
                </p>
              </slot>
            </div>
            <div class="TxFlipOverlay-HeaderActions">
              <slot name="header-actions" v-bind="slotProps" />
              <template v-if="props.closable">
                <slot name="header-close" v-bind="slotProps">
                  <TxButton circle class="TxFlipOverlay-Close" :aria-label="props.closeAriaLabel" @click="requestClose">
                    <span class="i-carbon-close w-4 h-4 text-lg inline-flex" aria-hidden="true" />
                  </TxButton>
                </slot>
              </template>
            </div>
          </div>
          <div :class="bodyClassName">
            <slot v-bind="slotProps" />
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss">
.TxFlipOverlay-Mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  padding: 12px;
  box-sizing: border-box;
}

.TxFlipOverlay-Mask.is-stack-underlay-mask {
  background: transparent !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

.TxFlipOverlay-Mask.is-stack-underlay-mask .TxFlipOverlay-GlobalMask {
  opacity: 0;
}

.TxFlipOverlay-GlobalMask {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background: var(--tx-overlay-mask, rgba(8, 10, 16, 0.52));
  transition: opacity 120ms linear;
}

.TxFlipOverlay-Mask::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0;
}

.TxFlipOverlay-Mask.is-close-guard-warning::after {
  animation: tx-flip-overlay-mask-warning 420ms ease-out;
}

@keyframes tx-flip-overlay-mask-warning {
  0% {
    opacity: 0;
    background: radial-gradient(circle at 50% 50%, rgba(255, 64, 64, 0) 0%, rgba(255, 64, 64, 0) 72%);
  }

  22% {
    opacity: 1;
    background: radial-gradient(circle at 50% 50%, rgba(255, 66, 66, 0.22) 0%, rgba(255, 66, 66, 0.12) 42%, rgba(255, 66, 66, 0) 72%);
  }

  100% {
    opacity: 0;
    background: radial-gradient(circle at 50% 50%, rgba(255, 64, 64, 0) 0%, rgba(255, 64, 64, 0) 72%);
  }
}

.TxFlipOverlay-Card {
  --tx-flip-overlay-radius: 16px;

  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 24px);
  max-height: calc(90dvh - 24px);
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: var(--tx-flip-overlay-radius);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  will-change: transform, opacity, filter;
  z-index: 1;
}

.TxFlipOverlay-Surface {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
}

.TxFlipOverlay-Shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  transform-origin: 50% 50%;
}

.TxFlipOverlay-Card.is-close-guard-warning {
  animation: tx-flip-overlay-close-guard-warning 720ms ease-out;
}

.TxFlipOverlay-Shell.is-close-guard-focus {
  animation: tx-flip-overlay-close-guard-focus 360ms cubic-bezier(0.2, 0.72, 0.2, 1);
}

@keyframes tx-flip-overlay-close-guard-focus {
  0% {
    transform: scale(1);
  }

  28% {
    transform: scale(1.04);
  }

  52% {
    transform: scale(0.985);
  }

  72% {
    transform: scale(1.015);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes tx-flip-overlay-close-guard-warning {
  0% {
    filter: drop-shadow(0 0 0 rgba(255, 79, 79, 0));
  }

  18% {
    filter:
      drop-shadow(0 0 6px rgba(255, 96, 96, 0.98))
      drop-shadow(0 0 22px rgba(255, 64, 64, 0.72))
      drop-shadow(0 0 42px rgba(255, 47, 47, 0.5));
  }

  100% {
    filter: drop-shadow(0 0 0 rgba(255, 79, 79, 0));
  }
}

.TxFlipOverlay-Card.is-border-dashed {
  border-style: dashed;
}

.TxFlipOverlay-Card.is-border-none {
  border: none;
}

.TxFlipOverlay-Card.is-stack-depth-hidden {
  visibility: hidden;
}

.TxFlipOverlay-Header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 14px 10px;
  min-width: 0;
}

.TxFlipOverlay-HeaderDisplay {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.TxFlipOverlay-HeaderTitle {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
}

.TxFlipOverlay-HeaderDesc {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  opacity: 0.72;
}

.TxFlipOverlay-HeaderActions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.TxFlipOverlay-Close {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.TxFlipOverlay-Close:hover {
  background: rgba(0, 0, 0, 0.14);
}

.TxFlipOverlay-Close:active {
  transform: scale(0.96);
}

.TxFlipOverlay-Close:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.TxFlipOverlay-Body,
.TxFlipOverlay-Content {
  flex: 1;
  max-height: inherit;
  min-width: 0;
  min-height: 0;
}

.TxFlipOverlay-Body.is-scrollable,
.TxFlipOverlay-Content.is-scrollable {
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
</style>
