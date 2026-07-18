<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

const DocsDrawer = defineAsyncComponent(() => import('~/components/ui/Drawer.vue'))
const LazyDocsAsideCards = defineAsyncComponent(() => import('~/components/docs/DocsAsideCards.vue'))
const LazyDocsAsideCardsShell = defineAsyncComponent(() => import('~/components/docs/DocsAsideCardsShell.vue'))
const LazyDocsOutline = defineAsyncComponent(() => import('~/components/DocsOutline.vue'))
const LazyBackToTop = defineAsyncComponent(() => import('~/components/ui/BackToTop.vue'))
const LazyTuffFooter = defineAsyncComponent(() => import('~/components/TuffFooter.vue'))
const TuffexDocsHeroBackground = defineAsyncComponent(() => import('~/components/docs/TuffexDocsHeroBackground.vue'))
const BACK_TO_TOP_MOUNT_SCROLL_Y = 240
const DOCS_FOOTER_ROOT_MARGIN = '1200px 0px'
const DOCS_ASIDE_SHELL_MOUNT_DELAY_MS = 2400
const DOCS_ASIDE_SHELL_IDLE_TIMEOUT_MS = 3600
const DOCS_OUTLINE_MOUNT_DELAY_MS = 2000
const DOCS_OUTLINE_IDLE_TIMEOUT_MS = 3200
const TUFFEX_DOCS_BACKGROUND_IDLE_TIMEOUT_MS = 2200
const TUFFEX_DOCS_BACKGROUND_INTENT_EVENTS = ['scroll', 'pointerdown', 'keydown', 'touchstart'] as const

const { t } = useI18n()
const route = useRoute()
const docsFooterSentinelRef = ref<HTMLElement | null>(null)
const sidebarVisible = ref(false)
const outlineVisible = ref(false)
const sidebarDrawerMounted = ref(false)
const outlineDrawerMounted = ref(false)
const shouldMountDocsAsideCards = ref(false)
const shouldMountDocsAsideShell = ref(false)
const shouldMountDocsOutline = ref(false)
const docsAssistantShellTriggerRef = ref<HTMLElement | null>(null)
const docsAssistantOpenRequest = ref(0)
const docsAssistantSource = shallowRef<HTMLElement | null>(null)
const docsAssistantContextRequestState = useState<number>('docs-assistant-context-request', () => 0)
const shouldMountDocsFooter = ref(false)
const shouldMountBackToTop = ref(false)
const shouldMountTuffexBackground = ref(false)
let docsFooterObserver: IntersectionObserver | null = null
let backToTopFrameId: number | null = null
let docsAsideShellTimer: ReturnType<typeof setTimeout> | null = null
let docsAsideShellIdleId: number | null = null
let docsAsideShellFrameId: number | null = null
let docsOutlineTimer: ReturnType<typeof setTimeout> | null = null
let docsOutlineIdleId: number | null = null
let docsOutlineFrameId: number | null = null
let tuffexBackgroundIdleId: number | null = null
let tuffexBackgroundFrameId: number | null = null
let tuffexBackgroundIntentDisposers: Array<() => void> = []
const outlinePublicState = useState<{ hasOutline: boolean, loading: boolean }>('docs-outline-state', () => ({
  hasOutline: false,
  loading: false,
}))
const outlineTocState = useState<any[]>('docs-toc', () => [])
const outlineLoadingState = useState<boolean>('docs-outline-loading', () => false)
const docMetaState = useState<Record<string, any>>('docs-meta', () => ({}))
const assistantAriaLabel = computed(() => t('docs.assistant.open'))
const docsAsideAiNoticeTitle = computed(() => t('docs.aiNotice.title'))
const docsAsideAiNoticeDescription = computed(() => t('docs.aiNotice.description'))
const shouldShowAsideOutline = computed(() =>
  outlinePublicState.value.hasOutline
  || outlinePublicState.value.loading
  || outlineTocState.value.length > 0
  || outlineLoadingState.value,
)

type DocsAsideSyncStatusKey = 'not_started' | 'in_progress' | 'migrated' | 'verified'

const DOCS_ASIDE_SYNC_STATUS_ALIASES: Record<string, DocsAsideSyncStatusKey> = {
  未迁移: 'not_started',
  迁移中: 'in_progress',
  已迁移: 'migrated',
  已确认: 'verified',
  not_started: 'not_started',
  in_progress: 'in_progress',
  migrated: 'migrated',
  verified: 'verified',
}

