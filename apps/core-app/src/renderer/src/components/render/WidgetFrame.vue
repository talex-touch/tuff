<script lang="ts" name="WidgetFrame" setup>
import type { TuffItem } from '@talex-touch/utils'
import type { PreviewCardPayload } from '@talex-touch/utils/core-box'
import {
  computed,
  createApp,
  h,
  onBeforeUnmount,
  onErrorCaptured,
  reactive,
  ref,
  watch,
  type VNode
} from 'vue'
import { getCustomRenderer, getCustomRendererVersion } from '~/modules/box/custom-render'

const props = withDefaults(
  defineProps<{
    rendererId: string
    preview?: boolean
    item?: TuffItem
    payload?: PreviewCardPayload | Record<string, unknown>
    renderMode?: 'light' | 'shadow'
  }>(),
  {
    preview: false,
    renderMode: 'light'
  }
)

const emits = defineEmits<{
  (e: 'show-history'): void
  (e: 'copy-primary'): void
  (e: 'render-error', error: Error): void
}>()

const renderError = ref<Error | null>(null)
const shadowHost = ref<HTMLDivElement | null>(null)
const shadowRoot = ref<ShadowRoot | null>(null)
const shadowStyle = ref<HTMLStyleElement | null>(null)
const shadowContainer = ref<HTMLDivElement | null>(null)
const shadowApp = ref<ReturnType<typeof createApp> | null>(null)
const shadowProps = reactive({
  item: props.item,
  payload: props.payload,
  preview: props.preview,
  widgetId: props.rendererId,
  onShowHistory: () => emits('show-history'),
  onCopyPrimary: () => emits('copy-primary')
})

const isDev = import.meta.env?.DEV ?? false

function resolveRendererName(value: unknown): string {
  if (!value || typeof value !== 'object') return 'anonymous'
  const named = value as { name?: string; __name?: string }
  return named.name || named.__name || 'anonymous'
}

const renderer = computed(() => {
  if (!props.rendererId) return null
  return getCustomRenderer(props.rendererId) ?? null
})

const rendererKey = computed(() => {
  if (!props.rendererId) return 'custom:empty'
  return `${props.rendererId}:${getCustomRendererVersion(props.rendererId)}`
})

const useShadowHost = computed(() => props.renderMode === 'shadow')
const canRenderShadow = computed(() => useShadowHost.value && Boolean(renderer.value))
const renderModeLabel = computed(() => (useShadowHost.value ? 'shadow' : 'light'))

function logLightLifecycle(phase: string): void {
  if (!isDev || useShadowHost.value || !props.rendererId) return
  console.debug(
    `[WidgetFrame] light component ${phase}: ${props.rendererId} (${resolveRendererName(renderer.value)})`
  )
}

function handleVnodeMounted(_vnode: VNode): void {
  logLightLifecycle('mounted')
}

function handleVnodeUpdated(_vnode: VNode): void {
  logLightLifecycle('updated')
}

function handleVnodeUnmounted(_vnode: VNode): void {
  logLightLifecycle('unmounted')
}

watch(
  () => props.rendererId,
  () => {
    renderError.value = null
  }
)

watch(
  () => [props.rendererId, renderer.value],
  ([rendererId, resolved]) => {
    if (!isDev || !rendererId) return
    if (resolved) {
      const componentName = resolveRendererName(resolved)
      console.debug(
        `[WidgetFrame] renderer ready: ${rendererId} (${componentName}) mode=${renderModeLabel.value}`
      )
      console.debug('[WidgetFrame] props snapshot:', {
        rendererId,
        preview: props.preview,
        item: props.item,
        payload: props.payload
      })
    } else {
      console.warn(`[WidgetFrame] renderer missing: ${rendererId}`)
    }
  },
  { immediate: true }
)

watch(
  () => props.payload,
  (value) => {
    if (!isDev || !props.rendererId) return
    console.debug('[WidgetFrame] payload update:', { rendererId: props.rendererId, payload: value })
  }
)

watch(
  () => props.item,
  (value) => {
    if (!isDev || !props.rendererId) return
    console.debug('[WidgetFrame] item update:', { rendererId: props.rendererId, item: value })
  }
)

onErrorCaptured((error) => {
  const resolved = error instanceof Error ? error : new Error(String(error))
  renderError.value = resolved
  if (isDev) {
    console.error('[WidgetFrame] render error:', resolved)
  }
  emits('render-error', resolved)
  return false
})

watch(
  () => props.item,
  (value) => {
    shadowProps.item = value
  }
)

watch(
  () => props.payload,
  (value) => {
    shadowProps.payload = value
  }
)

watch(
  () => props.preview,
  (value) => {
    shadowProps.preview = value
  }
)

watch(
  () => props.rendererId,
  (value) => {
    shadowProps.widgetId = value
  }
)

