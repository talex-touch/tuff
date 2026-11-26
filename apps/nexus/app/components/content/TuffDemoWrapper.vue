<script setup lang="ts">
import { type ComponentPublicInstance, computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import TuffDemoClientRenderer from './TuffDemoClientRenderer.client.vue'
import { queueDemoActivation, queueDemoPrefetch, shouldActivateDemo } from './demo-lazy'
import { loadDemoComponent } from './demo-component-loader'
import { useDocsFramework } from '~/composables/useDocsFramework'
import {
  DOCS_FRAMEWORK_META,
  resolveComponentSlugFromPath,
} from '~/utils/tuffex-component-slug'

interface DemoWrapperProps {
  demo: string
  code?: string
  codeLang?: string
  title?: string
  description?: string
  component?: string
}

type DemoResetMethod = () => void | Promise<void>

type DemoResetController = ComponentPublicInstance & {
  replayDemo?: DemoResetMethod
  resetDemo?: DemoResetMethod
  replay?: DemoResetMethod
  reset?: DemoResetMethod
}

const props = withDefaults(defineProps<DemoWrapperProps>(), {
  code: '',
  codeLang: 'vue',
  title: '',
  description: '',
  component: '',
})

const LazyEmbeddedCodeBlock = defineAsyncComponent(() => import('./TuffCodeBlock.vue'))
const LazyDocsFrameworkLiveStage = defineAsyncComponent(() => import('./DocsFrameworkLiveStage.client.vue'))
const LazyDocsReactMount = defineAsyncComponent(() => import('./DocsReactMount.client.vue'))

const { locale, t } = useI18n()
const route = useRoute()
const { framework } = useDocsFramework()

const localeKey = computed<'zh' | 'en'>(() => (locale.value === 'zh' ? 'zh' : 'en'))
const frameworkModules = shallowRef<LoadedFrameworkModules | null>(getCachedFrameworkModules())
const frameworkModulesFailed = ref(false)
let unmounted = false

watch(
  framework,
  (activeFramework) => {
    if (activeFramework === 'vue' || frameworkModules.value)
      return

    frameworkModulesFailed.value = false
    void loadFrameworkModules()
      .then((modules) => {
        if (!unmounted)
          frameworkModules.value = modules
      })
      .catch(() => {
        if (!unmounted)
          frameworkModulesFailed.value = true
      })
  },
  { immediate: true },
)

const resolvedComponentSlug = computed(() => {
  if (props.component?.trim())
    return props.component.trim().toLowerCase()
  return resolveComponentSlugFromPath(route.path)
})

const compatEntry = computed(() => {
  if (framework.value === 'vue' || !frameworkModules.value)
    return null
  return frameworkModules.value.matrix.getComponentFrameworkEntry(resolvedComponentSlug.value)
})

const activeFrameworkStatus = computed(() => {
  if (framework.value === 'vue')
    return 'ready' as const
  if (!frameworkModules.value)
    return 'ready' as const
  if (!compatEntry.value)
    return 'planned' as const
  return compatEntry.value[framework.value]
})

const activeShowcase = computed(() => {
  if (framework.value === 'vue' || !frameworkModules.value || activeFrameworkStatus.value !== 'ready')
    return null
  return frameworkModules.value.showcases.getFrameworkShowcase(resolvedComponentSlug.value)
})

const shouldMountFrameworkStage = computed(() =>
  framework.value !== 'vue'
  && activeFrameworkStatus.value === 'ready'
  && Boolean(activeShowcase.value),
)

const frameworkStageState = ref<'idle' | 'loading' | 'live' | 'unlinked' | 'error'>('idle')
const codeViewMode = ref<'active' | 'vue'>('active')

watch(
  () => [framework.value, resolvedComponentSlug.value, shouldMountFrameworkStage.value] as const,
  ([nextFramework, nextSlug, nextShouldMount], [prevFramework, prevSlug]) => {
    if (nextFramework !== prevFramework || nextSlug !== prevSlug) {
      frameworkStageState.value = nextShouldMount ? 'loading' : 'idle'
      codeViewMode.value = 'active'
      return
    }
    if (nextShouldMount && frameworkStageState.value === 'idle')
      frameworkStageState.value = 'loading'
  },
)

const isLiveFrameworkRendered = computed(() =>
  shouldMountFrameworkStage.value && frameworkStageState.value === 'live',
)

const shouldRenderVuePreview = computed(() =>
  framework.value === 'vue'
  || !shouldMountFrameworkStage.value
  || frameworkStageState.value === 'unlinked'
  || frameworkStageState.value === 'error',
)

const frameworkBanner = computed<{ tone: 'info' | 'warning', text: string, tier?: string } | null>(() => {
  if (framework.value === 'vue')
    return null

  const modules = frameworkModules.value
  if (!modules) {
    if (!frameworkModulesFailed.value)
      return null
    const meta = DOCS_FRAMEWORK_META[framework.value]
    return {
      tone: 'info',
      text: t('docs.framework.runtimeUnlinked', {
        pkg: meta.packageName,
        framework: meta.shortLabel,
      }),
    }
  }

  const tierText = compatEntry.value
    ? modules.matrix.formatTierDescription(compatEntry.value.tier, localeKey.value)
    : undefined

  if (activeFrameworkStatus.value !== 'ready') {
    if (framework.value === 'react') {
      return {
        tone: 'warning',
        text: t('docs.framework.previewFallbackReact'),
        tier: tierText,
      }
    }

    return {
      tone: 'warning',
      text: activeFrameworkStatus.value === 'unsupported'
        ? t('docs.framework.previewFallbackWcUnsupported')
        : t('docs.framework.previewFallbackWcPlanned'),
      tier: tierText,
    }
  }

  if (frameworkStageState.value === 'unlinked' || frameworkStageState.value === 'error') {
    const meta = DOCS_FRAMEWORK_META[framework.value]
    return {
      tone: 'info',
      text: t('docs.framework.runtimeUnlinked', {
        pkg: meta.packageName,
        framework: meta.shortLabel,
      }),
      tier: tierText,
    }
  }

  return null
})

const htmlEntityMap: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': '\'',
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(lt|gt|amp|quot|#39);/g, match => htmlEntityMap[match] ?? match)
}

const vueCode = computed(() => (props.code ? decodeHtmlEntities(props.code) : ''))

const frameworkSpecificCode = computed(() => {
  if (!activeShowcase.value)
    return ''
  if (framework.value === 'react')
    return activeShowcase.value.reactCode(localeKey.value)
  if (framework.value === 'wc')
    return activeShowcase.value.wcCode(localeKey.value)
  return ''
})

const hasFrameworkCodeSwitch = computed(() =>
  framework.value !== 'vue' && Boolean(frameworkSpecificCode.value) && Boolean(vueCode.value),
)

const resolvedCode = computed(() => {
  if (framework.value !== 'vue' && frameworkSpecificCode.value && codeViewMode.value === 'active')
    return frameworkSpecificCode.value
  return vueCode.value
})

const resolvedCodeLang = computed(() => {
  if (framework.value !== 'vue' && frameworkSpecificCode.value && codeViewMode.value === 'active')
    return DOCS_FRAMEWORK_META[framework.value].codeLang
  return props.codeLang
})

const activeFrameworkMeta = computed(() => DOCS_FRAMEWORK_META[framework.value])

const hasCode = computed(() => Boolean(resolvedCode.value))
const showCode = ref(false)
const demoRenderKey = ref(0)
const isDemoActive = ref(false)
const demoInstanceRef = ref<DemoResetController | null>(null)
const frameworkStageRef = ref<{ resetDemo?: () => void } | null>(null)
const isResetting = ref(false)
const windowBodyRef = ref<HTMLElement | null>(null)
const toggleRowRef = ref<HTMLElement | null>(null)
const demoSectionRef = ref<HTMLElement | null>(null)

const toggleLabel = computed(() => {
  if (showCode.value)
    return t('docs.demo.hideCode')
  return t('docs.demo.showCode')
})

const resetLabel = computed(() => t('docs.demo.reset'))
const inactiveLabel = computed(() => t('docs.demo.loading'))
const loadingLabel = computed(() => t('docs.demo.loading'))
const errorLabel = computed(() => t('docs.demo.loadFailed'))
const notFoundLabel = computed(() => t('docs.demo.notFound'))

async function toggleCode() {
  const row = toggleRowRef.value
  const body = windowBodyRef.value
  // Stuck = held above where the code ends. Collapsing from there would drop
  // the reader somewhere past the demo, so the row keeps its place on screen.
  const rowTop = row?.getBoundingClientRect().top ?? 0
  const wasStuck = showCode.value && !!body && rowTop < body.getBoundingClientRect().bottom - 1

  showCode.value = !showCode.value
  if (!wasStuck || !row)
    return

  await nextTick()
  const shift = row.getBoundingClientRect().top - rowTop
  if (shift < 0)
    window.scrollBy({ top: shift, behavior: 'instant' })
}

async function hardResetDemo() {
  demoRenderKey.value += 1
  await nextTick()
}

async function tryInvokeDemoReset() {
  if (isLiveFrameworkRendered.value && frameworkStageRef.value?.resetDemo) {
    frameworkStageRef.value.resetDemo()
    return true
  }

  const instance = demoInstanceRef.value
  if (!instance)
    return false

  const resetHandler = instance.resetDemo ?? instance.replayDemo ?? instance.reset ?? instance.replay
  if (!resetHandler)
    return false

  await resetHandler.call(instance)
  return true
}

async function resetDemo() {
  if (isResetting.value || !isDemoActive.value)
    return

  isResetting.value = true
  try {
    const handled = await tryInvokeDemoReset()
    if (!handled)
      await hardResetDemo()
  }
  catch {
    await hardResetDemo()
  }
  finally {
    isResetting.value = false
  }
}

function handleDemoInstanceChange(instance: DemoResetController | null) {
  demoInstanceRef.value = instance
}

function handleFrameworkRuntimeState(state: 'loading' | 'live' | 'unlinked' | 'error') {
  frameworkStageState.value = state
}

const DEMO_VIEWPORT_ROOT_MARGIN = '0px'
let cancelQueuedActivation: (() => void) | null = null
let cancelQueuedPrefetch: (() => void) | null = null
let demoVisibilityObserver: IntersectionObserver | null = null
let demoQueued = false

function activateDemo() {
  cancelQueuedActivation = null
  if (!shouldActivateDemo({ demo: props.demo, isActive: isDemoActive.value }))
    return

  isDemoActive.value = true
}

function enqueueDemoLoad() {
  if (demoQueued || !props.demo)
    return
  demoQueued = true
  if (demoVisibilityObserver) {
    demoVisibilityObserver.disconnect()
    demoVisibilityObserver = null
  }

  // The loader download waits in the same idle order as activation, one at a time, so visible
  // demos mount cleanly without turning into a single long task or fetching off-screen demos.
  const demo = props.demo
  cancelQueuedPrefetch = queueDemoPrefetch(() => loadDemoComponent(demo))
  cancelQueuedActivation = queueDemoActivation(activateDemo)
}

onMounted(() => {
  if (!props.demo)
    return

  const target = windowBodyRef.value ?? demoSectionRef.value
  if ('IntersectionObserver' in window && target) {
    const rect = target.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.75 && rect.bottom > 0) {
      enqueueDemoLoad()
      return
    }
    demoVisibilityObserver = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting))
        enqueueDemoLoad()
    }, { rootMargin: DEMO_VIEWPORT_ROOT_MARGIN, threshold: 0 })
    demoVisibilityObserver.observe(target)
    return
  }

  enqueueDemoLoad()
})

