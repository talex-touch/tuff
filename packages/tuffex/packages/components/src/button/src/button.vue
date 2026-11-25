<script setup lang="ts">
import type { FunctionalComponent, ObjectDirective, VNode } from 'vue'
import type { RippleEffect } from '@talex-touch/tuffex-core'
import type { ButtonEmits, ButtonProps } from './types'
import { createRippleEffect } from '@talex-touch/tuffex-core'
import { resolveButtonSize } from './size'
import { computed, Fragment, h, nextTick, onBeforeUnmount, ref, Text, useAttrs, useSlots, watch } from 'vue'
import { useFlip } from '../../../../utils/animation/flip'
import { useVibrate, type VibrateType } from '../../../../utils/vibrate'
import Spinner from '../../spinner'
defineOptions({
  name: 'TxButton',
})

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: undefined,
  size: undefined,
  block: false,
  type: undefined,
  plain: false,
  round: false,
  circle: false,
  loading: false,
  loadingVariant: 'spinner',
  progress: undefined,
  showProgress: true,
  formatProgress: undefined,
  status: '',
  disabled: false,
  border: true,
  icon: undefined,
  autofocus: false,
  nativeType: 'button',
  vibrate: false,
  vibrateType: 'light',
})

const emit = defineEmits<ButtonEmits>()

const rippleInstances = new WeakMap<HTMLElement, RippleEffect>()

const vWave: ObjectDirective<HTMLElement> = {
  mounted(el) {
    const ripple = createRippleEffect({
      initialOpacity: 0.22,
      finalOpacity: 0.08,
      duration: 420,
    })
    ripple.attach(el)
    rippleInstances.set(el, ripple)
  },
  beforeUnmount(el) {
    rippleInstances.get(el)?.destroy()
    rippleInstances.delete(el)
  },
}

const buttonRef = ref<HTMLButtonElement | null>(null)
const innerRef = ref<HTMLElement | null>(null)
void innerRef.value
const attrs = useAttrs()
const slots = useSlots()

const autoWidthEnabled = computed(() => {
  return !props.block && !props.circle
})

const { flip: flipSize } = useFlip(buttonRef, {
  mode: 'size',
  includeScale: false,
  duration: 180,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
  size: {
    width: true,
    height: false,
  },
})

const MORPH_MS = 420
const morphing = ref(false)
let morphTimer: ReturnType<typeof setTimeout> | undefined

const hasProgress = computed(() => {
  return typeof props.progress === 'number' && Number.isFinite(props.progress)
})

const clampedProgress = computed(() => {
  if (!hasProgress.value)
    return 0
  return Math.min(100, Math.max(0, props.progress as number))
})

const resolvedStatus = computed<'' | 'success' | 'warning' | 'error'>(() => {
  if (props.status === 'success' || props.status === 'warning' || props.status === 'error')
    return props.status
  return ''
})

const hasStatus = computed(() => resolvedStatus.value !== '')

const progressRatio = computed(() => {
  if (hasStatus.value)
    return 1
  if (!hasProgress.value)
    return 0
  return clampedProgress.value / 100
})

const showProgressLayer = computed(() => {
  return hasProgress.value || hasStatus.value
})

const showProgressValue = computed(() => {
  return hasProgress.value && props.showProgress && !hasStatus.value
})

const formattedProgress = computed(() => {
  const rounded = Math.round(clampedProgress.value)
  if (props.formatProgress)
    return props.formatProgress(clampedProgress.value)
  return `${rounded}%`
})

const isBusy = computed(() => {
  return props.loading || (hasProgress.value && !hasStatus.value && clampedProgress.value < 100)
})

const isInteractiveDisabled = computed(() => {
  return props.disabled || isBusy.value
})

function triggerMorphWindow() {
  if (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    morphing.value = false
    return
  }
  morphing.value = true
  if (morphTimer !== undefined)
    clearTimeout(morphTimer)
  morphTimer = setTimeout(() => {
    morphTimer = undefined
    morphing.value = false
  }, MORPH_MS)
}

