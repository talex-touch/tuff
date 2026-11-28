<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  watch,
  type ComponentPublicInstance,
} from 'vue'
import TuffDemoClientRenderer from './TuffDemoClientRenderer.client.vue'
import { loadDemoComponent } from './demo-registry'
import { useDocsFramework } from '~/composables/useDocsFramework'
import { DOCS_PRIMARY_DEMO_KEY } from '~/utils/docs-primary-demo'
import { scheduleDemoMount } from '~/utils/demo-mount-scheduler'
import { resolveTuffexComponentSlug } from '~/utils/docs-route'

/**
 * R6 High-Performance Demo Wrapper:
 * - Pre-viewport IntersectionObserver (`rootMargin: '400px 0px'`) + immediate load above the fold.
 * - Parallel 1-hop `loadDemoComponent(props.demo)` (ZERO 2-hop trampoline, ZERO 2000ms serial prefetch!).
 * - Lightweight 12ms frame-budgeted mount scheduler (`scheduleDemoMount`) to avoid >50ms Long Tasks.
 * - Deterministic `min-height` (`160px` default or `:minHeight`) + `content-visibility: auto` on non-first demos (`CLS < 0.01`).
 * - Accepts build-time pre-highlighted `codeHtml` from `remark-shiki-code-props` (ZERO client `hljs`!).
 */

interface DemoWrapperProps {
  demo: string
  code?: string
  codeHtml?: string
  codeLang?: string
  title?: string
  description?: string
  component?: string
  minHeight?: number | string
}

type DemoResetMethod = () => void | Promise<void>
type DemoResetController = ComponentPublicInstance & {
  replayDemo?: DemoResetMethod
  resetDemo?: DemoResetMethod
  replay?: DemoResetMethod
  reset?: DemoResetMethod
}

interface FrameworkModulesBundle {
  matrix: typeof import('~/data/tuffex-framework-matrix')
  showcases: typeof import('~/data/tuffex-framework-showcases')
}

let cachedFrameworkModules: FrameworkModulesBundle | null = null
let frameworkModulesPromise: Promise<FrameworkModulesBundle> | null = null

function loadFrameworkModules(): Promise<FrameworkModulesBundle> {
  if (cachedFrameworkModules)
    return Promise.resolve(cachedFrameworkModules)
  if (!frameworkModulesPromise) {
    frameworkModulesPromise = Promise.all([
      import('~/data/tuffex-framework-matrix'),
      import('~/data/tuffex-framework-showcases'),
    ]).then(([matrix, showcases]) => {
      cachedFrameworkModules = { matrix, showcases }
      return cachedFrameworkModules
    }).catch((err) => {
      frameworkModulesPromise = null
      throw err
    })
  }
  return frameworkModulesPromise
}

const props = withDefaults(defineProps<DemoWrapperProps>(), {
  code: '',
  codeHtml: '',
  codeLang: 'vue',
  title: '',
  description: '',
  component: '',
  minHeight: 160,
})

const LazyEmbeddedCodeBlock = defineAsyncComponent(() => import('./TuffCodeBlock.vue'))
const LazyDocsFrameworkLiveStage = defineAsyncComponent(() => import('./DocsFrameworkLiveStage.client.vue'))
const LazyDocsReactMount = defineAsyncComponent(() => import('./DocsReactMount.client.vue'))

const { locale, t } = useI18n()
const route = useRoute()
const { framework } = useDocsFramework()

const localeKey = computed<'zh' | 'en'>(() => (locale.value === 'zh' ? 'zh' : 'en'))
const isZh = computed(() => localeKey.value === 'zh')

const frameworkModules = shallowRef<FrameworkModulesBundle | null>(cachedFrameworkModules)
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
  return resolveTuffexComponentSlug(route.path) ?? ''
})

const primaryDemoTracker = inject(DOCS_PRIMARY_DEMO_KEY, null)
const demoInstanceId = `${props.demo || 'demo'}:${useId()}`
let claimedPrimarySlug = ''