onBeforeUnmount(() => {
  unmounted = true
  if (demoVisibilityObserver) {
    demoVisibilityObserver.disconnect()
    demoVisibilityObserver = null
  }
  cancelQueuedPrefetch?.()
  cancelQueuedPrefetch = null
  cancelQueuedActivation?.()
  cancelQueuedActivation = null
})
</script>

<script lang="ts">
type FrameworkMatrixModule = typeof import('~/data/tuffex-framework-matrix')
type FrameworkShowcasesModule = typeof import('~/data/tuffex-framework-showcases')

interface LoadedFrameworkModules {
  matrix: FrameworkMatrixModule
  showcases: FrameworkShowcasesModule
}

let cachedFrameworkModules: LoadedFrameworkModules | null = null
let pendingFrameworkModules: Promise<LoadedFrameworkModules> | null = null

function getCachedFrameworkModules() {
  return cachedFrameworkModules
}

function loadFrameworkModules(): Promise<LoadedFrameworkModules> {
  if (cachedFrameworkModules)
    return Promise.resolve(cachedFrameworkModules)
  if (!pendingFrameworkModules) {
    pendingFrameworkModules = Promise.all([
      import('~/data/tuffex-framework-matrix'),
      import('~/data/tuffex-framework-showcases'),
    ])
      .then(([matrix, showcases]) => {
        cachedFrameworkModules = { matrix, showcases }
        return cachedFrameworkModules
      })
      .catch((error) => {
        pendingFrameworkModules = null
        throw error
      })
  }
  return pendingFrameworkModules
}
</script>

