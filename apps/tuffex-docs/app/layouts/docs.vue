<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import DocsHeader from '~/components/docs/DocsHeader.vue'
import DocsFooter from '~/components/docs/DocsFooter.vue'
import DocsSidebar from '~/components/docs/DocsSidebar.vue'
import DocsOutline from '~/components/docs/DocsOutline.vue'
import DocsFrameworkSwitcher from '~/components/docs/DocsFrameworkSwitcher.vue'
import DocsAsideCardsShell from '~/components/docs/DocsAsideCardsShell.vue'
import DocsCopyPromptButton from '~/components/docs/DocsCopyPromptButton.vue'
import TuffexDocsHeroBackground from '~/components/docs/TuffexDocsHeroBackground.vue'
import { TUFFEX_CURRENT_DOC_KEY, useTuffexCurrentDoc } from '~/composables/useTuffexCurrentDoc'
import { resolveLocaleFromPath, resolveTuffexComponentSlug } from '~/utils/docs-route'

const LazyDocsDrawer = defineAsyncComponent(() => import('~/components/docs/DocsDrawer.vue'))
const LazyDocsBackToTop = defineAsyncComponent(() => import('~/components/docs/DocsBackToTop.vue'))

const BACK_TO_TOP_SCROLL_Y = 260

const route = useRoute()
const { t } = useI18n()

// R2: Create document context synchronously (registering all refs & watchers
// before any await) and provide it to `pages/[...slug].vue`, `DocsOutline`, and
// `DocsCopyPromptButton`, then await `ready` at the end of `<script setup>` so
// SSR byte-1 HTML ships full compiled body + `<DocsOutline>` with ZERO doc payload in `__NUXT_DATA__`.
const currentDoc = useTuffexCurrentDoc()
provide(TUFFEX_CURRENT_DOC_KEY, currentDoc)

const sidebarOpen = ref(false)
const outlineOpen = ref(false)
const sidebarDrawerMounted = ref(false)
const outlineDrawerMounted = ref(false)
const shouldMountBackToTop = ref(false)
let scrollRaf: number | null = null

const docsLocale = computed(() => resolveLocaleFromPath(route.path))
const isZh = computed(() => docsLocale.value === 'zh')
const activeComponentSlug = computed(() => resolveTuffexComponentSlug(route.path))

const shouldShowAsideOutline = computed(() => currentDoc.docOutline.value.length > 0)

const shouldShowAiNotice = computed(() => {
  const meta = currentDoc.displayMeta.value
  if (!meta || meta.verified === true)
    return false
  const raw = typeof meta.syncStatus === 'string'
    ? meta.syncStatus.trim()
    : typeof meta.status === 'string'
      ? meta.status.trim()
      : ''
  return raw === 'migrated' || raw === '已迁移'
})

function openSidebarDrawer() {
  sidebarDrawerMounted.value = true
  sidebarOpen.value = true
}

function openOutlineDrawer() {
  outlineDrawerMounted.value = true
  outlineOpen.value = true
}

function checkBackToTop() {
  if (shouldMountBackToTop.value)
    return
  if (window.scrollY > BACK_TO_TOP_SCROLL_Y)
    shouldMountBackToTop.value = true
}

function onWindowScroll() {
  if (shouldMountBackToTop.value || scrollRaf !== null)
    return
  scrollRaf = window.requestAnimationFrame(() => {
    scrollRaf = null
    checkBackToTop()
  })
}

watch(() => route.path, () => {
  sidebarOpen.value = false
  outlineOpen.value = false
})

onMounted(() => {
  checkBackToTop()
  window.addEventListener('scroll', onWindowScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onWindowScroll)
  if (scrollRaf !== null) {
    window.cancelAnimationFrame(scrollRaf)
    scrollRaf = null
  }
})

// Await after all Vue/Nuxt composables & lifecycle hooks are registered!
await currentDoc.ready
</script>