const normalizedDocsPath = computed(() => {
  const path = route.path || '/'
  const trimmed = path.replace(/^\/(en|zh)(?=\/|$)/i, '')
  return trimmed || '/'
})

const isTuffexDocs = computed(() => {
  const path = normalizedDocsPath.value
  return path.startsWith('/docs/dev/components') || path.startsWith('/docs/dev/tools/tuffex')
})

const isTutorialDocs = computed(() => {
  const path = normalizedDocsPath.value
  return path === '/docs/guide' || path.startsWith('/docs/guide/')
})

const docsAsideSyncStatus = computed<DocsAsideSyncStatusKey>(() => {
  if (docMetaState.value?.verified === true)
    return 'verified'
  const raw = typeof docMetaState.value?.syncStatus === 'string'
    ? docMetaState.value.syncStatus.trim()
    : ''
  return DOCS_ASIDE_SYNC_STATUS_ALIASES[raw] ?? 'not_started'
})

const shouldShowDocsAsideAiNotice = computed(() => {
  const path = typeof docMetaState.value?.path === 'string' ? docMetaState.value.path : ''
  return path.includes('/docs/dev/components/')
    && docsAsideSyncStatus.value === 'migrated'
})

function mountTuffexBackground() {
  if (!isTuffexDocs.value)
    return
  shouldMountTuffexBackground.value = true
}

function openSidebarDrawer() {
  sidebarDrawerMounted.value = true
  sidebarVisible.value = true
}

function openOutlineDrawer() {
  outlineDrawerMounted.value = true
  mountDocsOutline()
  outlineVisible.value = true
}

function openDocsAssistantFromShell(source: HTMLElement | null) {
  docsAssistantSource.value = source
  shouldMountDocsAsideCards.value = true
  mountDocsAsideShell()
  docsAssistantContextRequestState.value += 1
  docsAssistantOpenRequest.value += 1
}

function openDocsAssistantFromPlaceholder() {
  openDocsAssistantFromShell(docsAssistantShellTriggerRef.value)
}

function clearDocsFooterObserver() {
  if (docsFooterObserver) {
    docsFooterObserver.disconnect()
    docsFooterObserver = null
  }
}

function mountDocsFooter() {
  shouldMountDocsFooter.value = true
  clearDocsFooterObserver()
}

function bindDocsFooterObserver() {
  if (import.meta.server || shouldMountDocsFooter.value)
    return

  const sentinel = docsFooterSentinelRef.value
  if (!sentinel)
    return

  if (!('IntersectionObserver' in window)) {
    mountDocsFooter()
    return
  }

  docsFooterObserver = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0))
      mountDocsFooter()
  }, { rootMargin: DOCS_FOOTER_ROOT_MARGIN })
  docsFooterObserver.observe(sentinel)
}

function clearBackToTopFrame() {
  if (import.meta.server || backToTopFrameId === null)
    return

  window.cancelAnimationFrame(backToTopFrameId)
  backToTopFrameId = null
}

function maybeMountBackToTop() {
  if (import.meta.server || shouldMountBackToTop.value)
    return

  if (window.scrollY > BACK_TO_TOP_MOUNT_SCROLL_Y)
    shouldMountBackToTop.value = true
}

function scheduleBackToTopMountCheck() {
  if (import.meta.server || shouldMountBackToTop.value || backToTopFrameId !== null)
    return

  backToTopFrameId = window.requestAnimationFrame(() => {
    backToTopFrameId = null
    maybeMountBackToTop()
  })
}

function clearDocsAsideShellSchedule() {
  if (import.meta.server)
    return

  if (docsAsideShellTimer) {
    clearTimeout(docsAsideShellTimer)
    docsAsideShellTimer = null
  }
  if (docsAsideShellIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(docsAsideShellIdleId)
    docsAsideShellIdleId = null
  }
  if (docsAsideShellFrameId !== null) {
    window.cancelAnimationFrame(docsAsideShellFrameId)
    docsAsideShellFrameId = null
  }
}

function mountDocsAsideShell() {
  if (shouldMountDocsAsideShell.value)
    return
  shouldMountDocsAsideShell.value = true
  clearDocsAsideShellSchedule()
}

