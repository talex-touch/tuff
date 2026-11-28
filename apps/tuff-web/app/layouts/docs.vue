<script setup lang="ts">
import { hasWindow } from '@talex-touch/utils/env'
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import DocsOutline from '~/components/docs/DocsOutline.vue'
import DocsSidebar from '~/components/docs/DocsSidebar.vue'
import { TUFF_WEB_CURRENT_DOC_KEY, useWebCurrentDoc } from '~/composables/useWebCurrentDoc'
import { resolveLocaleFromPath } from '~/utils/web-route'

const LazyDocsDrawer = defineAsyncComponent(() => import('~/components/docs/DocsDrawer.vue'))
const LazyDocsBackToTop = defineAsyncComponent(() => import('~/components/docs/DocsBackToTop.vue'))

const BACK_TO_TOP_SCROLL_Y = 260

const route = useRoute()
const { t } = useI18n()

// Create compiled SFC doc context synchronously and provide to pages & outline before awaiting `ready`
const currentDoc = useWebCurrentDoc()
provide(TUFF_WEB_CURRENT_DOC_KEY, currentDoc)

const sidebarOpen = ref(false)
const outlineOpen = ref(false)
const sidebarDrawerMounted = ref(false)
const outlineDrawerMounted = ref(false)
const shouldMountBackToTop = ref(false)
let scrollRaf: number | null = null

const docsLocale = computed(() => resolveLocaleFromPath(route.path))
const isZh = computed(() => docsLocale.value === 'zh')
const shouldShowAsideOutline = computed(() => currentDoc.docOutline.value.length > 0)

function openSidebarDrawer() {
  sidebarDrawerMounted.value = true
  sidebarOpen.value = true
}

function openOutlineDrawer() {
  outlineDrawerMounted.value = true
  outlineOpen.value = true
}

function checkBackToTop() {
  if (!hasWindow() || shouldMountBackToTop.value)
    return
  if (window.scrollY > BACK_TO_TOP_SCROLL_Y)
    shouldMountBackToTop.value = true
}

function onWindowScroll() {
  if (!hasWindow() || shouldMountBackToTop.value || scrollRaf !== null)
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
  if (hasWindow())
    window.addEventListener('scroll', onWindowScroll, { passive: true })
})

onBeforeUnmount(() => {
  if (hasWindow()) {
    window.removeEventListener('scroll', onWindowScroll)
    if (scrollRaf !== null) {
      window.cancelAnimationFrame(scrollRaf)
      scrollRaf = null
    }
  }
})

await currentDoc.ready
</script>

<template>
  <div class="docs-layout-root">
    <div class="docs-layout-stage">
      <!-- Pure CSS multi-stop linear-gradient edge scrims (ZERO fixed backdrop-filter blur layers) -->
      <div class="docs-edge-scrim docs-edge-scrim--top" aria-hidden="true" />
      <div class="docs-edge-scrim docs-edge-scrim--bottom" aria-hidden="true" />

      <TheHeader title="Docs" />

      <div class="docs-layout-foreground">
        <div class="docs-layout-frame">
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
              </div>
              <slot />
            </div>
          </main>

          <aside class="docs-layout-outline-col">
            <div class="docs-outline-sticky">
              <div v-show="shouldShowAsideOutline" class="docs-outline-panel">
                <DocsOutline />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>

    <TuffFooter class="docs-layout-footer" />

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

.docs-edge-scrim {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 20;
  pointer-events: none;
}

.docs-edge-scrim--top {
  top: 0;
  height: 88px;
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
  padding-top: 96px;
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
    max-width: calc(var(--docs-frame-compact, 840px) + 244px + 240px + 4rem);
  }
}

.docs-layout-sidebar-col {
  display: none;
  width: 244px;
  flex-shrink: 0;
}

@media (min-width: 1280px) {
  .docs-layout-sidebar-col {
    display: block;
  }
}

.docs-sidebar {
  position: sticky;
  top: 96px;
  height: calc(100vh - 96px);
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
  top: 96px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.docs-outline-panel {
  max-height: calc(100vh - 14rem);
  overflow-y: auto;
  padding-right: 4px;
}

.docs-layout-footer {
  position: relative;
  z-index: 3;
}
</style>