watch(
  [() => props.loading, hasProgress, resolvedStatus],
  ([nextLoading, nextProgress, nextStatus], [prevLoading, prevProgress, prevStatus]) => {
    if (nextStatus !== prevStatus || nextProgress !== prevProgress || nextLoading !== prevLoading)
      triggerMorphWindow()
    if (!autoWidthEnabled.value)
      return
    void flipSize(async () => {
      await nextTick()
    })
  },
  { flush: 'sync' },
)

onBeforeUnmount(() => {
  if (morphTimer !== undefined)
    clearTimeout(morphTimer)
})
const normalizedVariant = computed(() => {
  if (props.variant)
    return props.variant
  switch (props.type) {
    case 'primary':
      return 'primary'
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'danger':
      return 'danger'
    case 'info':
      return 'info'
    case 'text':
      return 'ghost'
    default:
      return 'secondary'
  }
})

const normalizedSize = computed(() => resolveButtonSize(props.size))

const spinnerSize = computed(() => {
  if (normalizedSize.value === 'sm')
    return 14
  if (normalizedSize.value === 'lg')
    return 18
  return 16
})

const buttonStyle = computed(() => {
  if (!showProgressLayer.value)
    return undefined
  return {
    '--tx-button-progress-scale': `${progressRatio.value}`,
  }
})

const innerStyle = computed(() => {
  return {
    '--tx-button-spinner-size': `${spinnerSize.value}px`,
  }
})

const resolvedLoadingVariant = computed(() => {
  if (props.loadingVariant)
    return props.loadingVariant
  const raw = attrs['loading-variant'] ?? attrs.loadingVariant
  return typeof raw === 'string' ? raw : undefined
})

const showLoadingBar = computed(() => {
  return props.loading && props.block && resolvedLoadingVariant.value === 'bar' && !showProgressLayer.value
})

function hasDefaultContent(): boolean {
  const vnodes = slots.default?.({})
  if (!vnodes || !vnodes.length)
    return false
  return vnodes.some((node: VNode) => {
    if (typeof node.children === 'string')
      return node.children.trim().length > 0
    if (Array.isArray(node.children))
      return node.children.some((child) => typeof child === 'string' ? child.trim().length > 0 : !!child)
    return !!node.children
  })
}

const isIconOnly = computed(() => {
  if (props.block && props.circle)
    return false
  const slotHasContent = hasDefaultContent()
  return props.circle || (props.icon && !slotHasContent)
})

/**
 * Raw slot text lays out as an anonymous flex item, which can neither shrink
 * below its text nor carry an ellipsis. A block button takes its row's width,
 * so there each text run goes into a span that can; elsewhere the button is as
 * wide as its content and the slot renders untouched.
 */
function wrapTextRuns(nodes: VNode[]): VNode[] {
  return nodes.map((node) => {
    if (node.type === Text && typeof node.children === 'string' && node.children.trim())
      return h('span', { class: 'tx-button__label' }, [node])
    if (node.type === Fragment && Array.isArray(node.children))
      return h(Fragment, { key: node.key ?? undefined }, wrapTextRuns(node.children as VNode[]))
    return node
  })
}

// Block buttons only. The rest keep the template's `<slot />`, which is also what types the
// default slot in the emitted declarations: without one there, `$slots` declares nothing.
const ButtonContent: FunctionalComponent<{ nodes?: VNode[] }> = ({ nodes }) => nodes && wrapTextRuns(nodes)
ButtonContent.props = ['nodes']

const toneClass = computed(() => {
  if (!props.type)
    return undefined
  return `tone-${props.type}`
})

const classList = computed(() => {
  return [
    `variant-${normalizedVariant.value}`,
    toneClass.value,
    `tx-size-${normalizedSize.value}`,
    resolvedStatus.value && `is-status-${resolvedStatus.value}`,
    {
      'block': props.block,
      'loading': props.loading,
      'loading-bar': showLoadingBar.value,
      'has-progress': hasProgress.value,
      'has-status': hasStatus.value,
      'is-morphing': morphing.value,
      'disabled': props.disabled,
      'plain': props.plain,
      'dashed': props.dashed,
      'round': props.round,
      'circle': props.circle,
      'borderless': props.border === false,
      'auto-width': autoWidthEnabled.value,
    },
  ]
})

