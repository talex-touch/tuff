<script setup lang="ts">
import { type Component, type ComponentPublicInstance, computed, h, onBeforeUnmount, ref, watch } from 'vue'
import { createAsyncDemo, demoLoaders } from './demo-registry'

interface DemoClientRendererProps {
  demo: string
  isActive: boolean
  renderKey: number
  inactiveLabel: string
}

type DemoResetMethod = () => void | Promise<void>

type DemoResetController = ComponentPublicInstance & {
  replayDemo?: DemoResetMethod
  resetDemo?: DemoResetMethod
  replay?: DemoResetMethod
  reset?: DemoResetMethod
}

const props = defineProps<DemoClientRendererProps>()

const emit = defineEmits<{
  (event: 'instance-change', instance: DemoResetController | null): void
}>()

const demoInstanceRef = ref<DemoResetController | null>(null)

const DemoLoadingFallback: Component = () => h('div', { class: 'tuff-demo__placeholder' }, 'Loading demo...')

const DemoErrorFallback: Component = () =>
  h('div', { class: 'tuff-demo__placeholder', style: 'color: var(--tx-color-danger)' }, 'Failed to load demo.')

const demoComponentMap = new Map<string, Component>()

const demoComponent = computed(() => {
  if (!props.isActive)
    return null
  if (!props.demo)
    return null

  const existing = demoComponentMap.get(props.demo)
  if (existing)
    return existing

  const loader = demoLoaders[props.demo]
  if (!loader)
    return null

  const component = createAsyncDemo(loader, DemoLoadingFallback, DemoErrorFallback)
  demoComponentMap.set(props.demo, component)
  return component
})

watch(demoInstanceRef, instance => emit('instance-change', instance), { flush: 'post' })

onBeforeUnmount(() => {
  emit('instance-change', null)
})
</script>

<template>
  <component :is="demoComponent" v-if="demoComponent" :key="props.renderKey" ref="demoInstanceRef" />
  <div v-else-if="!props.isActive" class="tuff-demo__placeholder">
    {{ props.inactiveLabel }}
  </div>
  <div v-else class="tuff-demo__placeholder">
    Demo component "{{ props.demo }}" not found.
  </div>
</template>
