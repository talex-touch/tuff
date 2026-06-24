<script>
</script>

<script setup>
import { useModelWrapper } from '@modules/utils.ts'
import { TweenLite } from 'gsap/gsap-core'
import { nextTick, ref, watchEffect } from 'vue'

defineOptions({
  name: 'PlayPause',
})

const props = defineProps(['modelValue'])

const emits = defineEmits(['update:modelValue'])

const modelValue = useModelWrapper(props, emits)

const _svg = ref()

watchEffect(() => {
  nextTick(() => refresh(modelValue.value))
})

function refresh(value) {
  const svg = _svg.value
  if (!svg)
    return nextTick(() => refresh(value))
  modelValue.value = value
  const svgPath = svg.querySelector('path')

  TweenLite.to(svgPath, 0.25, {
    attr: {
      d: svg.getAttribute(!value ? 'data-play' : 'data-pause'),
    },
  })
}
</script>

<template>
  <button
    type="button"
    class="PlayPause-Container"
    :aria-label="modelValue ? 'Pause' : 'Play'"
    :aria-pressed="modelValue"
    @click="refresh(!modelValue)"
  >
    <svg
      ref="_svg" class="icon-play" version="1.1" xmlns="https://www.w3.org/2000/svg" xmlns:xlink="https://www.w3.org/1999/xlink"
      width="100" height="100" viewBox="0 0 36 36"
      data-play="M 12,26 18.5,22 18.5,14 12,10 z M 18.5,22 25,18 25,18 18.5,14 z"
      data-pause="M 12,26 16.33,26 16.33,10 12,10 z M 20.66,26 25,26 25,10 20.66,10 z"
    >
      <path d="M 12,26 16.33,26 16.33,10 12,10 z M 20.66,26 25,26 25,10 20.66,10 z" />
    </svg>
  </button>
</template>

<style lang="scss" scoped>
.PlayPause-Container {
  &:hover {
    background-color: #00000010;
  }
  &:active {
    transform: scale(.8)
  }

  width: 48px;
  height: 48px;

  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  border: 0;
  appearance: none;
  color: inherit;
  background: transparent;
  border-radius: 8px;
  transition: .1s;
}

.PlayPause-Container svg {
  width: 48px;
  height: 48px;

  fill: var(--tx-text-color-primary)
}
</style>