function scheduleDocsAsideShellMount() {
  if (import.meta.server || shouldMountDocsAsideShell.value)
    return

  clearDocsAsideShellSchedule()

  const mount = () => {
    docsAsideShellTimer = null
    docsAsideShellIdleId = null
    docsAsideShellFrameId = null
    mountDocsAsideShell()
  }

  docsAsideShellTimer = setTimeout(() => {
    docsAsideShellTimer = null
    if (typeof window.requestIdleCallback === 'function') {
      docsAsideShellIdleId = window.requestIdleCallback(mount, { timeout: DOCS_ASIDE_SHELL_IDLE_TIMEOUT_MS })
      return
    }

    docsAsideShellFrameId = window.requestAnimationFrame(mount)
  }, DOCS_ASIDE_SHELL_MOUNT_DELAY_MS)
}

function clearDocsOutlineSchedule() {
  if (import.meta.server)
    return

  if (docsOutlineTimer) {
    clearTimeout(docsOutlineTimer)
    docsOutlineTimer = null
  }
  if (docsOutlineIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(docsOutlineIdleId)
    docsOutlineIdleId = null
  }
  if (docsOutlineFrameId !== null) {
    window.cancelAnimationFrame(docsOutlineFrameId)
    docsOutlineFrameId = null
  }
}

function mountDocsOutline() {
  if (shouldMountDocsOutline.value)
    return
  shouldMountDocsOutline.value = true
  clearDocsOutlineSchedule()
}

function scheduleDocsOutlineMount() {
  if (import.meta.server || shouldMountDocsOutline.value || !shouldShowAsideOutline.value)
    return

  clearDocsOutlineSchedule()

  const mount = () => {
    docsOutlineTimer = null
    docsOutlineIdleId = null
    docsOutlineFrameId = null
    if (shouldShowAsideOutline.value)
      mountDocsOutline()
  }

  docsOutlineTimer = setTimeout(() => {
    docsOutlineTimer = null
    if (!shouldShowAsideOutline.value)
      return
    if (typeof window.requestIdleCallback === 'function') {
      docsOutlineIdleId = window.requestIdleCallback(mount, { timeout: DOCS_OUTLINE_IDLE_TIMEOUT_MS })
      return
    }

    docsOutlineFrameId = window.requestAnimationFrame(mount)
  }, DOCS_OUTLINE_MOUNT_DELAY_MS)
}

function clearTuffexBackgroundSchedule() {
  if (import.meta.server)
    return

  if (tuffexBackgroundIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(tuffexBackgroundIdleId)
    tuffexBackgroundIdleId = null
  }
  if (tuffexBackgroundFrameId !== null) {
    window.cancelAnimationFrame(tuffexBackgroundFrameId)
    tuffexBackgroundFrameId = null
  }
}

function scheduleTuffexBackground() {
  if (import.meta.server || shouldMountTuffexBackground.value || !isTuffexDocs.value)
    return

  clearTuffexBackgroundSchedule()

  const schedule = () => {
    tuffexBackgroundIdleId = null
    tuffexBackgroundFrameId = null
    if (!isTuffexDocs.value)
      return
    mountTuffexBackground()
  }

  const requestIdleCallback = window.requestIdleCallback as typeof window.requestIdleCallback | undefined
  if (typeof requestIdleCallback === 'function') {
    tuffexBackgroundIdleId = requestIdleCallback(schedule, { timeout: TUFFEX_DOCS_BACKGROUND_IDLE_TIMEOUT_MS })
    return
  }

  tuffexBackgroundFrameId = window.requestAnimationFrame(schedule)
}

function clearTuffexBackgroundIntentListeners() {
  if (import.meta.server)
    return

  for (const dispose of tuffexBackgroundIntentDisposers)
    dispose()
  tuffexBackgroundIntentDisposers = []
}

function handleTuffexBackgroundIntent() {
  clearTuffexBackgroundIntentListeners()
  scheduleTuffexBackground()
}

function bindTuffexBackgroundIntentListeners() {
  if (import.meta.server || shouldMountTuffexBackground.value || tuffexBackgroundIntentDisposers.length || !isTuffexDocs.value)
    return

  for (const eventName of TUFFEX_DOCS_BACKGROUND_INTENT_EVENTS) {
    window.addEventListener(eventName, handleTuffexBackgroundIntent, { passive: true })
    tuffexBackgroundIntentDisposers.push(() => {
      window.removeEventListener(eventName, handleTuffexBackgroundIntent)
    })
  }
}