<template>
  <div class="docs-layout-root">
    <div class="docs-layout-stage">
      <!-- R3: Pure radial-gradient hero background wash (ZERO filter: blur(72px)!) -->
      <div class="docs-layout-background" aria-hidden="true">
        <div class="docs-tuffex-hero-bg-frame">
          <TuffexDocsHeroBackground />
        </div>
      </div>

      <!-- R3: Pure CSS multi-stop linear-gradient edge scrims (ZERO fixed backdrop-filter layers!) -->
      <div class="docs-edge-scrim docs-edge-scrim--top" aria-hidden="true" />
      <div class="docs-edge-scrim docs-edge-scrim--bottom" aria-hidden="true" />

      <DocsHeader />

      <div class="docs-layout-foreground">
        <div class="docs-layout-frame">
          <!-- R2: Synchronous SSR Sidebar (ZERO server:false, ZERO ClientOnly!) -->
          <aside class="docs-layout-sidebar-col">
            <div class="docs-sidebar">
              <DocsSidebar />
            </div>
          </aside>

          <main class="docs-layout-main">
            <div class="docs-content-column">
              <div class="docs-mobile-toolbar">
                <button type="button" class="docs-mobile-action" @click="openSidebarDrawer">
                  <span class="i-carbon-menu text-base" aria-hidden="true" />
                  <span>{{ t('docs.sidebarLabel', isZh ? '目录' : 'Menu') }}</span>
                </button>
                <button
                  v-if="shouldShowAsideOutline"
                  type="button"
                  class="docs-mobile-action docs-mobile-action--outline"
                  @click="openOutlineDrawer"
                >
                  <span class="i-carbon-list text-base" aria-hidden="true" />
                  <span>{{ t('docs.outlineLabel', isZh ? '本页导航' : 'On this page') }}</span>
                </button>
                <DocsFrameworkSwitcher
                  class="docs-mobile-fw"
                  size="sm"
                  :component-slug="activeComponentSlug"
                  :show-status-dots="Boolean(activeComponentSlug)"
                />
              </div>
              <slot />
            </div>
          </main>

          <!-- R2: Synchronous SSR Outline & Aside (ZERO ClientOnly around outline links!) -->
          <aside class="docs-layout-outline-col">
            <div class="docs-outline-sticky">
              <DocsFrameworkSwitcher
                block
                size="sm"
                :component-slug="activeComponentSlug"
                :show-status-dots="Boolean(activeComponentSlug)"
              />

              <div v-show="shouldShowAsideOutline" class="docs-outline-panel">
                <DocsOutline />
              </div>

              <section
                v-if="shouldShowAiNotice"
                class="docs-aside-ai-notice"
                aria-live="polite"
              >
                <div class="docs-aside-ai-notice__title">
                  <span class="i-carbon-warning-alt docs-aside-ai-notice__icon" aria-hidden="true" />
                  <span>{{ t('docs.aiNotice.title', isZh ? 'AI 迁移文档' : 'AI-migrated doc') }}</span>
                </div>
                <p class="docs-aside-ai-notice__desc">
                  {{ t('docs.aiNotice.description', isZh ? '此页面由自动化迁移生成，正在持续人工校对中。' : 'This page was migrated automatically and is undergoing manual review.') }}
                </p>
              </section>

              <div class="docs-aside-actions">
                <DocsCopyPromptButton />
                <DocsAsideCardsShell />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>

    <!-- R4: Pure CSS Footer (ZERO WebGL2 / TouchAurora / ogl!) -->
    <DocsFooter class="docs-layout-footer" />

    <ClientOnly>
      <LazyDocsBackToTop v-if="shouldMountBackToTop" />
      <LazyDocsDrawer
        v-if="sidebarDrawerMounted"
        :visible="sidebarOpen"
        :title="t('docs.sidebarLabel', isZh ? '文档目录' : 'Documentation')"
        direction="left"
        @update:visible="(v) => (sidebarOpen = v)"
      >
        <Suspense>
          <DocsSidebar v-if="sidebarOpen" />
        </Suspense>
      </LazyDocsDrawer>
      <LazyDocsDrawer
        v-if="outlineDrawerMounted"
        :visible="outlineOpen"
        :title="t('docs.outlineLabel', isZh ? '本页导航' : 'On this page')"
        direction="right"
        @update:visible="(v) => (outlineOpen = v)"
      >
        <DocsOutline v-if="outlineOpen" />
      </LazyDocsDrawer>
    </ClientOnly>
  </div>
</template>