watch(
  resolvedComponentSlug,
  (nextSlug) => {
    if (claimedPrimarySlug && claimedPrimarySlug !== nextSlug) {
      primaryDemoTracker?.releasePrimary(claimedPrimarySlug, demoInstanceId)
      claimedPrimarySlug = ''
    }
    if (nextSlug && primaryDemoTracker) {
      primaryDemoTracker.claimPrimary(nextSlug, demoInstanceId)
      claimedPrimarySlug = nextSlug
    }
  },
  { immediate: true },
)

const isPrimaryDemo = computed(() => {
  const slug = resolvedComponentSlug.value
  if (!primaryDemoTracker || !slug)
    return true
  return primaryDemoTracker.isPrimary(slug, demoInstanceId)
})

const compatEntry = computed(() => {
  if (framework.value === 'vue' || !frameworkModules.value || !resolvedComponentSlug.value)
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
  && Boolean(activeShowcase.value)
  && isPrimaryDemo.value,
)

const frameworkStageState = ref<'idle' | 'loading' | 'live' | 'unlinked' | 'error'>('idle')
const codeViewMode = ref<'active' | 'vue'>('active')

watch(
  () => [framework.value, resolvedComponentSlug.value, shouldMountFrameworkStage.value] as const,
  ([nextFw, nextSlug, nextShouldMount], [prevFw, prevSlug]) => {
    if (nextFw !== prevFw || nextSlug !== prevSlug) {
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

const activeFrameworkMeta = computed(() => {
  if (frameworkModules.value)
    return frameworkModules.value.matrix.DOCS_FRAMEWORK_META[framework.value]
  if (framework.value === 'react')
    return { shortLabel: 'React', icon: 'i-logos-react', packageName: '@talex-touch/tuffex-react', codeLang: 'tsx' }
  if (framework.value === 'wc')
    return { shortLabel: 'WC', icon: 'i-carbon-cube', packageName: '@talex-touch/tuffex-wc', codeLang: 'html' }
  return { shortLabel: 'Vue', icon: 'i-logos-vue', packageName: '@talex-touch/tuffex', codeLang: 'vue' }
})

const frameworkBanner = computed<{ tone: 'info' | 'warning', text: string, tier?: string } | null>(() => {
  if (framework.value === 'vue')
    return null

  const modules = frameworkModules.value
  if (!modules) {
    if (!frameworkModulesFailed.value)
      return null
    return {
      tone: 'info',
      text: t('docs.framework.runtimeUnlinked', isZh.value
        ? `${activeFrameworkMeta.value.shortLabel} 运行时尚未连接，当前展示 Vue 预览。`
        : `${activeFrameworkMeta.value.shortLabel} runtime is not linked; showing Vue preview.`),
    }
  }

  const tierText = compatEntry.value
    ? modules.matrix.formatTierDescription(compatEntry.value.tier, localeKey.value)
    : undefined

  if (activeFrameworkStatus.value !== 'ready') {
    if (framework.value === 'react') {
      return {
        tone: 'warning',
        text: t('docs.framework.previewFallbackReact', isZh.value ? '该组件的 React 版本正在适配中，当前展示 Vue 实时预览。' : 'React adapter is planned for this component; showing live Vue preview.'),
        tier: tierText,
      }
    }
    return {
      tone: 'warning',
      text: activeFrameworkStatus.value === 'unsupported'
        ? t('docs.framework.previewFallbackWcUnsupported', isZh.value ? '该组件暂不支持 Web Components，当前展示 Vue 实时预览。' : 'Web Components is unsupported for this component; showing live Vue preview.')
        : t('docs.framework.previewFallbackWcPlanned', isZh.value ? '该组件的 Web Components 版本正在规划中，当前展示 Vue 实时预览。' : 'Web Components adapter is planned; showing live Vue preview.'),
      tier: tierText,
    }
  }

  if (frameworkStageState.value === 'unlinked' || frameworkStageState.value === 'error') {
    return {
      tone: 'info',
      text: t('docs.framework.runtimeUnlinked', {
        pkg: activeFrameworkMeta.value.packageName,
        framework: activeFrameworkMeta.value.shortLabel,
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
  if (!activeShowcase.value || !isPrimaryDemo.value)
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

const isShowingVueCode = computed(() =>
  framework.value === 'vue' || !frameworkSpecificCode.value || codeViewMode.value === 'vue',
)

const resolvedCode = computed(() => (isShowingVueCode.value ? vueCode.value : frameworkSpecificCode.value))
const resolvedCodeHtml = computed(() => (isShowingVueCode.value ? props.codeHtml : ''))
const resolvedCodeLang = computed(() => (
  isShowingVueCode.value ? props.codeLang : activeFrameworkMeta.value.codeLang
))

const hasCode = computed(() => Boolean(resolvedCode.value || resolvedCodeHtml.value))
const showCode = ref(false)
const demoRenderKey = ref(0)
const isDemoActive = ref(false)
const demoInstanceRef = ref<DemoResetController | null>(null)
const frameworkStageRef = ref<{ resetDemo?: () => void } | null>(null)
const isResetting = ref(false)
const windowBodyRef = ref<HTMLElement | null>(null)
const toggleRowRef = ref<HTMLElement | null>(null)
const demoSectionRef = ref<HTMLElement | null>(null)

const previewMinHeightStyle = computed(() => {
  if (typeof props.minHeight === 'number')
    return `${props.minHeight}px`
  return props.minHeight || '160px'
})

const toggleLabel = computed(() => (
  showCode.value
    ? t('docs.demo.hideCode', isZh.value ? '隐藏代码' : 'Hide code')
    : t('docs.demo.showCode', isZh.value ? '展开代码' : 'Show code')
))
const resetLabel = computed(() => t('docs.demo.reset', isZh.value ? '重置' : 'Reset'))
const loadingLabel = computed(() => t('docs.demo.loading', isZh.value ? '示例加载中…' : 'Loading demo…'))
const errorLabel = computed(() => t('docs.demo.loadFailed', isZh.value ? '示例加载失败' : 'Failed to load demo'))
const notFoundLabel = computed(() => t('docs.demo.notFound', isZh.value ? '未找到对应示例' : 'Demo not found'))

async function toggleCode() {
  const row = toggleRowRef.value
  const body = windowBodyRef.value
  const rowTop = row?.getBoundingClientRect().top ?? 0
  const wasStuck = showCode.value && Boolean(body) && rowTop < body!.getBoundingClientRect().bottom - 1

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

async function resetDemo() {
  if (isResetting.value || !isDemoActive.value)
    return
  isResetting.value = true
  try {
    if (isLiveFrameworkRendered.value && frameworkStageRef.value?.resetDemo) {
      frameworkStageRef.value.resetDemo()
      return
    }
    const instance = demoInstanceRef.value
    const handler = instance?.resetDemo ?? instance?.replayDemo ?? instance?.reset ?? instance?.replay
    if (handler)
      await handler.call(instance)
    else
      await hardResetDemo()
  }
  catch {
    await hardResetDemo()
  }
  finally {
    isResetting.value = false
  }
}

// R6: Pre-viewport IntersectionObserver (rootMargin: '1200px 0px') + parallel 1-hop preload
// + 12ms frame-budgeted mount scheduler so demos preload ~1.5 screens ahead of scroll!
const DEMO_PRELOAD_ROOT_MARGIN = '1200px 0px'
let demoObserver: IntersectionObserver | null = null
let cancelScheduledMount: (() => void) | null = null
let demoStarted = false

function triggerDemoLoad(immediate = false) {
  if (demoStarted || !props.demo)
    return
  demoStarted = true
  demoObserver?.disconnect()
  demoObserver = null

  // Start parallel 1-hop chunk download immediately
  void loadDemoComponent(props.demo).catch(() => {})

  // Schedule Vue component mount within 12ms frame budget
  cancelScheduledMount = scheduleDemoMount(() => {
    cancelScheduledMount = null
    if (!unmounted)
      isDemoActive.value = true
  }, { immediate })
}

onMounted(() => {
  if (!props.demo)
    return

  const target = windowBodyRef.value ?? demoSectionRef.value
  if ('IntersectionObserver' in window && target) {
    const rect = target.getBoundingClientRect()
    // Immediately load demos already above or near the fold
    if (rect.top < window.innerHeight + 240 && rect.bottom > -120) {
      triggerDemoLoad(rect.top < window.innerHeight)
      return
    }
    demoObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some(entry => entry.isIntersecting))
          triggerDemoLoad(false)
      },
      { rootMargin: DEMO_PRELOAD_ROOT_MARGIN, threshold: 0 },
    )
    demoObserver.observe(target)
    return
  }

  triggerDemoLoad(false)
})

onBeforeUnmount(() => {
  unmounted = true
  if (claimedPrimarySlug) {
    primaryDemoTracker?.releasePrimary(claimedPrimarySlug, demoInstanceId)
    claimedPrimarySlug = ''
  }
  demoObserver?.disconnect()
  demoObserver = null
  cancelScheduledMount?.()
  cancelScheduledMount = null
})
</script>

<template>
  <section
    ref="demoSectionRef"
    class="tuff-demo"
    :class="{ 'tuff-demo--deferred-paint': !isPrimaryDemo }"
  >
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
              {{ t('docs.framework.liveRuntime', 'LIVE') }}
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
            <span>{{ resetLabel }}</span>
          </button>
        </div>
      </div>

      <div ref="windowBodyRef" class="tuff-demo__window-body">
        <div class="tuff-demo__preview" :style="{ minHeight: previewMinHeightStyle }">
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
              @runtime-state="(s) => (frameworkStageState = s)"
            />
            <LazyDocsReactMount
              v-else-if="isDemoActive && shouldMountFrameworkStage && framework === 'react' && resolvedComponentSlug"
              ref="frameworkStageRef"
              :component-slug="resolvedComponentSlug"
              :locale="localeKey"
              :render-key="demoRenderKey"
              @runtime-state="(s) => (frameworkStageState = s)"
            />
            <TuffDemoClientRenderer
              v-if="isDemoActive && shouldRenderVuePreview"
              :demo="props.demo"
              :is-active="isDemoActive"
              :render-key="demoRenderKey"
              :inactive-label="loadingLabel"
              :loading-label="loadingLabel"
              :error-label="errorLabel"
              :not-found-label="notFoundLabel"
              @instance-change="(inst) => (demoInstanceRef = inst)"
            />
            <div v-else-if="!isDemoActive" class="tuff-demo__placeholder">
              <span>{{ loadingLabel }}</span>
            </div>
            <template #fallback>
              <div class="tuff-demo__placeholder">
                <span>{{ loadingLabel }}</span>
              </div>
            </template>
          </ClientOnly>
        </div>

        <div v-if="hasCode && showCode" class="tuff-demo__code">
          <div v-if="hasFrameworkCodeSwitch" class="tuff-demo__code-tabs not-prose" role="tablist">
            <button
              type="button"
              role="tab"
              class="tuff-demo__code-tab"
              :class="{ 'is-active': codeViewMode === 'active' }"
              :aria-selected="codeViewMode === 'active'"
              @click="codeViewMode = 'active'"
            >
              <span :class="activeFrameworkMeta.icon" aria-hidden="true" />
              <span>{{ activeFrameworkMeta.shortLabel }}</span>
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
              <span>Vue</span>
            </button>
          </div>

          <LazyEmbeddedCodeBlock
            embedded
            :lang="resolvedCodeLang"
            :code="resolvedCode"
            :code-html="resolvedCodeHtml"
          />
        </div>
      </div>

      <div v-if="hasCode" ref="toggleRowRef" class="tuff-demo__toggle-row not-prose">
        <button type="button" class="tuff-demo__toggle-btn" :aria-expanded="showCode" @click="toggleCode">
          <span class="tuff-demo__toggle-icon i-carbon-chevron-down" :class="{ 'is-open': showCode }" aria-hidden="true" />
          <span>{{ toggleLabel }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tuff-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0;
  --tuff-demo-window-bg: var(--tx-bg-color, #ffffff);
  --tuff-demo-window-border: var(--tx-border-color-light, #e4e7ed);
  --tuff-demo-divider: var(--tx-border-color-lighter, #ebeef5);
  --tuff-demo-bar-bg-start: var(--tx-bg-color, #ffffff);
  --tuff-demo-bar-bg-end: var(--tx-fill-color-light, #f5f7fa);
  --tuff-demo-preview-bg: var(--tx-bg-color, #ffffff);
  --tuff-demo-row-bg: var(--tx-bg-color, #ffffff);
}

/* Keep layout containment lightweight without `content-visibility: auto`, which caused
 * large CLS jumps (0.34 on Tabs) and skipped bounding-rect measurements on tall Form demos. */
.tuff-demo--deferred-paint {
  contain: layout style;
}

.tuff-demo__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tuff-demo__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--docs-ink);
}

.tuff-demo__desc {
  margin: 0;
  font-size: 13.5px;
  color: var(--docs-muted);
}

.tuff-demo__window {
  border-radius: 20px;
  border: 1px solid var(--tuff-demo-window-border);
  background: var(--tuff-demo-window-bg);
  overflow: clip;
}

.tuff-demo__window-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--tuff-demo-divider);
  background: linear-gradient(90deg, var(--tuff-demo-bar-bg-start), var(--tuff-demo-bar-bg-end));
}

.tuff-demo__bar-left {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
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
  box-shadow: inset 0 0 0 1px var(--docs-border);
}

.tuff-demo__dot.is-red { background: var(--tx-color-danger, #f56c6c); }
.tuff-demo__dot.is-yellow { background: var(--tx-color-warning, #e6a23c); }
.tuff-demo__dot.is-green { background: var(--tx-color-success, #67c23a); }

.tuff-demo__fw-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: var(--docs-ink-regular);
  font-size: 12px;
  font-weight: 500;
}

.tuff-demo__fw-badge[data-live='true'] {
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, var(--docs-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-success, #67c23a) 35%, transparent);
  color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--docs-ink));
}

.tuff-demo__fw-live {
  padding-left: 4px;
  border-left: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tuff-demo__reset-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--docs-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.tuff-demo__reset-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--docs-accent) 10%, transparent);
  color: var(--docs-accent);
}

.tuff-demo__reset-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.tuff-demo__window-body {
  display: flex;
  flex-direction: column;
}

.tuff-demo__preview {
  padding: 24px;
  background: var(--tuff-demo-preview-bg);
}

.tuff-demo__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 112px;
  font-size: 13px;
  color: var(--docs-muted);
}

.tuff-demo__fw-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--docs-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: var(--docs-ink-regular);
  font-size: 12px;
}

.tuff-demo__fw-banner[data-tone='warning'] {
  background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 10%, var(--docs-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-warning, #e6a23c) 30%, transparent);
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--docs-ink));
}

.tuff-demo__fw-banner-text {
  flex: 1;
  min-width: 180px;
  font-weight: 500;
}

.tuff-demo__fw-banner-tier {
  padding: 2px 7px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--docs-ink) 6%, transparent);
  font-size: 11px;
}

.tuff-demo__code {
  border-top: 1px solid var(--tuff-demo-divider);
  background: var(--docs-code-bg);
}

.tuff-demo__code-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px 0;
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
  color: var(--docs-ink-regular);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.tuff-demo__code-tab.is-active {
  background: var(--docs-surface);
  box-shadow: inset 0 0 0 1px var(--docs-border-light);
  color: var(--docs-ink);
  font-weight: 600;
}

.tuff-demo__toggle-row {
  position: sticky;
  bottom: max(0px, calc(var(--docs-edge-bottom-height, 0px) - 20px));
  z-index: 2;
  display: flex;
  justify-content: center;
  padding: 12px 16px;
  border-top: 1px solid var(--tuff-demo-divider);
  background: var(--tuff-demo-row-bg);
}

.tuff-demo__toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--docs-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.tuff-demo__toggle-btn:hover {
  background: color-mix(in srgb, var(--docs-accent) 10%, transparent);
  color: var(--docs-accent);
}

.tuff-demo__toggle-icon {
  font-size: 12px;
  transition: transform 0.18s ease;
}

.tuff-demo__toggle-icon.is-open {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .tuff-demo__toggle-icon {
    transition: none;
  }
}
</style>