<template>
  <section ref="demoSectionRef" class="tuff-demo">
    <header v-if="props.title || props.description" class="tuff-demo__header">
      <h3 v-if="props.title" class="tuff-demo__title">
        {{ props.title }}
      </h3>
      <p v-if="props.description" class="tuff-demo__desc">
        {{ props.description }}
      </p>
    </header>
    <div class="tuff-demo__window">
      <div class="tuff-demo__window-bar not-prose">
        <div class="tuff-demo__bar-left">
          <div class="tuff-demo__dots" aria-hidden="true">
            <span class="tuff-demo__dot is-red" />
            <span class="tuff-demo__dot is-yellow" />
            <span class="tuff-demo__dot is-green" />
          </div>
          <span
            v-if="framework !== 'vue'"
            class="tuff-demo__fw-badge"
            :data-live="isLiveFrameworkRendered ? 'true' : 'false'"
            :data-status="activeFrameworkStatus"
          >
            <span class="tuff-demo__fw-badge-icon" :class="activeFrameworkMeta.icon" aria-hidden="true" />
            <span>{{ activeFrameworkMeta.shortLabel }}</span>
            <span v-if="isLiveFrameworkRendered" class="tuff-demo__fw-live">
              {{ t('docs.framework.liveRuntime') }}
            </span>
          </span>
        </div>
        <div class="tuff-demo__window-actions">
          <button
            type="button"
            class="tuff-demo__reset-btn"
            :aria-label="resetLabel"
            :disabled="isResetting || !isDemoActive"
            @click="resetDemo"
          >
            <span class="tuff-demo__reset-icon i-carbon-renew" aria-hidden="true" />
            {{ resetLabel }}
          </button>
        </div>
      </div>
      <div ref="windowBodyRef" class="tuff-demo__window-body">
        <div class="tuff-demo__preview">
          <div
            v-if="frameworkBanner"
            class="tuff-demo__fw-banner not-prose"
            :data-tone="frameworkBanner.tone"
            role="status"
          >
            <span
              class="tuff-demo__fw-banner-icon"
              :class="frameworkBanner.tone === 'warning' ? 'i-carbon-warning-alt' : 'i-carbon-information'"
              aria-hidden="true"
            />
            <span class="tuff-demo__fw-banner-text">{{ frameworkBanner.text }}</span>
            <span v-if="frameworkBanner.tier" class="tuff-demo__fw-banner-tier">
              {{ frameworkBanner.tier }}
            </span>
          </div>
          <ClientOnly>
            <LazyDocsFrameworkLiveStage
              v-if="isDemoActive && shouldMountFrameworkStage && framework === 'wc' && resolvedComponentSlug"
              ref="frameworkStageRef"
              :component-slug="resolvedComponentSlug"
              :locale="localeKey"
              :render-key="demoRenderKey"
              @runtime-state="handleFrameworkRuntimeState"
            />
            <LazyDocsReactMount
              v-else-if="isDemoActive && shouldMountFrameworkStage && framework === 'react' && resolvedComponentSlug"
              ref="frameworkStageRef"
              :component-slug="resolvedComponentSlug"
              :locale="localeKey"
              :render-key="demoRenderKey"
              @runtime-state="handleFrameworkRuntimeState"
            />
            <TuffDemoClientRenderer
              v-if="isDemoActive && shouldRenderVuePreview"
              :demo="props.demo"
              :is-active="isDemoActive"
              :render-key="demoRenderKey"
              :inactive-label="inactiveLabel"
              :loading-label="loadingLabel"
              :error-label="errorLabel"
              :not-found-label="notFoundLabel"
              @instance-change="handleDemoInstanceChange"
            />
            <div v-else-if="!isDemoActive" class="tuff-demo__placeholder">
              <span class="tuff-demo__placeholder-text">{{ inactiveLabel }}</span>
            </div>
            <template #fallback>
              <div class="tuff-demo__placeholder">
                {{ inactiveLabel }}
              </div>
            </template>
          </ClientOnly>
        </div>
        <div v-if="hasCode" class="tuff-demo__code" :class="{ 'is-open': showCode }">
          <div class="tuff-demo__code-body">
            <div class="tuff-demo__code-body-inner">
              <div v-if="hasFrameworkCodeSwitch && showCode" class="tuff-demo__code-tabs not-prose" role="tablist">
                <button
                  type="button"
                  role="tab"
                  class="tuff-demo__code-tab"
                  :class="{ 'is-active': codeViewMode === 'active' }"
                  :aria-selected="codeViewMode === 'active'"
                  @click="codeViewMode = 'active'"
                >
                  <span :class="activeFrameworkMeta.icon" aria-hidden="true" />
                  {{ t('docs.framework.codeTabActive', { framework: activeFrameworkMeta.shortLabel }) }}
                </button>
                <button
                  type="button"
                  role="tab"
                  class="tuff-demo__code-tab"
                  :class="{ 'is-active': codeViewMode === 'vue' }"
                  :aria-selected="codeViewMode === 'vue'"
                  @click="codeViewMode = 'vue'"
                >
                  <span class="i-logos-vue" aria-hidden="true" />
                  {{ t('docs.framework.codeTabVue') }}
                </button>
              </div>
              <LazyEmbeddedCodeBlock
                v-if="hasCode && showCode"
                embedded
                :lang="resolvedCodeLang"
                :code="resolvedCode"
              />
            </div>
          </div>
        </div>
      </div>
      <div v-if="hasCode" ref="toggleRowRef" class="tuff-demo__toggle-row not-prose">
        <button type="button" class="tuff-demo__toggle-btn" :aria-expanded="showCode" @click="toggleCode">
          <span class="tuff-demo__toggle-icon i-carbon-chevron-down" :class="{ 'is-open': showCode }" />
          {{ toggleLabel }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tuff-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
  --tuff-demo-window-bg: var(--tx-bg-color);
  --tuff-demo-window-border: var(--tx-border-color-light);
  /* --tuff-demo-window-shadow: var(--tx-box-shadow); */
  --tuff-demo-divider: var(--tx-border-color-lighter);
  --tuff-demo-bar-bg-start: var(--tx-bg-color);
  --tuff-demo-bar-bg-end: var(--tx-fill-color-light);
  --tuff-demo-preview-bg: var(--tx-bg-color);
  --tuff-demo-row-bg: var(--tx-bg-color);
  --tuff-demo-code-bg-start: var(--tx-fill-color);
  --tuff-demo-code-bg-end: var(--tx-fill-color-light);
}

