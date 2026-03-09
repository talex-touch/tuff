<script setup lang="ts">
import { el } from 'element-plus/es/locales.mjs'

const props = defineProps<{
  modelValue: any
}>()

const emits = defineEmits<{
  (name: 'update:modelValue', data: any): void
}>()

const option = useVModel(props, 'modelValue', emits)

function handleDrap(e: any) {
  const el = e.target as HTMLElement

  const rect = el.getBoundingClientRect()

  const x = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX

  const per = Math.round((x - rect.left) / rect.width * 100)

  // 自动吸附到最近的5%
  option.value = Math.round(per / 5) * 5
  if (option.value > 100)
    option.value = 100
  if (option.value < 0)
    option.value = 0
}

function handleMousedown(event: Event) {
  const el = event.target as HTMLElement
  if (!el)
    return

  if (event instanceof MouseEvent)
    el.addEventListener('mousemove', handleDrap)
  else
    el.addEventListener('touchmove', handleDrap)

  document.addEventListener('mouseup', handleMouseup)
  document.addEventListener('touchend', handleMouseup)

  // el.parentElement!.parentElement!.addEventListener('mouselave', handleMouseup)
}

function handleMouseup(event: Event) {
  const el = event.target as HTMLElement
  if (!el)
    return

  el.removeEventListener('mousemove', handleDrap)
  el.removeEventListener('touchmove', handleDrap)

  // el.parentElement!.parentElement!.removeEventListener('mouselave', handleMouseup)
}
</script>

<template>
  <div
    :style="`--c: ${option}%`"
    class="OptionSlider" @mousedown="handleMousedown"
    @touchstart="handleMousedown"
  />
</template>

<style lang="scss">
.OptionSlider {
  &::before {
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: var(--c);
    height: 100%;

    opacity: 0.5;
    background-color: var(--el-color-primary);
  }
  &::after {
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0.05;
    background-color: var(--el-text-color-primary);
  }

  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  overflow: hidden;
  user-select: none;
  border-radius: 12px;
}
</style>