watch(isTuffexDocs, (active) => {
  if (active) {
    bindTuffexBackgroundIntentListeners()
    return
  }
  clearTuffexBackgroundIntentListeners()
  clearTuffexBackgroundSchedule()
  shouldMountTuffexBackground.value = false
}, { immediate: true })

watch(shouldShowAsideOutline, (shouldShow) => {
  if (shouldShow) {
    scheduleDocsOutlineMount()
    return
  }
  clearDocsOutlineSchedule()
}, { immediate: true })

onMounted(() => {
  bindDocsFooterObserver()
  scheduleBackToTopMountCheck()
  scheduleDocsAsideShellMount()
  scheduleDocsOutlineMount()
  window.addEventListener('scroll', scheduleBackToTopMountCheck, { passive: true })
})

onBeforeUnmount(() => {
  clearDocsFooterObserver()
  window.removeEventListener('scroll', scheduleBackToTopMountCheck)
  clearBackToTopFrame()
  clearDocsAsideShellSchedule()
  clearDocsOutlineSchedule()
  clearTuffexBackgroundIntentListeners()
  clearTuffexBackgroundSchedule()
})
</script>

<template>
  <div
    class="docs-layout-root relative min-h-screen flex flex-col bg-white text-black dark:bg-dark dark:text-light"
    :class="{ 'docs-layout-root--tutorial dark': isTutorialDocs }"
  >
    <div class="docs-layout-stage relative flex-1">
      <div class="docs-layout-background pointer-events-none absolute inset-0 overflow-hidden">
        <Transition name="tuffex-docs-hero-bg-fade">
          <div v-if="isTuffexDocs" class="docs-tuffex-hero-bg-frame">
            <ClientOnly>
              <TuffexDocsHeroBackground v-if="shouldMountTuffexBackground" />
            </ClientOnly>
          </div>
          <div v-else-if="isTutorialDocs" class="docs-tutorial-background" aria-hidden="true">
            <div class="docs-tutorial-background__beam" />
          </div>
          <div v-else class="docs-background absolute left-1/2 h-[420px] w-[820px] rounded-[200px] from-primary/6 via-primary/3 to-transparent bg-gradient-to-br blur-3xl -top-32 -translate-x-1/2 dark:from-light/10 dark:via-light/5 dark:to-transparent" />
        </Transition>
      </div>
      <div class="docs-edge-blur docs-edge-blur--top" aria-hidden="true" />
      <div class="docs-edge-blur docs-edge-blur--bottom" aria-hidden="true" />
      <TheHeader title="Tuff Docs" class="z-30" />
      <div class="docs-layout-foreground relative flex flex-1 justify-center px-4 pb-20 pt-20 lg:px-10 sm:px-6">
        <div class="min-w-0 max-w-[88rem] w-full flex gap-6 lg:gap-8">
          <aside class="hidden w-[230px] shrink-0 xl:block">
            <div class="docs-sidebar sticky top-24 h-[calc(100vh-6rem)] overflow-y-auto pb-8 pr-1.5 relative z-30">
              <DocsSidebar />
            </div>
          </aside>
          <main class="min-w-0 flex-1">
            <div class="mx-auto min-w-0 max-w-[53rem] w-full space-y-10">
              <div class="flex items-center gap-2 xl:hidden">
                <button type="button" class="docs-mobile-action" @click="openSidebarDrawer">
                  <span class="i-carbon-menu text-base" />
                  {{ t('docs.sidebarLabel') }}
                </button>
                <button type="button" class="docs-mobile-action lg:hidden" @click="openOutlineDrawer">
                  <span class="i-carbon-list text-base" />
                  {{ t('docs.outlineLabel') }}
                </button>
              </div>
              <slot />
            </div>
          </main>
          <aside class="hidden w-[240px] shrink-0 lg:block">
            <div class="sticky top-24 flex flex-col gap-6">
              <div id="docs-outline-tools" class="docs-outline-tools-anchor relative z-30" />
              <ClientOnly>
                <div v-show="shouldShowAsideOutline" class="docs-outline-panel max-h-[calc(100vh-12rem)] overflow-y-auto pr-2 relative z-30">
                  <LazyDocsOutline v-if="shouldMountDocsOutline" />
                  <div v-else class="docs-outline-shell" aria-hidden="true">
                    <span class="docs-outline-shell__line is-wide" />
                    <span class="docs-outline-shell__line" />
                    <span class="docs-outline-shell__line is-short" />
                    <span class="docs-outline-shell__line is-wide" />
                    <span class="docs-outline-shell__line" />
                  </div>
                </div>
                <LazyDocsAsideCards
                  v-if="shouldMountDocsAsideCards"
                  :assistant-open-request="docsAssistantOpenRequest"
                  :assistant-source="docsAssistantSource"
                />
                <section
                  v-if="shouldShowDocsAsideAiNotice"
                  class="docs-aside-ai-notice"
                  aria-live="polite"
                >
                  <div class="docs-aside-ai-notice__title">
                    <span class="docs-aside-ai-notice__sparkle" aria-hidden="true">⚠</span>
                    {{ docsAsideAiNoticeTitle }}
                  </div>
                  <p class="docs-aside-ai-notice__desc">
                    {{ docsAsideAiNoticeDescription }}
                  </p>
                </section>
                <LazyDocsAsideCardsShell
                  v-if="shouldMountDocsAsideShell"
                  @open-assistant="openDocsAssistantFromShell"
                />
                <button
                  v-else
                  ref="docsAssistantShellTriggerRef"
                  type="button"
                  class="docs-aside-assistant-shell"
                  :aria-label="assistantAriaLabel"
                  @click="openDocsAssistantFromPlaceholder"
                >
                  <span class="docs-aside-assistant-shell__spark" aria-hidden="true">✦</span>
                  <span class="docs-aside-assistant-shell__label">Tuff Assistant</span>
                  <span class="docs-aside-assistant-shell__arrow i-carbon-chevron-right" aria-hidden="true" />
                </button>
              </ClientOnly>
            </div>
          </aside>
        </div>
      </div>
    </div>
    <div ref="docsFooterSentinelRef" class="docs-footer-sentinel" aria-hidden="true" />
    <LazyTuffFooter v-if="shouldMountDocsFooter" class="docs-layout-footer" />
    <LazyBackToTop v-if="shouldMountBackToTop" />
    <ClientOnly>
      <DocsDrawer
        v-if="sidebarDrawerMounted"
        :visible="sidebarVisible"
        :title="t('docs.sidebarLabel')"
        width="82%"
        direction="left"
        @update:visible="(v) => (sidebarVisible = v)"
      >
        <div class="p-4">
          <DocsSidebar v-if="sidebarVisible" />
        </div>
      </DocsDrawer>
      <DocsDrawer
        v-if="outlineDrawerMounted"
        :visible="outlineVisible"
        :title="t('docs.outlineLabel')"
        width="82%"
        direction="right"
        @update:visible="(v) => (outlineVisible = v)"
      >
        <div class="p-4">
          <LazyDocsOutline v-if="outlineVisible && shouldMountDocsOutline" />
        </div>
      </DocsDrawer>
    </ClientOnly>
  </div>
