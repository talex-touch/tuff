<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DocsOutline from '~/components/DocsOutline.vue'
import DocsAsideCardsShell from '~/components/docs/DocsAsideCardsShell.vue'
import DocsCopyPromptButton from '~/components/docs/DocsCopyPromptButton.vue'
import DocsFrameworkSwitcher from '~/components/docs/DocsFrameworkSwitcher.vue'
import { resolveComponentSlugFromPath } from '~/data/tuffex-framework-matrix'

const DocsDrawer = defineAsyncComponent(() => import('~/components/ui/Drawer.vue'))
const LazyBackToTop = defineAsyncComponent(() => import('~/components/ui/BackToTop.vue'))
const LazyTuffFooter = defineAsyncComponent(() => import('~/components/TuffFooter.vue'))
const TuffexDocsHeroBackground = defineAsyncComponent(() => import('~/components/docs/TuffexDocsHeroBackground.vue'))
const BACK_TO_TOP_MOUNT_SCROLL_Y = 240
const DOCS_FOOTER_ROOT_MARGIN = '480px 0px'
const DOCS_FOOTER_IDLE_TIMEOUT_MS = 180
const TUFFEX_DOCS_BACKGROUND_IDLE_TIMEOUT_MS = 2200
const TUFFEX_DOCS_BACKGROUND_INTENT_EVENTS = ['scroll', 'pointerdown', 'keydown', 'touchstart'] as const

const { t } = useI18n()
useI18nPreloadKeys(['docs', 'common'])
const route = useRoute()
const sidebarVisible = ref(false)
const outlineVisible = ref(false)
const sidebarDrawerMounted = ref(false)
const outlineDrawerMounted = ref(false)
const shouldMountDocsFooter = ref(false)
const shouldMountBackToTop = ref(false)
const shouldMountTuffexBackground = ref(false)
const docsFooterSentinelRef = ref<HTMLElement | null>(null)
let docsFooterIdleId: number | null = null
let docsFooterFrameId: number | null = null
let docsFooterObserver: IntersectionObserver | null = null
let backToTopFrameId: number | null = null
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

const activeComponentSlug = computed(() => resolveComponentSlugFromPath(normalizedDocsPath.value))

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
  outlineVisible.value = true
}

function clearDocsFooterSchedule() {
  if (import.meta.server)
    return

  if (docsFooterObserver) {
    docsFooterObserver.disconnect()
    docsFooterObserver = null
  }
  if (docsFooterIdleId !== null && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(docsFooterIdleId)
    docsFooterIdleId = null
  }
  if (docsFooterFrameId !== null) {
    window.cancelAnimationFrame(docsFooterFrameId)
    docsFooterFrameId = null
  }
}

function mountDocsFooter() {
  shouldMountDocsFooter.value = true
  clearDocsFooterSchedule()
}

// Mount the footer once the reader approaches the bottom of the page (or immediately on short
// docs pages) so long component pages do not eagerly pull the landing footer locale chunk.
function scheduleDocsFooterMount() {
  if (import.meta.server || shouldMountDocsFooter.value)
    return

  clearDocsFooterSchedule()

  const sentinel = docsFooterSentinelRef.value
  if ('IntersectionObserver' in window && sentinel) {
    const rect = sentinel.getBoundingClientRect()
    if (rect.top <= window.innerHeight + 480) {
      mountDocsFooter()
      return
    }
    docsFooterObserver = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0))
        mountDocsFooter()
    }, { rootMargin: DOCS_FOOTER_ROOT_MARGIN })
    docsFooterObserver.observe(sentinel)
    return
  }

  const mount = () => {
    docsFooterIdleId = null
    docsFooterFrameId = null
    mountDocsFooter()
  }

  if (typeof window.requestIdleCallback === 'function') {
    docsFooterIdleId = window.requestIdleCallback(mount, { timeout: DOCS_FOOTER_IDLE_TIMEOUT_MS })
    return
  }

  docsFooterFrameId = window.requestAnimationFrame(mount)
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

onMounted(() => {
  scheduleDocsFooterMount()
  scheduleBackToTopMountCheck()
  window.addEventListener('scroll', scheduleBackToTopMountCheck, { passive: true })
})

onBeforeUnmount(() => {
  clearDocsFooterSchedule()
  window.removeEventListener('scroll', scheduleBackToTopMountCheck)
  clearBackToTopFrame()
  clearTuffexBackgroundIntentListeners()
  clearTuffexBackgroundSchedule()
})
</script>