<style scoped>
.docs-layout-root {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--docs-surface, #ffffff);
  color: var(--docs-ink, #1f2328);
  isolation: isolate;
}

.docs-layout-stage {
  position: relative;
  flex: 1;
  isolation: isolate;
}

.docs-layout-background {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.docs-tuffex-hero-bg-frame {
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 100vh;
  min-height: 520px;
  overflow: hidden;
  opacity: 0.55;
}

/* R3: Pure CSS multi-stop linear-gradient edge scrims — ZERO backdrop-filter! */
.docs-edge-scrim {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 20;
  pointer-events: none;
}

.docs-edge-scrim--top {
  top: 0;
  height: 84px;
  background: linear-gradient(
    to bottom,
    var(--docs-edge-color) 0%,
    var(--docs-edge-color) 24%,
    color-mix(in srgb, var(--docs-edge-color) 78%, transparent) 58%,
    color-mix(in srgb, var(--docs-edge-color) 28%, transparent) 82%,
    transparent 100%
  );
}

.docs-edge-scrim--bottom {
  bottom: 0;
  height: var(--docs-edge-bottom-height, 56px);
  background: linear-gradient(
    to top,
    var(--docs-edge-color) 0%,
    color-mix(in srgb, var(--docs-edge-color) 68%, transparent) 46%,
    transparent 100%
  );
}

.docs-layout-foreground {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 1;
  justify-content: center;
  padding-top: 84px;
  padding-bottom: 80px;
  padding-inline: var(--docs-frame-gutter, 1rem);
}

.docs-layout-frame {
  display: flex;
  gap: 24px;
  width: 100%;
  min-width: 0;
  max-width: var(--docs-frame-compact, 840px);
}

@media (min-width: 1024px) {
  .docs-layout-frame {
    gap: 32px;
    max-width: calc(var(--docs-frame-compact, 840px) + 240px + 2rem);
  }
}

@media (min-width: 1280px) {
  .docs-layout-frame {
    max-width: calc(var(--docs-frame-compact, 840px) + 236px + 240px + 4rem);
  }
}

.docs-layout-sidebar-col {
  display: none;
  width: 236px;
  flex-shrink: 0;
}

@media (min-width: 1280px) {
  .docs-layout-sidebar-col {
    display: block;
  }
}

.docs-sidebar {
  position: sticky;
  top: 92px;
  height: calc(100vh - 92px);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 6px;
  padding-bottom: calc(var(--docs-edge-bottom-height, 56px) + 2rem);
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

.docs-sidebar:hover {
  scrollbar-color: color-mix(in srgb, var(--docs-ink) 14%, transparent) transparent;
}

.docs-layout-main {
  min-width: 0;
  flex: 1;
}

.docs-content-column {
  margin-inline: auto;
  width: 100%;
  min-width: 0;
  max-width: var(--docs-frame-compact, 840px);
}

.docs-mobile-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

@media (min-width: 1280px) {
  .docs-mobile-toolbar {
    display: none;
  }
}

@media (min-width: 1024px) {
  .docs-mobile-action--outline {
    display: none;
  }
}

.docs-mobile-fw {
  margin-left: auto;
}

.docs-mobile-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 12px;
  border: 0;
  border-radius: 999px;
  background: var(--docs-surface-subtle, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--docs-border-light, #ebeef5);
  color: var(--docs-ink-regular, #4c4f56);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
}

.docs-mobile-action:hover {
  color: var(--docs-ink, #1f2328);
  box-shadow: inset 0 0 0 1px var(--docs-border, #dcdfe6);
}

.docs-layout-outline-col {
  display: none;
  width: 240px;
  flex-shrink: 0;
}

@media (min-width: 1024px) {
  .docs-layout-outline-col {
    display: block;
  }
}

.docs-outline-sticky {
  position: sticky;
  top: 92px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.docs-outline-panel {
  max-height: calc(100vh - 14rem);
  overflow-y: auto;
  padding-right: 4px;
}

.docs-aside-ai-notice {
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--tx-color-warning, #e6a23c) 38%, transparent);
  background: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 10%, transparent);
  padding: 12px 14px;
}

.docs-aside-ai-notice__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--docs-ink);
}

.docs-aside-ai-notice__icon {
  color: var(--tx-color-warning, #e6a23c);
  font-size: 14px;
}

.docs-aside-ai-notice__desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--docs-ink-regular);
}

.docs-aside-actions {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.docs-layout-footer {
  position: relative;
  z-index: 3;
}
</style>