// Visual counterpart of the haptic feedback: desktops (and phones with
// vibration off) still get a small nudge scaled to the vibration strength.
const SHAKE_AMPLITUDE: Record<VibrateType, string> = {
  bit: '0.6px',
  light: '1px',
  medium: '1.6px',
  success: '1.6px',
  warning: '2px',
  heavy: '2.4px',
  error: '2.4px',
}

function playShake(type: VibrateType) {
  const el = buttonRef.value
  if (!el)
    return
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    return
  el.style.setProperty('--tx-button-shake-amp', SHAKE_AMPLITUDE[type])
  // Restart the animation on rapid clicks.
  el.classList.remove('is-haptic-shake')
  void el.offsetWidth
  el.classList.add('is-haptic-shake')
}

function onShakeEnd(event: AnimationEvent) {
  if (event.animationName === 'tx-button-haptic-shake')
    buttonRef.value?.classList.remove('is-haptic-shake')
}

function handleClick(event: MouseEvent) {
  if (isInteractiveDisabled.value)
    return
  if (props.vibrate) {
    let vibrateType = props.vibrateType
    if (!vibrateType) {
      switch (normalizedVariant.value) {
        case 'primary':
          vibrateType = 'medium'
          break
        case 'success':
          vibrateType = 'success'
          break
        case 'warning':
          vibrateType = 'warning'
          break
        case 'danger':
          vibrateType = 'error'
          break
        default:
          vibrateType = 'light'
      }
    }
    useVibrate(vibrateType)
    playShake(vibrateType)
  }

  emit('click', event)
}

if (props.autofocus) {
  nextTick(() => {
    buttonRef.value?.focus()
  })
}
</script>

<template>
  <button
    ref="buttonRef"
    v-wave
    class="tx-button fake-background isolate"
    :class="classList"
    :style="buttonStyle"
    :type="nativeType"
    :disabled="isInteractiveDisabled"
    :aria-busy="isBusy || undefined"
    @click="handleClick"
    @animationend="onShakeEnd"
  >
    <span v-if="showLoadingBar" class="tx-button__loading-layer" aria-hidden="true" />
    <span v-if="showProgressLayer" class="tx-button__progress-track" aria-hidden="true">
      <span class="tx-button__progress-fill" />
    </span>
    <span ref="innerRef" class="tx-button__inner" :style="innerStyle">
      <template v-if="!showLoadingBar">
        <template v-if="isIconOnly">
          <Spinner
            v-if="loading && !hasStatus && !hasProgress"
            class="tx-button__spinner is-overlay"
            :visible="loading && !hasStatus && !hasProgress"
            :size="spinnerSize"
          />
        </template>
        <template v-else>
          <span v-if="loading && !hasStatus" class="tx-button__spinner-slot is-visible">
            <Spinner
              class="tx-button__spinner"
              :visible="loading && !hasStatus"
              :size="spinnerSize"
            />
          </span>
        </template>
      </template>

      <span v-if="hasStatus" class="tx-button__status-slot is-visible" aria-hidden="true">
        <svg class="tx-button__status-svg" viewBox="0 0 24 24" :width="spinnerSize" :height="spinnerSize">
          <path
            v-if="resolvedStatus === 'success'"
            class="tx-button__status-glyph is-success"
            d="M4 12.5l5 5L20 6.5"
            pathLength="1"
          />
          <g v-else-if="resolvedStatus === 'warning'" class="tx-button__status-glyph is-warning">
            <path d="M12 3.5L21 19.5H3L12 3.5Z" pathLength="1" />
            <path class="tx-button__status-detail" d="M12 9.5v4.5" pathLength="1" />
            <circle class="tx-button__status-dot" cx="12" cy="16.8" r="1" />
          </g>
          <g v-else-if="resolvedStatus === 'error'" class="tx-button__status-glyph is-error">
            <path d="M18 6L6 18" pathLength="1" />
            <path class="tx-button__status-second" d="M6 6l12 12" pathLength="1" />
          </g>
        </svg>
      </span>

      <i v-if="icon && (!hasStatus || !isIconOnly)" class="tx-button__icon" :class="icon" />
      <ButtonContent v-if="block" :nodes="$slots.default?.({})" />
      <slot v-else />

      <span v-if="showProgressValue" class="tx-button__progress-value">
        {{ formattedProgress }}
      </span>
    </span>
  </button>
</template>
