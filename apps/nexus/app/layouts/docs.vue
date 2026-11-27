<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import DocsOutline from '~/components/DocsOutline.vue'
import DocsAsideCardsShell from '~/components/docs/DocsAsideCardsShell.vue'
import DocsCopyPromptButton from '~/components/docs/DocsCopyPromptButton.vue'

const DocsDrawer = defineAsyncComponent(() => import('~/components/ui/Drawer.vue'))
const LazyBackToTop = defineAsyncComponent(() => import('~/components/ui/BackToTop.vue'))
const LazyTuffFooter = defineAsyncComponent(() => import('~/components/TuffFooter.vue'))
const BACK_TO_TOP_MOUNT_SCROLL_Y = 240
const DOCS_FOOTER_ROOT_MARGIN = '480px 0px'
const DOCS_FOOTER_IDLE_TIMEOUT_MS = 180

const { t } = useI18n()
useI18nPreloadKeys(['docs', 'common'])
const route = useRoute()
const sidebarVisible = ref(false)
const outlineVisible = ref(false)
const sidebarDrawerMounted = ref(false)
const outlineDrawerMounted = ref(false)
const shouldMountDocsFooter = ref(false)
const shouldMountBackToTop = ref(false)
const docsFooterSentinelRef = ref<HTMLElement | null>(null)
let docsFooterIdleId: number | null = null
let docsFooterFrameId: number | null = null
let docsFooterObserver: IntersectionObserver | null = null
let backToTopFrameId: number | null = null
const outlinePublicState = useState<{ hasOutline: boolean, loading: boolean }>('docs-outline-state', () => ({
  hasOutline: false,
  loading: false,
}))
const outlineTocState = useState<any[]>('docs-toc', () => [])
const outlineLoadingState = useState<boolean>('docs-outline-loading', () => false)
const shouldShowAsideOutline = computed(() =>
  outlinePublicState.value.hasOutline
  || outlinePublicState.value.loading
  || outlineTocState.value.length > 0
  || outlineLoadingState.value,
)

const normalizedDocsPath = computed(() => {
  const path = route.path || '/'
  const trimmed = path.replace(/^\/(en|zh)(?=\/|$)/i, '')
  return trimmed || '/'
})

const isTutorialDocs = computed(() => {
  const path = normalizedDocsPath.value
  return path === '/docs/guide' || path.startsWith('/docs/guide/')
})

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
// docs pages) so long docs pages do not eagerly pull the landing footer locale chunk.
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

onMounted(() => {
  scheduleDocsFooterMount()
  scheduleBackToTopMountCheck()
  window.addEventListener('scroll', scheduleBackToTopMountCheck, { passive: true })
})

onBeforeUnmount(() => {
  clearDocsFooterSchedule()
  window.removeEventListener('scroll', scheduleBackToTopMountCheck)
  clearBackToTopFrame()
})
</script>

<template>
  <div
    class="docs-layout-root relative min-h-screen flex flex-col bg-white text-black dark:bg-dark dark:text-light"
    :class="{ 'docs-layout-root--tutorial': isTutorialDocs }"
  >
    <div class="docs-layout-stage relative flex-1">
      <div class="docs-layout-background pointer-events-none absolute inset-0 overflow-hidden">
        <div v-if="isTutorialDocs" class="docs-tutorial-background" aria-hidden="true">
          <div class="docs-tutorial-background__grain" />
          <div class="docs-tutorial-background__veil" />
        </div>
        <div
          v-else
          class="docs-background absolute inset-x-0 top-0 h-[42vh] max-h-[420px]"
          aria-hidden="true"
        />
      </div>
      <!-- Pure CSS multi-stop linear-gradient edge scrims (zero fixed blur layers). -->
      <div class="docs-edge-blur docs-edge-blur--top" aria-hidden="true" />
      <div class="docs-edge-blur docs-edge-blur--bottom" aria-hidden="true" />
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
              </div>
              <slot />
            </div>
          </main>
          <aside class="hidden w-[240px] shrink-0 lg:block">
            <div class="sticky top-24 flex flex-col gap-6">
              <div id="docs-outline-tools" class="docs-outline-tools-anchor relative z-30" />
              <ClientOnly>
                <div v-show="shouldShowAsideOutline" class="docs-outline-panel max-h-[calc(100vh-12rem)] overflow-y-auto pr-2 relative z-30">
                  <DocsOutline />
                </div>
              </ClientOnly>
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
 * Content scrolls on the window under the floating header and past the bottom
 * edge. Pure multi-stop linear-gradient scrims fade scrolling prose smoothly
 * into the page colour with zero fixed blur compositing cost.
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

/* Solid above the header pill (outer ~18px of 88px), then smoothly fading into transparent. */
.docs-edge-blur--top {
  top: 0;
  --docs-edge-height: 88px;
  background: linear-gradient(
    to bottom,
    var(--docs-edge-color) 0%,
    var(--docs-edge-color) 20%,
    color-mix(in srgb, var(--docs-edge-color) 78%, transparent) 50%,
    color-mix(in srgb, var(--docs-edge-color) 32%, transparent) 78%,
    transparent 100%
  );
}

.docs-edge-blur--bottom {
  bottom: 0;
  --docs-edge-height: var(--docs-edge-bottom-height);
  background: linear-gradient(
    to top,
    var(--docs-edge-color) 0%,
    color-mix(in srgb, var(--docs-edge-color) 86%, transparent) 22%,
    color-mix(in srgb, var(--docs-edge-color) 48%, transparent) 58%,
    transparent 100%
  );
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

.docs-aside-actions {
  display: flex;
  flex-direction: column;
  gap: 30px;
}
</style>
