<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { IconMorphProps } from './types'
import {
  computeInitialD,
  createController,
  type IconInput,
  type MorphHandle,
  type MorphOptions,
  type SpringPreset,
  svgToIcon,
} from './engine'
import { BUILTIN_MORPH_ICONS } from './types'

defineOptions({
  name: 'TxIconMorph',
})

const props = withDefaults(defineProps<IconMorphProps>(), {
  icon: undefined,
  from: undefined,
  to: undefined,
  progress: undefined,
  spring: undefined,
  reducedMotion: 'never',
  size: 24,
  color: 'currentColor',
  strokeWidth: 2,
  absoluteStrokeWidth: false,
  viewBox: '0 0 24 24',
  label: undefined,
})

function resolveIconInput(input: unknown): IconInput | undefined {
  if (input === undefined || input === null) return undefined
  if (Array.isArray(input)) return input as IconInput
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (!trimmed) return undefined
    if (trimmed in BUILTIN_MORPH_ICONS) return BUILTIN_MORPH_ICONS[trimmed]
    if (trimmed.startsWith('<svg') || trimmed.startsWith('<path') || trimmed.startsWith('<')) {
      try {
        return svgToIcon(trimmed)
      }
      catch {
        return trimmed
      }
    }
    return trimmed
  }
  return input as IconInput
}

const resolvedIcon = computed(() => resolveIconInput(props.icon))
const resolvedFrom = computed(() => resolveIconInput(props.from))
const resolvedTo = computed(() => resolveIconInput(props.to))

const initialD = computeInitialD({
  icon: resolvedIcon.value,
  from: resolvedFrom.value,
  to: resolvedTo.value,
  progress: props.progress,
})

const pathEl = ref<SVGPathElement | null>(null)

const controller = createController({
  icon: resolvedIcon.value,
  from: resolvedFrom.value,
  to: resolvedTo.value,
  progress: props.progress,
  reducedMotion: props.reducedMotion,
})

onMounted(() => {
  if (pathEl.value) {
    controller.mount(pathEl.value, {
      icon: resolvedIcon.value,
      from: resolvedFrom.value,
      to: resolvedTo.value,
      progress: props.progress,
      reducedMotion: props.reducedMotion,
    })
  }
})

onBeforeUnmount(() => {
  controller.destroy()
})

watch(
  () => [
    resolvedIcon.value,
    resolvedFrom.value,
    resolvedTo.value,
    props.progress,
    props.spring,
    props.reducedMotion,
  ] as const,
  () => {
    controller.watch({
      icon: resolvedIcon.value,
      from: resolvedFrom.value,
      to: resolvedTo.value,
      progress: props.progress,
      spring: props.spring,
      reducedMotion: props.reducedMotion,
    })
  },
)

const computedStrokeWidth = computed(() => {
  if (props.absoluteStrokeWidth) {
    const sizeNum = Number(props.size)
    const swNum = Number(props.strokeWidth)
    if (Number.isFinite(sizeNum) && sizeNum > 0 && Number.isFinite(swNum))
      return (swNum * 24) / sizeNum
  }
  return props.strokeWidth
})

const handle: MorphHandle = {
  morphTo(target: unknown, springPreset?: SpringPreset | MorphOptions) {
    const resolved = resolveIconInput(target)
    if (resolved !== undefined)
      controller.morphTo(resolved, springPreset ?? props.spring)
  },
  set(target: unknown) {
    const resolved = resolveIconInput(target)
    if (resolved !== undefined)
      controller.set(resolved)
  },
  seek(target: unknown, t: number) {
    const resolved = resolveIconInput(target)
    if (resolved !== undefined)
      controller.seek(resolved, t)
  },
}

defineExpose({
  ...handle,
  get progress() {
    return controller.getMorph()?.progress ?? 1
  },
  getMorph: () => controller.getMorph(),
})
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    :viewBox="viewBox"
    fill="none"
    :stroke="color"
    :stroke-width="computedStrokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-hidden="label ? undefined : 'true'"
    class="tx-icon-morph"
  >
    <title v-if="label">{{ label }}</title>
    <path ref="pathEl" :d="initialD" />
  </svg>
</template>

<style lang="scss">
.tx-icon-morph {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  overflow: visible;
}
</style>