</template>

<style scoped>
.docs-layout-root {
  isolation: isolate;
}

.docs-layout-root--tutorial {
  background:
    radial-gradient(circle at 50% -10%, rgba(96, 165, 250, 0.22), transparent 34%),
    radial-gradient(circle at 78% 78%, rgba(168, 85, 247, 0.18), transparent 32%),
    linear-gradient(135deg, #050607 0%, #111217 58%, #050607 100%);
  color: var(--tx-text-color-primary, #f5f7fa);
}

.docs-layout-stage {
  isolation: isolate;
}

.docs-layout-background {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100vh;
}

.docs-layout-foreground {
  z-index: 2;
}

.docs-layout-footer {
  z-index: 3;
}

.docs-mobile-action {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  border: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, #fff 84%, transparent);
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
  color: rgba(0, 0, 0, 0.7);
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.55rem 0.85rem;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.docs-mobile-action:active {
  transform: translateY(1px);
}

.docs-mobile-action:hover {
  background: #fff;
  border-color: color-mix(in srgb, var(--tx-border-color, #dcdfe6) 90%, transparent);
  color: rgba(0, 0, 0, 0.78);
}

.dark .docs-mobile-action,
[data-theme='dark'] .docs-mobile-action {
  background: color-mix(in srgb, var(--tx-bg-color, #141414) 82%, transparent);
  border-color: color-mix(in srgb, var(--tx-border-color, rgba(255, 255, 255, 0.14)) 72%, transparent);
  color: rgba(255, 255, 255, 0.72);
}

.dark .docs-mobile-action:hover,
[data-theme='dark'] .docs-mobile-action:hover {
  background: color-mix(in srgb, var(--tx-bg-color, #141414) 94%, transparent);
  color: rgba(255, 255, 255, 0.82);
}

.docs-edge-blur {
  position: fixed;
  left: 0;
  z-index: 20;
  width: 100vw;
  height: 72px;
  pointer-events: none;
  backdrop-filter: blur(1.05rem);
  opacity: 0.85;
  mask-image: linear-gradient(to bottom, black 0%, black 48%, transparent 100%);
  -webkit-backdrop-filter: blur(1.05rem);
  -webkit-mask-image: linear-gradient(to bottom, black 0%, black 48%, transparent 100%);
}

.docs-edge-blur--top {
  top: 0;
}

.docs-edge-blur--bottom {
  bottom: 0;
  transform: rotate(180deg);
}

.docs-tuffex-hero-bg-frame {
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 100vh;
  min-height: 520px;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(99, 102, 241, 0.045), transparent 42%, rgba(244, 63, 94, 0.045)),
    linear-gradient(180deg, rgba(6, 182, 212, 0.025), transparent 48%);
  opacity: 0.42;
}

.docs-tutorial-background {
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(circle at 50% 0%, rgba(96, 165, 250, 0.2), transparent 28%),
    radial-gradient(circle at 76% 72%, rgba(168, 85, 247, 0.16), transparent 30%);
  filter: blur(18px);
  opacity: 0.62;
}

.docs-tutorial-background__beam {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(115deg, transparent 22%, rgba(255, 255, 255, 0.08) 42%, transparent 58%),
    radial-gradient(circle at 20% 72%, rgba(64, 158, 255, 0.18), transparent 28%);
  transform: rotate(-8deg);
}

.tuffex-docs-hero-bg-fade-enter-active,
.tuffex-docs-hero-bg-fade-leave-active {
  transition: opacity 320ms ease, filter 320ms ease;
}

.tuffex-docs-hero-bg-fade-enter-from,
.tuffex-docs-hero-bg-fade-leave-to {
  opacity: 0;
  filter: blur(12px);
}

.docs-sidebar::-webkit-scrollbar {
  width: 4px;
}
.docs-sidebar::-webkit-scrollbar-track {
  background: transparent;
}
.docs-sidebar::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 2px;
}
.docs-sidebar:hover::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
}
:root.dark .docs-sidebar:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}

.docs-outline-panel::-webkit-scrollbar {
  width: 4px;
}
.docs-outline-panel::-webkit-scrollbar-track {
  background: transparent;
}
.docs-outline-panel::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 2px;
}
.docs-outline-panel:hover::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 18%, transparent);
}

.docs-aside-ai-notice {
  border: 1px solid color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, transparent);
  border-radius: var(--tx-border-radius-round, 18px);
  background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 16%, transparent);
  padding: 16px;
}