.tuff-demo__header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 0;
}

.tuff-demo__title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.tuff-demo__desc {
  font-size: 14px;
  color: var(--tx-text-color-secondary);
  margin: 0;
}

.tuff-demo__window {
  border-radius: 26px;
  border: 1px solid var(--tuff-demo-window-border);
  background: var(--tuff-demo-window-bg);
  box-shadow: var(--tuff-demo-window-shadow);
  overflow: hidden;
  /* clip still rounds the corners, but unlike hidden it is not a scroll
     container, which would keep the toggle row from sticking to the viewport */
  overflow: clip;
}

.tuff-demo__window-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--tuff-demo-divider);
  background: linear-gradient(90deg, var(--tuff-demo-bar-bg-start), var(--tuff-demo-bar-bg-end));
}

.tuff-demo__bar-left {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.tuff-demo__fw-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}

.tuff-demo__fw-badge[data-live='true'] {
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, var(--tx-bg-color, #ffffff));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-success, #67c23a) 35%, transparent);
  color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
}

.tuff-demo__fw-badge-icon {
  font-size: 12px;
}

.tuff-demo__fw-live {
  padding-left: 4px;
  border-left: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tuff-demo__window-actions {
  display: inline-flex;
  align-items: center;
}

.tuff-demo__reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 7px 10px;
}

.tuff-demo__reset-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tx-color-primary) 10%, transparent);
  color: var(--tx-color-primary);
}

