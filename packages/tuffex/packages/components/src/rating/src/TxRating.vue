<script setup lang="ts">
import type { TxIconSource } from '../../icon'
import { computed, ref } from 'vue'
import { TxIcon } from '../../icon'

type RatingIconValue = string | {
  type: 'emoji' | 'url' | 'file' | 'class' | 'builtin'
  value: string
  status?: 'normal' | 'loading' | 'error'
  colorful?: boolean
  error?: string
}

interface Props {
  modelValue?: number
  maxStars?: number
  precision?: number | 0.5
  disabled?: boolean
  readonly?: boolean
  showText?: boolean
  icon?: RatingIconValue
  filledIcon?: RatingIconValue
  emptyIcon?: RatingIconValue
  halfIcon?: RatingIconValue
  filledColor?: string
  emptyColor?: string
  hoverColor?: string
  textColor?: string
  size?: number | string
  gap?: number | string
  animated?: boolean
}

interface Emits {
  'update:modelValue': [value: number]
  'change': [value: number]
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 0,
  maxStars: 5,
  precision: 1,
  disabled: false,
  readonly: false,
  showText: false,
  icon: undefined,
  filledIcon: undefined,
  emptyIcon: undefined,
  halfIcon: undefined,
  filledColor: undefined,
  emptyColor: undefined,
  hoverColor: undefined,
  textColor: undefined,
  size: undefined,
  gap: undefined,
  animated: true,
})

const emit = defineEmits<Emits>()

const rating = computed(() => props.modelValue ?? 0)
const isInteractive = computed(() => !props.disabled && !props.readonly)

const precisionDigits = computed(() => {
  const p = props.precision ?? 1
  if (p === 0.5)
    return 1
  if (typeof p !== 'number' || !Number.isFinite(p))
    return 1
  return Math.max(0, Math.min(6, Math.round(p)))
})

const hoverValue = ref<number>(props.modelValue)
const animatedStar = ref<number | null>(null)

const filledStars = computed(() => {
  if (props.readonly || props.disabled) {
    return props.modelValue
  }
  return hoverValue.value
})

const ratingStyle = computed(() => ({
  '--tx-rating-star-filled': props.filledColor,
  '--tx-rating-star-empty': props.emptyColor,
  '--tx-rating-star-hover': props.hoverColor,
  '--tx-rating-text': props.textColor,
  '--tx-rating-star-size': formatCssLength(props.size),
  '--tx-rating-star-gap': formatCssLength(props.gap),
}))

function formatCssLength(value?: number | string) {
  if (value === undefined || value === '')
    return undefined
  return typeof value === 'number' ? `${value}px` : value
}

function getFilledIcon() {
  return props.filledIcon ?? props.icon ?? 'star'
}

function getEmptyIcon() {
  return props.emptyIcon ?? props.icon ?? 'star'
}

function isHalfStar(star: number) {
  return star - 0.5 === filledStars.value
}

function getStarFillPercent(star: number) {
  if (star <= filledStars.value)
    return 100
  if (isHalfStar(star))
    return 50
  return 0
}

function getFilledLayerIcon(star: number) {
  if (isHalfStar(star) && props.halfIcon)
    return props.halfIcon
  return getFilledIcon()
}

function getFilledLayerWidth(star: number) {
  if (isHalfStar(star) && props.halfIcon)
    return '100%'
  return `${getStarFillPercent(star)}%`
}

function getStarAriaChecked(star: number) {
  return rating.value >= star
}

function isEmojiIcon(value: string) {
  return /\p{Extended_Pictographic}/u.test(value)
}

function getIconProps(icon: RatingIconValue | undefined): { icon?: TxIconSource | null, name?: string } {
  if (typeof icon !== 'string')
    return { icon: (icon as TxIconSource | undefined) ?? null }
  if (isEmojiIcon(icon))
    return { icon: { type: 'emoji', value: icon } }
  return { name: icon }
}

function handleClick(star: number) {
  if (!isInteractive.value)
    return

  let newValue = star
  if (props.precision === 0.5 && star === rating.value) {
    newValue = star - 0.5
  }

  if (props.animated) {
    animatedStar.value = null
    requestAnimationFrame(() => {
      animatedStar.value = star
      window.setTimeout(() => {
        if (animatedStar.value === star)
          animatedStar.value = null
      }, 620)
    })
  }

  emit('update:modelValue', newValue)
  emit('change', newValue)
}

function handleMouseEnter(star: number) {
  if (!isInteractive.value)
    return
  hoverValue.value = star
}

