<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch, type Component, type ComponentPublicInstance } from 'vue'
import { hasDemoComponent, loadDemoComponent } from './demo-registry'

interface DemoClientRendererProps {
  demo: string
  isActive: boolean
  renderKey: number
  inactiveLabel: string
  loadingLabel: string
  errorLabel: string
  notFoundLabel: string
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
  'instance-change': [instance: DemoResetController | null]
}>()

const demoInstanceRef = ref<DemoResetController | null>(null)
const resolvedComponent = shallowRef<Component | null>(null)
const loadState = ref<'idle' | 'loading' | 'ready' | 'not-found' | 'error'>('idle')
let requestId = 0

function unwrapDemoExport(mod: unknown): Component | null {
  if (!mod)
    return null
  if (typeof mod === 'object' && 'default' in mod)
    return ((mod as { default?: Component }).default) ?? null
  return mod as Component
}

watch(
  () => [props.isActive, props.demo] as const,
  async ([isActive, name]) => {
    const currentRequestId = ++requestId
    resolvedComponent.value = null

    if (!isActive || !name) {
      loadState.value = 'idle'
      return
    }

    if (!hasDemoComponent(name)) {
      loadState.value = 'not-found'
      return
    }

    loadState.value = 'loading'
    try {
      const loaded = await loadDemoComponent(name)
      if (currentRequestId !== requestId)
        return
      const comp = unwrapDemoExport(loaded)
      if (!comp) {
        loadState.value = 'not-found'
        return
      }
      resolvedComponent.value = comp
      loadState.value = 'ready'
    }
    catch {
      if (currentRequestId === requestId)
        loadState.value = 'error'
    }
  },
  { immediate: true },
)

const demoComponent = computed(() => (props.isActive ? resolvedComponent.value : null))

watch(demoInstanceRef, instance => emit('instance-change', instance), { flush: 'post' })

onBeforeUnmount(() => {
  requestId += 1
  emit('instance-change', null)
})
</script>

<template>
  <component :is="demoComponent" v-if="demoComponent" :key="props.renderKey" ref="demoInstanceRef" />
  <div v-else-if="loadState === 'loading'" class="tuff-demo__placeholder">
    {{ props.loadingLabel }}
  </div>
  <div v-else-if="loadState === 'error'" class="tuff-demo__placeholder" style="color: var(--tx-color-danger, #f56c6c)">
    {{ props.errorLabel }}
  </div>
  <div v-else-if="!props.isActive" class="tuff-demo__placeholder">
    {{ props.inactiveLabel }}
  </div>
  <div v-else class="tuff-demo__placeholder">
    {{ props.notFoundLabel }}
  </div>
</template>