<template>
  <div
    class="docs-layout-root relative min-h-screen flex flex-col bg-white text-black dark:bg-dark dark:text-light"
    :class="{ 'docs-layout-root--tutorial': isTutorialDocs }"
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
            <div class="docs-tutorial-background__grain" />
            <div class="docs-tutorial-background__veil" />
          </div>
          <div
            v-else
            class="docs-background absolute inset-x-0 top-0 h-[42vh] max-h-[420px]"
            aria-hidden="true"
          />
        </Transition>
      </div>
      <div class="docs-edge-blur docs-edge-blur--top" aria-hidden="true">
        <span v-for="layer in 4" :key="layer" class="docs-edge-blur__layer" />
      </div>
      <div class="docs-edge-blur docs-edge-blur--bottom" aria-hidden="true">
        <span v-for="layer in 4" :key="layer" class="docs-edge-blur__layer" />
      </div>
      <TheHeader title="Tuff Docs" class="z-30" />
      <div class="docs-layout-foreground relative flex flex-1 justify-center pb-20 pt-20">
        <div class="docs-layout-frame min-w-0 w-full flex gap-6 lg:gap-8">
          <aside class="hidden w-[230px] shrink-0 xl:block">
            <div class="docs-sidebar sticky top-24 h-[calc(100vh-6rem)] overflow-y-auto overflow-x-hidden pr-1.5 relative z-30">
              <DocsSidebar />
            </div>
          </aside>
          <main class="min-w-0 flex-1">
            <div class="docs-content-column mx-auto min-w-0 w-full space-y-10">
              <div class="flex flex-wrap items-center gap-2 xl:hidden">
                <button type="button" class="docs-mobile-action" @click="openSidebarDrawer">
                  <span class="i-carbon-menu text-base" />
                  {{ t('docs.sidebarLabel') }}
                </button>
                <button type="button" class="docs-mobile-action lg:hidden" @click="openOutlineDrawer">
                  <span class="i-carbon-list text-base" />
                  {{ t('docs.outlineLabel') }}
                </button>
                <DocsFrameworkSwitcher
                  v-if="isTuffexDocs"
                  class="ml-auto"
                  size="sm"
                  :component-slug="activeComponentSlug"
                  :show-status-dots="Boolean(activeComponentSlug)"
                />
              </div>
              <slot />
            </div>
          </main>
          <aside class="hidden w-[240px] shrink-0 lg:block">
            <div class="sticky top-24 flex flex-col gap-6">
              <div v-if="isTuffexDocs" class="relative z-30">
                <DocsFrameworkSwitcher
                  block
                  size="sm"
                  :component-slug="activeComponentSlug"
                  :show-status-dots="Boolean(activeComponentSlug)"
                />
              </div>
              <div id="docs-outline-tools" class="docs-outline-tools-anchor relative z-30" />
              <ClientOnly>
                <div v-show="shouldShowAsideOutline" class="docs-outline-panel max-h-[calc(100vh-12rem)] overflow-y-auto pr-2 relative z-30">
                  <DocsOutline />
                </div>
              </ClientOnly>
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
              <!-- The copy button and resource links render on SSR immediately without a post-mount chunk hop. -->
              <div class="docs-aside-actions">
                <DocsCopyPromptButton />
                <DocsAsideCardsShell />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
    <div ref="docsFooterSentinelRef" aria-hidden="true" />
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
          <DocsOutline v-if="outlineVisible" />
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
  /* Same theme as the rest of docs; only a calmer field wash. */
  background:
    radial-gradient(ellipse 90% 50% at 50% -12%, color-mix(in srgb, var(--tx-color-primary, #409eff) 7%, transparent), transparent 62%),
    var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #111);
}

.dark .docs-layout-root--tutorial,
[data-theme='dark'] .docs-layout-root--tutorial,
.docs-layout-root--tutorial.dark {
  background:
    radial-gradient(ellipse 90% 55% at 50% -8%, rgba(148, 163, 184, 0.07), transparent 58%),
    linear-gradient(180deg, #07080a 0%, #0b0c0f 48%, #07080a 100%);
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
  padding-inline: var(--nexus-frame-gutter);
}

/*
 * The reading column — not the outer frame — is what matches the header pill,
 * and it matches the pill's *scrolled* width (`--nexus-frame-compact`), not its
 * resting one: the header shrinks on scroll, so pinning to the resting width
 * would only line up at the top of the page. The asides keep their own widths
 * and live outside the column, which is why the frame below has to grow by
 * exactly the aside + gap widths that are actually visible at each breakpoint.
 */
.docs-content-column {
  max-width: var(--nexus-frame-compact);
}

.docs-layout-frame {
  max-width: var(--nexus-frame-compact);
}

/* lg: the 240px outline aside joins the row (gap-8 = 2rem). */
@media (min-width: 1024px) {
  .docs-layout-frame {
    max-width: calc(var(--nexus-frame-compact) + 240px + 2rem);
  }
}

/* xl: the 230px sidebar joins as well. */
@media (min-width: 1280px) {
  .docs-layout-frame {
    max-width: calc(var(--nexus-frame-compact) + 230px + 240px + 4rem);
  }
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

/*
 * Content scrolls on the window, so it passes under the floating header and
 * off the bottom of the viewport. Each edge is a progressive blur that ends in
 * the page colour: four full-size backdrop layers, each masked to a band and
 * twice as strong as the one inside it, then a fade to the page colour on top,
 * so text and images leave the viewport alike and nothing sharp shows through.
 *
 * The container must stay effect-free: an opacity, mask, filter or
 * backdrop-filter here would make it the layers' backdrop root, and they would
 * blur only the empty container. That, plus `opacity: 0.72` on a single blur
 * layer (28% of the sharp page kept showing through), was the previous build.
 */
.docs-layout-root {
  /* The root's own background: `bg-white` / `dark:bg-dark` (#121212 in uno.config.ts). */
  --docs-edge-color: #fff;
  /* Shared with `.docs-sidebar`, whose list has to scroll clear of this strip. */
  --docs-edge-bottom-height: 64px;
}

.dark .docs-layout-root,
[data-theme='dark'] .docs-layout-root {
  --docs-edge-color: #121212;
}

.docs-layout-root--tutorial {
  --docs-edge-color: var(--tx-bg-color, #fff);
}

.dark .docs-layout-root--tutorial,
[data-theme='dark'] .docs-layout-root--tutorial,
.docs-layout-root--tutorial.dark {
  /* Midway along the root's #07080a → #0b0c0f wash. */
  --docs-edge-color: #090a0d;
}

.docs-edge-blur {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 20;
  height: var(--docs-edge-height);
  pointer-events: none;
}

/* The direction points at the viewport edge: 0% is the inner edge, 100% the outer. */
.docs-edge-blur--top {
  top: 0;
  /* Down past the header pill (top 16px, ~50px tall) so its corners sit inside the fade. */
  --docs-edge-height: 88px;
  --docs-edge-dir: to top;
}

.docs-edge-blur--bottom {
  bottom: 0;
  --docs-edge-height: var(--docs-edge-bottom-height);
  --docs-edge-dir: to bottom;
}

.docs-edge-blur__layer {
  position: absolute;
  /* Full size, masked to a band: blur samples only its own box, so narrow strips would seam. */
  inset: 0;
  -webkit-backdrop-filter: blur(var(--docs-edge-blur));
  backdrop-filter: blur(var(--docs-edge-blur));
  -webkit-mask-image: linear-gradient(var(--docs-edge-dir), var(--docs-edge-band));
  mask-image: linear-gradient(var(--docs-edge-dir), var(--docs-edge-band));
}

.docs-edge-blur__layer:nth-child(1) {
  --docs-edge-blur: 1px;
  --docs-edge-band: transparent 0%, #000 25%, #000 50%, transparent 75%;
}

.docs-edge-blur__layer:nth-child(2) {
  --docs-edge-blur: 2px;
  --docs-edge-band: transparent 25%, #000 50%, #000 75%, transparent 100%;
}

.docs-edge-blur__layer:nth-child(3) {
  --docs-edge-blur: 4px;
  --docs-edge-band: transparent 50%, #000 75%, #000 100%;
}

.docs-edge-blur__layer:nth-child(4) {
  --docs-edge-blur: 8px;
  --docs-edge-band: transparent 75%, #000 100%;
}

/* Painted over the blur layers: the last few px are the page itself. */
.docs-edge-blur::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    var(--docs-edge-dir),
    transparent 0%,
    color-mix(in srgb, var(--docs-edge-color) 55%, transparent) 55%,
    var(--docs-edge-color) 92%
  );
}

/* Solid above the pill (the outer 16px of 88px), so nothing peeks over the header. */
.docs-edge-blur--top::after {
  background: linear-gradient(
    var(--docs-edge-dir),
    transparent 8%,
    color-mix(in srgb, var(--docs-edge-color) 72%, transparent) 55%,
    var(--docs-edge-color) 80%
  );
}

/* The guide keeps its calmer, blur-free edge: the colour fade alone. */
.docs-layout-root--tutorial .docs-edge-blur__layer {
  display: none;
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .docs-edge-blur__layer {
    display: none;
  }
}

.docs-tuffex-hero-bg-frame {
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 100vh;
  min-height: 520px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.04), transparent 46%),
    linear-gradient(135deg, rgba(99, 102, 241, 0.03), transparent 48%, rgba(244, 63, 94, 0.025));
  opacity: 0.34;
}

.docs-tutorial-background {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: transparent;
}

.docs-tutorial-background__grain {
  position: absolute;
  inset: 0;
  opacity: 0.02;
  background-image:
    radial-gradient(circle at 1px 1px, currentColor 0.65px, transparent 0.75px);
  background-size: 18px 18px;
  color: rgba(15, 23, 42, 0.9);
  mask-image: radial-gradient(ellipse 80% 60% at 50% 18%, black 0%, transparent 78%);
  -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 18%, black 0%, transparent 78%);
}

