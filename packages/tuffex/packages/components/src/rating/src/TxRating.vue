<script setup lang="ts">
import type { RatingProps } from './types'
import { computed, ref } from 'vue'
import { TxIcon } from '../../icon'

interface Props extends RatingProps {}

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
  filledIcon: 'star',
  emptyIcon: 'star',
  halfIcon: 'star-half',
})

const emit = defineEmits<Emits>()

const rating = computed(() => props.modelValue ?? 0)

const precisionDigits = computed(() => {
  const p = props.precision ?? 1
  if (p === 0.5)
    return 1
  if (typeof p !== 'number' || !Number.isFinite(p))
    return 1
  return Math.max(0, Math.min(6, Math.round(p)))
})

const hoverValue = ref<number>(props.modelValue)

const filledStars = computed(() => {
  if (props.readonly || props.disabled) {
    return props.modelValue
  }
  return hoverValue.value
})

function getStarIcon(star: number) {
  const filledValue = filledStars.value

  if (star <= filledValue) {
    return props.filledIcon
  }
  else if (star === filledValue + 0.5) {
    return props.halfIcon
  }
  else {
    return props.emptyIcon
  }
}

function handleClick(star: number) {
  if (props.disabled || props.readonly)
    return

  let newValue = star
  if (props.precision === 0.5 && star === filledStars.value) {
    newValue = star - 0.5
  }

  emit('update:modelValue', newValue)
  emit('change', newValue)
}

function handleMouseEnter(star: number) {
  if (props.disabled || props.readonly)
    return
  hoverValue.value = star
}

function handleMouseLeave() {
  if (props.disabled || props.readonly)
    return
  hoverValue.value = props.modelValue
}
</script>

<template>
  <div class="tx-rating">
    <div class="tx-rating__stars">
      <button
        v-for="star in maxStars"
        :key="star"
        class="tx-rating__star"
        :class="{
          'tx-rating__star--filled': star <= filledStars,
          'tx-rating__star--half': star === filledStars + 0.5,
          'tx-rating__star--disabled': disabled,
        }"
        :disabled="disabled"
        :aria-label="`Rate ${star} star${star !== 1 ? 's' : ''}`"
        @click="handleClick(star)"
        @mouseenter="handleMouseEnter(star)"
        @mouseleave="handleMouseLeave"
      >
        <TxIcon :name="getStarIcon(star)" />
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
  gap: 2px;
}

.tx-rating__star {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--tx-rating-star-empty, #d1d5db);
  font-size: 20px;
  transition: color 0.2s, transform 0.2s;
}

.tx-rating__star:hover:not(.tx-rating__star--disabled) {
  transform: scale(1.1);
}

.tx-rating__star--filled {
  color: var(--tx-rating-star-filled, #fbbf24);
}

.tx-rating__star--half {
  color: var(--tx-rating-star-filled, #fbbf24);
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
</style>