function ensureShadowRoot(): ShadowRoot | null {
  const host = shadowHost.value
  if (!host) return null
  if (!shadowRoot.value) {
    shadowRoot.value = host.attachShadow({ mode: 'open' })
    if (isDev) {
      console.debug('[WidgetFrame] shadow root created', { rendererId: props.rendererId })
    }
  }
  if (!shadowContainer.value) {
    shadowContainer.value = document.createElement('div')
    shadowContainer.value.className = 'WidgetFrame-ShadowContainer'
    shadowRoot.value.appendChild(shadowContainer.value)
    if (isDev) {
      console.debug('[WidgetFrame] shadow container created', { rendererId: props.rendererId })
    }
  }
  return shadowRoot.value
}

function syncShadowStyles(): void {
  if (!shadowRoot.value || !props.rendererId) return
  const sourceStyle = document.querySelector(
    `style[data-widget-id="${props.rendererId}"]`
  ) as HTMLStyleElement | null
  const cssText = sourceStyle?.textContent ?? ''
  if (!shadowStyle.value) {
    shadowStyle.value = document.createElement('style')
    shadowRoot.value.prepend(shadowStyle.value)
  }
  shadowStyle.value.textContent = cssText
}

function unmountShadowApp(): void {
  if (shadowApp.value && shadowContainer.value) {
    shadowApp.value.unmount()
    shadowApp.value = null
  }
  if (shadowRoot.value) {
    shadowRoot.value.innerHTML = ''
  }
  shadowRoot.value = null
  shadowStyle.value = null
  shadowContainer.value = null
}

function mountShadowApp(): void {
  if (!renderer.value) return
  const root = ensureShadowRoot()
  if (!root || !shadowContainer.value) return
  syncShadowStyles()
  if (shadowApp.value) {
    shadowApp.value.unmount()
    shadowApp.value = null
  }
  if (isDev) {
    console.debug('[WidgetFrame] shadow app creating', {
      rendererId: props.rendererId,
      component: resolveRendererName(renderer.value),
      mode: props.renderMode
    })
  }
  const app = createApp({
    render: () =>
      h(renderer.value as any, {
        item: shadowProps.item,
        payload: shadowProps.payload,
        preview: shadowProps.preview,
        'widget-id': shadowProps.widgetId,
        onShowHistory: shadowProps.onShowHistory,
        onCopyPrimary: shadowProps.onCopyPrimary
      })
  })
  app.config.errorHandler = (error) => {
    const resolved = error instanceof Error ? error : new Error(String(error))
    renderError.value = resolved
    emits('render-error', resolved)
    if (isDev) {
      console.error('[WidgetFrame] shadow render error:', resolved)
    }
  }
  app.mount(shadowContainer.value)
  shadowApp.value = app
  if (isDev) {
    console.debug('[WidgetFrame] shadow app mounted', {
      rendererId: props.rendererId,
      mode: props.renderMode
    })
  }
}

watch(
  () => [canRenderShadow.value, rendererKey.value],
  ([enabled]) => {
    if (!enabled) {
      unmountShadowApp()
      return
    }
    mountShadowApp()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  unmountShadowApp()
})
</script>

<template>
  <div
    class="WidgetFrame"
    :class="{ 'is-preview': preview, 'is-empty': !renderer, 'has-error': !!renderError }"
  >
    <div v-if="renderError" class="WidgetFrame-Error text-xs text-[var(--el-color-danger)]">
      <div class="WidgetFrame-ErrorTitle">Widget 渲染失败</div>
      <div class="WidgetFrame-ErrorMessage">{{ renderError.message }}</div>
    </div>
    <div v-else-if="canRenderShadow" ref="shadowHost" class="WidgetFrame-ShadowHost" />
    <component
      :is="renderer"
      v-else-if="renderer"
      :key="rendererKey"
      :item="item"
      :payload="payload"
      :preview="preview"
      :widget-id="rendererId"
      :on-vnode-mounted="handleVnodeMounted"
      :on-vnode-updated="handleVnodeUpdated"
      :on-vnode-unmounted="handleVnodeUnmounted"
      @show-history="emits('show-history')"
      @copy-primary="emits('copy-primary')"
    />
    <div v-else class="WidgetFrame-Empty text-xs text-[var(--el-text-color-secondary)]">
      Widget 暂未就绪
    </div>
  </div>
</template>

<style lang="scss" scoped>
.WidgetFrame {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}

.WidgetFrame-Empty {
  width: 100%;
  height: 100%;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-bg-color-page);
}

.WidgetFrame-ShadowHost {
  width: 100%;
  height: 100%;
}

.WidgetFrame-ShadowContainer {
  width: 100%;
  height: 100%;
}

.WidgetFrame-Error {
  width: 100%;
  height: 100%;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px;
  text-align: center;
  background: var(--el-color-danger-light-9);
}

.WidgetFrame-ErrorTitle {
  font-weight: 600;
}

.WidgetFrame-ErrorMessage {
  max-width: 100%;
  word-break: break-word;
  color: var(--el-text-color-secondary);
}
</style>