.dark .docs-tutorial-background__grain,
[data-theme='dark'] .docs-tutorial-background__grain {
  opacity: 0.035;
  color: rgba(255, 255, 255, 0.9);
}

.docs-tutorial-background__veil {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 42% at 50% 0%, color-mix(in srgb, var(--tx-color-primary, #409eff) 5%, transparent), transparent 70%),
    linear-gradient(180deg, color-mix(in srgb, var(--tx-text-color-primary) 2%, transparent), transparent 30%);
}

.dark .docs-tutorial-background__veil,
[data-theme='dark'] .docs-tutorial-background__veil {
  background:
    radial-gradient(ellipse 70% 42% at 50% 0%, rgba(226, 232, 240, 0.045), transparent 70%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 28%, transparent 72%, rgba(0, 0, 0, 0.18));
}

.docs-background {
  background:
    radial-gradient(ellipse 80% 70% at 50% -10%, color-mix(in srgb, var(--tx-color-primary, #409eff) 8%, transparent), transparent 68%);
  opacity: 0.55;
  filter: blur(2px);
}

.dark .docs-background,
[data-theme='dark'] .docs-background {
  background:
    radial-gradient(ellipse 80% 70% at 50% -10%, rgba(148, 163, 184, 0.08), transparent 68%);
  opacity: 0.7;
}

.docs-layout-root--tutorial .docs-layout-foreground {
  /* Slightly higher contrast reading stack on the quiet dark field. */
  --docs-sidebar-ink: rgba(255, 255, 255, 0.78);
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

/* The sidebar reaches the viewport's bottom edge, so the bottom strip — fixed
   above the whole foreground — covers its end. Padding the end by the strip's
   height lets the last row scroll clear of it, with the 2rem the list used to
   end on. */
.docs-sidebar {
  padding-bottom: calc(var(--docs-edge-bottom-height) + 2rem);
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

.docs-aside-actions {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

/* The label and rows mirror DocsOutline's, which replaces this in place. */
.docs-outline-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 0.875rem;
  line-height: 1.25rem;
  user-select: none;
}

.docs-outline-shell__label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 500;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #909399) 88%, transparent);
}

.docs-outline-shell__icon {
  font-size: 15px;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #909399) 78%, transparent);
}

.docs-outline-shell__track {
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: min(60vh, calc(100vh - 16rem));
  padding: 2px 0;
  overflow: hidden;
}

.docs-outline-shell__track::before {
  content: '';
  position: absolute;
  inset-inline-start: 8.5px;
  top: 6px;
  bottom: 6px;
  width: 1.5px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 12%, transparent);
}

.docs-outline-shell__row {
  display: flex;
  align-items: center;
  padding-block: 6px;
  padding-inline-start: 20px;
  color: transparent;
  font-size: 13.5px;
  line-height: 1.375;
  letter-spacing: var(--wm-letter-space-2, 0px);
}

.docs-outline-shell__row.is-nested {
  padding-inline-start: 32px;
}

/* Text-shaped bars: the heading itself, transparent, wraps exactly as it will. */
.docs-outline-shell__text {
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 10%, transparent);
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}

.docs-outline-shell__lines {
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
  --tuffex-docs-hero-tone: 1.15;
  opacity: 0.28;
}
</style>