function handleMouseLeave() {
  if (!isInteractive.value)
    return
  hoverValue.value = props.modelValue
}
</script>

<template>
  <div
    class="tx-rating"
    :class="{ 'tx-rating--animated': animated }"
    :style="ratingStyle"
    :aria-disabled="disabled || undefined"
    :aria-readonly="readonly || undefined"
  >
    <div class="tx-rating__stars" role="radiogroup">
      <button
        v-for="star in maxStars"
        :key="`${star}-${animatedStar === star ? 'pop' : 'idle'}`"
        type="button"
        class="tx-rating__star"
        :class="{
          'tx-rating__star--filled': getStarFillPercent(star) === 100,
          'tx-rating__star--half': getStarFillPercent(star) === 50,
          'tx-rating__star--disabled': disabled || readonly,
          'tx-rating__star--pop': animatedStar === star,
        }"
        role="radio"
        :aria-checked="getStarAriaChecked(star)"
        :disabled="disabled || readonly"
        :aria-label="`Rate ${star} star${star !== 1 ? 's' : ''}`"
        @click="handleClick(star)"
        @mouseenter="handleMouseEnter(star)"
        @mouseleave="handleMouseLeave"
      >
        <span class="tx-rating__icon tx-rating__icon--empty">
          <TxIcon v-bind="getIconProps(getEmptyIcon())" />
        </span>
        <span
          v-if="getStarFillPercent(star) > 0"
          class="tx-rating__icon tx-rating__icon--filled"
          :style="{ width: getFilledLayerWidth(star) }"
        >
          <TxIcon v-bind="getIconProps(getFilledLayerIcon(star))" />
        </span>
      </button>
    </div>

    <div v-if="showText" class="tx-rating__text">
      <slot name="text" :value="rating" :max="maxStars">
        {{ rating.toFixed(precisionDigits) }} / {{ maxStars }}
      </slot>
    </div>
  </div>
</template>

<style scoped>
.tx-rating {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tx-rating__stars {
  display: flex;
  align-items: center;
  gap: var(--tx-rating-star-gap, 2px);
}

.tx-rating__star {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--tx-rating-star-empty, #d1d5db);
  font-size: var(--tx-rating-star-size, 20px);
  line-height: 1;
  transition: color 0.2s, transform 0.2s, filter 0.2s;
  transform-origin: center;
}

.tx-rating__star:hover:not(.tx-rating__star--disabled) {
  transform: scale(1.1);
}

.tx-rating__star:hover:not(.tx-rating__star--disabled) .tx-rating__icon--filled {
  color: var(--tx-rating-star-hover, var(--tx-rating-star-filled, #fbbf24));
}

.tx-rating__icon {
  position: absolute;
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
}

.tx-rating__icon--empty {
  color: var(--tx-rating-star-empty, #d1d5db);
}

.tx-rating__icon--filled {
  color: var(--tx-rating-star-filled, #fbbf24);
}

.tx-rating__star--pop {
  animation: tx-rating-pop 0.62s cubic-bezier(0.16, 1.45, 0.32, 1);
  z-index: 1;
}

.tx-rating__star--pop::after {
  position: absolute;
  inset: -0.24em;
  border-radius: 999px;
  pointer-events: none;
  content: '';
  background: radial-gradient(circle, var(--tx-rating-star-filled, #fbbf24) 0 24%, transparent 62%);
  opacity: 0;
  animation: tx-rating-ripple 0.62s ease-out;
}

.tx-rating__star--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.tx-rating__text {
  font-size: 14px;
  color: var(--tx-rating-text, #6b7280);
  font-weight: 500;
}

@keyframes tx-rating-pop {
  0% {
    transform: scale(0.88) rotate(0deg);
    filter: brightness(1);
  }

  28% {
    transform: scale(1.58) rotate(-14deg);
    filter: brightness(1.45) drop-shadow(0 0 10px var(--tx-rating-star-filled, #fbbf24));
  }

  52% {
    transform: scale(0.94) rotate(8deg);
    filter: brightness(1.15) drop-shadow(0 0 6px var(--tx-rating-star-filled, #fbbf24));
  }

  74% {
    transform: scale(1.16) rotate(-3deg);
    filter: brightness(1.1);
  }

  100% {
    transform: scale(1) rotate(0deg);
    filter: brightness(1);
  }
}

@keyframes tx-rating-ripple {
  0% {
    opacity: 0.36;
    transform: scale(0.3);
  }

  100% {
    opacity: 0;
    transform: scale(1.45);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-rating__star,
  .tx-rating__star--pop {
    transition: none;
    animation: none;
  }
}
</style>
