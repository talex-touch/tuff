<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getFrameworkShowcase, type ShowcaseLocale } from '~/data/tuffex-framework-showcases'

const props = defineProps<{
  componentSlug: string
  locale: ShowcaseLocale
  renderKey: number
}>()

const emit = defineEmits<{
  'runtime-state': [state: 'loading' | 'live' | 'unlinked' | 'error']
}>()

const stageRef = ref<HTMLElement | null>(null)
const state = ref<'loading' | 'live' | 'unlinked' | 'error'>('loading')
let cleanupShowcase: (() => void) | null = null
let mountToken = 0

function teardownShowcase() {
  if (cleanupShowcase) {
    cleanupShowcase()
    cleanupShowcase = null
  }
  stageRef.value?.replaceChildren()
}

async function waitForCustomElement(tag: string, timeoutMs = 2000) {
  if (typeof customElements === 'undefined')
    return false
  if (customElements.get(tag))
    return true

  await Promise.race([
    customElements.whenDefined(tag),
    new Promise(resolve => window.setTimeout(resolve, timeoutMs)),
  ])
  return Boolean(customElements.get(tag))
}

async function mountLiveWebComponent() {
  const token = ++mountToken
  teardownShowcase()

  const showcase = getFrameworkShowcase(props.componentSlug)
  if (!showcase) {
    state.value = 'unlinked'
    emit('runtime-state', 'unlinked')
    return
  }

  state.value = 'loading'
  emit('runtime-state', 'loading')

  try {
    const runtimeMod = await import('virtual:tuffex-wc-runtime')
    if (token !== mountToken)
      return

    if (!runtimeMod.available) {
      state.value = 'unlinked'
      emit('runtime-state', 'unlinked')
      return
    }

    const wcModule = await runtimeMod.loadTuffexWcRuntime()
    if (token !== mountToken)
      return

    if (!wcModule) {
      state.value = 'unlinked'
      emit('runtime-state', 'unlinked')
      return
    }

    const defined = await waitForCustomElement(showcase.wcTag)
    if (token !== mountToken)
      return

    if (!defined || !stageRef.value) {
      state.value = 'unlinked'
      emit('runtime-state', 'unlinked')
      return
    }

    cleanupShowcase = showcase.mountWc(stageRef.value, props.locale)
    state.value = 'live'
    emit('runtime-state', 'live')
  }
  catch {
    if (token !== mountToken)
      return
    state.value = 'error'
    emit('runtime-state', 'error')
  }
}

function resetDemo() {
  void mountLiveWebComponent()
}

defineExpose({ resetDemo })

onMounted(() => {
  void mountLiveWebComponent()
})

watch(
  () => [props.componentSlug, props.locale, props.renderKey] as const,
  () => {
    void mountLiveWebComponent()
  },
)

onBeforeUnmount(() => {
  mountToken += 1
  teardownShowcase()
})
</script>

<template>
  <div v-show="state === 'live'" ref="stageRef" class="tuff-fw-stage tuff-fw-stage--wc not-prose" />
</template>

<style scoped>
.tuff-fw-stage {
  width: 100%;
}

.tuff-fw-stage :deep(.tuff-fw-stage__row) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.tuff-fw-stage :deep(.tuff-fw-stage__stack) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 420px;
}

.tuff-fw-stage :deep(.tuff-fw-stage__readout) {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
</style>