.docs-aside-ai-notice__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
  font-weight: 600;
}

.docs-aside-ai-notice__sparkle {
  color: var(--tx-color-warning, #e6a23c);
  font-size: 14px;
}

.docs-aside-ai-notice__desc {
  margin: 8px 0 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 13px;
}

.docs-aside-assistant-shell {
  display: flex;
  width: 100%;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 70%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #ffffff) 86%, transparent);
  color: var(--tx-text-color-primary, #303133);
  cursor: pointer;
  font: inherit;
  padding: 12px;
  transition:
    background var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out),
    border-color var(--tx-transition-duration-fast, 0.2s) var(--tx-transition-function, ease-in-out);
}

.docs-aside-assistant-shell:hover,
.docs-aside-assistant-shell:focus-visible {
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 35%, transparent);
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
  outline: none;
}

.docs-aside-assistant-shell__spark {
  color: var(--tx-color-primary, #409eff);
  font-size: 14px;
}

.docs-aside-assistant-shell__label {
  flex: 1;
  padding-left: 8px;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}

.docs-aside-assistant-shell__arrow {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 14px;
}

.docs-outline-shell {
  display: grid;
  gap: 0.625rem;
  padding: 0.25rem 0.25rem 0.5rem;
}

.docs-outline-shell__line {
  display: block;
  width: 68%;
  height: 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 10%, transparent);
}

.docs-outline-shell__line.is-wide {
  width: 84%;
}

.docs-outline-shell__line.is-short {
  width: 48%;
}
</style>

<style>
.dark .docs-tuffex-hero-bg-frame,
[data-theme='dark'] .docs-tuffex-hero-bg-frame {
  --tuffex-docs-hero-tone: 2.1;
  opacity: 0.46;
}
</style>