.tuff-demo__reset-btn:disabled {
  cursor: default;
  opacity: 0.45;
}

.tuff-demo__reset-icon {
  font-size: 12px;
}

.tuff-demo__dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tuff-demo__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
}

.tuff-demo__dot.is-red {
  background: var(--tx-color-danger);
}

.tuff-demo__dot.is-yellow {
  background: var(--tx-color-warning);
}

.tuff-demo__dot.is-green {
  background: var(--tx-color-success);
}

.tuff-demo__window-body {
  display: flex;
  flex-direction: column;
}

.tuff-demo__preview {
  padding: 28px;
  background: var(--tuff-demo-preview-bg);
}

.tuff-demo__fw-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 1.45;
}

.tuff-demo__fw-banner[data-tone='warning'] {
  background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 10%, var(--tx-bg-color, #ffffff));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-warning, #e6a23c) 30%, transparent);
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--tx-text-color-primary, #303133));
}

.tuff-demo__fw-banner-icon {
  flex: none;
  font-size: 14px;
}

.tuff-demo__fw-banner-text {
  flex: 1;
  min-width: 180px;
  font-weight: 500;
}

.tuff-demo__fw-banner-tier {
  flex: none;
  padding: 2px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 6%, transparent);
  color: var(--tx-text-color-regular, #606266);
  font-size: 11px;
  font-weight: 500;
}

.tuff-demo__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 96px;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
  text-align: center;
  padding: 18px 0;
}

