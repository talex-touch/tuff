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
let reactRoot: { render: (element: unknown) => void, unmount: () => void } | null = null
let mountToken = 0

function unmountReactRoot() {
  if (reactRoot) {
    try {
      reactRoot.unmount()
    }
    catch {
      // Ignore unmount errors during rapid switching.
    }
    reactRoot = null
  }
  stageRef.value?.replaceChildren()
}

async function mountLiveReact() {
  const token = ++mountToken
  unmountReactRoot()

  const showcase = getFrameworkShowcase(props.componentSlug)
  if (!showcase) {
    state.value = 'unlinked'
    emit('runtime-state', 'unlinked')
    return
  }

  state.value = 'loading'
  emit('runtime-state', 'loading')

  try {
    const runtimeMod = await import('virtual:tuffex-react-runtime')
    if (token !== mountToken)
      return

    if (!runtimeMod.available) {
      state.value = 'unlinked'
      emit('runtime-state', 'unlinked')
      return
    }

    const runtime = await runtimeMod.loadTuffexReactRuntime()
    if (token !== mountToken)
      return

    if (!runtime || typeof runtime.createRoot !== 'function' || !stageRef.value) {
      state.value = 'unlinked'
      emit('runtime-state', 'unlinked')
      return
    }

    const element = showcase.renderReact(runtime.React, runtime.TuffexReact, props.locale)
    const root = runtime.createRoot(stageRef.value)
    reactRoot = root
    root.render(element)
    state.value = 'live'
    emit('runtime-state', 'live')
  }
  catch {
    if (token !== mountToken)
      return
    unmountReactRoot()
    state.value = 'error'
    emit('runtime-state', 'error')
  }
}

function resetDemo() {
  void mountLiveReact()
}

defineExpose({ resetDemo })

onMounted(() => {
  void mountLiveReact()
})

watch(
  () => [props.componentSlug, props.locale, props.renderKey] as const,
  () => {
    void mountLiveReact()
  },
)

onBeforeUnmount(() => {
  mountToken += 1
  unmountReactRoot()
})
</script>

<template>
  <div v-show="state === 'live'" ref="stageRef" class="tuff-fw-stage tuff-fw-stage--react not-prose" />
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
  background: var(--docs-surface-subtle);
  color: var(--docs-ink-regular);
  font-family: var(--docs-mono-font);
  font-size: 12px;
}
</style>
