<script setup lang="ts">
import { type Component, type ComponentPublicInstance, computed, h, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { createAsyncDemo, type DemoLoader } from './demo-loader'

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

type DemoRegistry = Record<string, DemoLoader>
type RegistryState = 'idle' | 'loading' | 'ready' | 'error'

const props = defineProps<DemoClientRendererProps>()
const emit = defineEmits<{
  (event: 'instance-change', instance: DemoResetController | null): void
}>()
let sharedDemoLoaders: DemoRegistry | null = null
let sharedRegistryPromise: Promise<DemoRegistry> | null = null

async function loadDemoRegistry() {
  if (sharedDemoLoaders)
    return sharedDemoLoaders

  sharedRegistryPromise ??= import('./demo-registry').then(module => module.demoLoaders)
  sharedDemoLoaders = await sharedRegistryPromise
  return sharedDemoLoaders
}

const demoInstanceRef = ref<DemoResetController | null>(null)
const demoLoaders = shallowRef<DemoRegistry | null>(null)
const registryState = ref<RegistryState>('idle')
let registryRequestId = 0

const DemoLoadingFallback: Component = () => h('div', { class: 'tuff-demo__placeholder' }, 'Loading demo...')

const DemoErrorFallback: Component = () =>
  h('div', { class: 'tuff-demo__placeholder', style: 'color: var(--tx-color-danger)' }, 'Failed to load demo.')

const demoComponentMap = new Map<string, Component>()

async function ensureDemoRegistry() {
  if (demoLoaders.value || registryState.value === 'loading')
    return

  const requestId = ++registryRequestId
  registryState.value = 'loading'

  try {
    const loaders = await loadDemoRegistry()
    if (requestId !== registryRequestId)
      return

    demoLoaders.value = loaders
    registryState.value = 'ready'
  }
  catch {
    if (requestId !== registryRequestId)
      return

    registryState.value = 'error'
  }
}

const demoComponent = computed(() => {
  if (!props.isActive)
    return null
  if (!props.demo)
    return null
  if (!demoLoaders.value)
    return null

  const existing = demoComponentMap.get(props.demo)
  if (existing)
    return existing

  const loader = demoLoaders.value[props.demo]
  if (!loader)
    return null

  const component = createAsyncDemo(loader, DemoLoadingFallback, DemoErrorFallback)
  demoComponentMap.set(props.demo, component)
  return component
})

const isRegistryLoading = computed(() => props.isActive && registryState.value === 'loading')
const didRegistryFail = computed(() => props.isActive && registryState.value === 'error')

watch(
  () => [props.isActive, props.demo] as const,
  ([isActive, demo]) => {
    if (isActive && demo)
      void ensureDemoRegistry()
  },
  { immediate: true },
)

watch(demoInstanceRef, instance => emit('instance-change', instance), { flush: 'post' })

onBeforeUnmount(() => {
  registryRequestId += 1
  emit('instance-change', null)
})
</script>

<template>
  <component :is="demoComponent" v-if="demoComponent" :key="props.renderKey" ref="demoInstanceRef" />
  <div v-else-if="isRegistryLoading" class="tuff-demo__placeholder">
    Loading demo...
  </div>
  <div v-else-if="didRegistryFail" class="tuff-demo__placeholder" style="color: var(--tx-color-danger)">
    Failed to load demo.
  </div>
  <div v-else-if="!props.isActive" class="tuff-demo__placeholder">
    {{ props.inactiveLabel }}
  </div>
  <div v-else class="tuff-demo__placeholder">
    Demo component "{{ props.demo }}" not found.
  </div>
</template>
