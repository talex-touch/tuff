<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { DemoModule } from './demo-loader'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { loadDemoComponent } from './demo-component-loader'

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
const demoModule = shallowRef<DemoModule | null>(null)
const loadState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
let requestId = 0

watch(
  () => [props.isActive, props.demo] as const,
  async ([isActive, name]) => {
    const currentRequestId = ++requestId
    demoModule.value = null
    if (!isActive || !name) {
      loadState.value = 'idle'
      return
    }
    loadState.value = 'loading'
    try {
      const loaded = await loadDemoComponent(name)
      if (currentRequestId !== requestId)
        return
      demoModule.value = loaded
      loadState.value = 'ready'
    }
    catch {
      if (currentRequestId === requestId)
        loadState.value = 'error'
    }
  },
  { immediate: true },
)

const demoComponent = computed(() => props.isActive ? demoModule.value?.default : null)
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
  <div v-else-if="loadState === 'error'" class="tuff-demo__placeholder" style="color: var(--tx-color-danger)">
    {{ props.errorLabel }}
  </div>
  <div v-else-if="!props.isActive" class="tuff-demo__placeholder">
    {{ props.inactiveLabel }}
  </div>
  <div v-else class="tuff-demo__placeholder">
    {{ props.notFoundLabel }}
  </div>
</template>
