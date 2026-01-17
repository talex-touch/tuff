<script setup lang="ts">
import type { FusionProps } from './types'
import { computed, getCurrentInstance, ref } from 'vue'

defineOptions({ name: 'TxFusion' })

const props = withDefaults(defineProps<FusionProps>(), {
  modelValue: undefined,
  disabled: false,
  trigger: 'hover',
  direction: 'x',
  gap: 40,
  duration: 260,
  easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  blur: 19,
  alpha: 29,
  alphaOffset: -10,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'change', v: boolean): void
}>()

const internalActive = ref(false)

const active = computed({
  get: () => (typeof props.modelValue === 'boolean' ? props.modelValue : internalActive.value),
  set: (v: boolean) => {
    if (props.disabled)
      return
    if (typeof props.modelValue !== 'boolean')
      internalActive.value = v
    emit('update:modelValue', v)
    emit('change', v)
  },
})

const uid = getCurrentInstance()?.uid ?? Math.floor(Math.random() * 1e9)
const filterId = `tx-fusion-goo-${uid}`

function onEnter() {
  if (props.trigger !== 'hover')
    return
  active.value = true
}

function onLeave() {
  if (props.trigger !== 'hover')
    return
  active.value = false
}

function onClick() {
  if (props.trigger !== 'click')
    return
  active.value = !active.value
}

const stageStyle = computed(() => {
  const d = Math.max(0, props.duration)
  return {
    '--tx-fusion-duration': `${d}ms`,
    '--tx-fusion-easing': props.easing,
    '--tx-fusion-gap': `${props.gap}px`,
    '--tx-fusion-blur': `${props.blur}px`,
  } as Record<string, string>
})

const matrixValues = computed(() => {
  const a = Number.isFinite(props.alpha) ? props.alpha : 18
  const o = Number.isFinite(props.alphaOffset) ? props.alphaOffset : -7
  return `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${a} ${o}`
})
</script>

<template>
  <div
    class="tx-fusion"
    :class="{ 'is-active': active, 'is-disabled': disabled, 'is-dir-y': direction === 'y' }"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @click="onClick"
  >
    <svg class="tx-fusion__filters" width="0" height="0" aria-hidden="true">
      <defs>
        <filter :id="filterId">
          <feGaussianBlur in="SourceGraphic" :stdDeviation="props.blur" result="blur" />
          <feColorMatrix in="blur" mode="matrix" :values="matrixValues" result="goo" />
        </filter>
      </defs>
    </svg>

    <div class="tx-fusion__stage" :style="stageStyle">
      <div class="tx-fusion__goo" :style="{ filter: `url(#${filterId})` }">
        <div class="tx-fusion__blob tx-fusion__blob--a">
          <slot name="a" />
        </div>
        <div class="tx-fusion__blob tx-fusion__blob--b">
          <slot name="b" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tx-fusion {
  display: inline-block;
}

.tx-fusion.is-disabled {
  pointer-events: none;
  opacity: 0.7;
}

.tx-fusion__filters {
  position: absolute;
  width: 0;
  height: 0;
}

.tx-fusion__stage {
  position: relative;
  display: grid;
  place-items: center;
}

.tx-fusion__goo {
  position: relative;
  display: grid;
  place-items: center;
}

.tx-fusion__blob {
  grid-area: 1 / 1;
  transition: transform var(--tx-fusion-duration, 260ms) var(--tx-fusion-easing, ease);
  will-change: transform;
}

.tx-fusion__blob--a {
  transform: translate3d(calc(var(--tx-fusion-gap, 40px) * -0.5), 0, 0) scale(1);
}

.tx-fusion__blob--b {
  transform: translate3d(calc(var(--tx-fusion-gap, 40px) * 0.5), 0, 0) scale(1);
}

.tx-fusion.is-active .tx-fusion__blob--a,
.tx-fusion.is-active .tx-fusion__blob--b {
  transform: translate3d(0, 0, 0) scale(1.02);
}

.tx-fusion.is-dir-y .tx-fusion__blob--a {
  transform: translate3d(0, calc(var(--tx-fusion-gap, 40px) * -0.5), 0) scale(1);
}

.tx-fusion.is-dir-y .tx-fusion__blob--b {
  transform: translate3d(0, calc(var(--tx-fusion-gap, 40px) * 0.5), 0) scale(1);
}

.tx-fusion.is-dir-y.is-active .tx-fusion__blob--a,
.tx-fusion.is-dir-y.is-active .tx-fusion__blob--b {
  transform: translate3d(0, 0, 0) scale(1.02);
}
</style>