.tuff-demo__placeholder-text {
  line-height: 1.5;
}

.tuff-demo__code {
  margin-top: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  color: var(--tx-text-color-primary);
  align-items: stretch;
  width: 100%;
}

.tuff-demo__code-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px 0;
}

.tuff-demo__code-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.tuff-demo__code-tab:hover {
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 6%, transparent);
  color: var(--tx-text-color-primary, #303133);
}

.tuff-demo__code-tab.is-active {
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-light, #e4e7ed);
  color: var(--tx-text-color-primary, #303133);
  font-weight: 600;
}

/*
 * Sticks to the bottom of the viewport while the window runs past it, so long
 * code can be hidden again without scrolling to its end. The docs layout blurs
 * and fades the last strip of the viewport, which this row cannot rise above:
 * only the row's empty bottom padding dips into the strip, and the ::after
 * carries its background on to the viewport edge, so no code shows through
 * below the button. Unstuck, the window's overflow clips the ::after.
 */
.tuff-demo__toggle-row {
  position: sticky;
  bottom: max(0px, calc(var(--docs-edge-bottom-height, 0px) - 20px));
  z-index: 2;
  display: flex;
  justify-content: center;
  padding: 16px 18px 20px;
  border-top: 1px solid var(--tuff-demo-divider);
  background: var(--tuff-demo-row-bg);
}

.tuff-demo__toggle-row::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: var(--docs-edge-bottom-height, 0px);
  background: var(--tuff-demo-row-bg);
  pointer-events: none;
}

.tuff-demo__toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  padding: 8px 12px;
}

.tuff-demo__toggle-btn:hover {
  background: color-mix(in srgb, var(--tx-color-primary) 10%, transparent);
  color: var(--tx-color-primary);
}

.tuff-demo__toggle-icon {
  font-size: 12px;
  transition: transform 0.2s ease;
}

.tuff-demo__toggle-icon.is-open {
  transform: rotate(180deg);
}

.tuff-demo__code-body {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.25s ease, opacity 0.25s ease;
  width: 100%;
}

.tuff-demo__code.is-open .tuff-demo__code-body {
  grid-template-rows: 1fr;
  opacity: 1;
}

.tuff-demo__code-body-inner {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--tuff-demo-divider);
  background: linear-gradient(180deg, var(--tuff-demo-code-bg-start), var(--tuff-demo-code-bg-end));
}

.tuff-demo__code:not(.is-open) .tuff-demo__code-body-inner {
  border-top-color: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .tuff-demo__toggle-icon,
  .tuff-demo__code-body {
    transition: none;
  }
}

:deep(.tuff-demo-row) {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
</style>
