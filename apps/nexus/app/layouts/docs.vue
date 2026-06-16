<script setup lang="ts">
import { TxGradualBlur } from '@talex-touch/tuffex/gradual-blur'
import { computed, ref } from 'vue'
import TuffexDocsHeroBackground from '~/components/docs/TuffexDocsHeroBackground.vue'
import BackToTop from '~/components/ui/BackToTop.vue'
import Drawer from '~/components/ui/Drawer.vue'

const { t } = useI18n()
const route = useRoute()
const sidebarVisible = ref(false)
const outlineVisible = ref(false)
const outlinePublicState = useState<{ hasOutline: boolean, loading: boolean }>('docs-outline-state', () => ({
  hasOutline: false,
  loading: false,
}))
const shouldShowAsideOutline = computed(() => outlinePublicState.value.hasOutline || outlinePublicState.value.loading)

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
            <TuffexDocsHeroBackground />
          </div>
          <div v-else-if="isTutorialDocs" class="docs-tutorial-background" aria-hidden="true">
            <div class="docs-tutorial-background__beam" />
          </div>
          <div v-else class="docs-background absolute left-1/2 h-[420px] w-[820px] rounded-[200px] from-primary/6 via-primary/3 to-transparent bg-gradient-to-br blur-3xl -top-32 -translate-x-1/2 dark:from-light/10 dark:via-light/5 dark:to-transparent" />
        </Transition>
      </div>
      <TxGradualBlur exponential :div-count="10" position="top" height="72px" :strength="1.3" :opacity="0.85" :z-index="-80" target="page" />
      <TxGradualBlur exponential :div-count="10" position="bottom" height="72px" :strength="1.3" :opacity="0.85" :z-index="-80" target="page" />
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
                <TxButton variant="bare" size="small" native-type="button" class="inline-flex items-center gap-2 bg-white/80 text-xs text-black/70 font-semibold shadow-sm transition hover:bg-white dark:bg-dark/60 dark:text-light/70 dark:hover:bg-dark/40" @click="sidebarVisible = true">
                  <span class="i-carbon-menu text-base" />
                  {{ t('docs.sidebarLabel') }}
                </TxButton>
                <TxButton variant="bare" size="small" native-type="button" class="inline-flex items-center gap-2 bg-white/80 text-xs text-black/70 font-semibold shadow-sm transition hover:bg-white dark:bg-dark/60 dark:text-light/70 dark:hover:bg-dark/40 lg:hidden" @click="outlineVisible = true">
                  <span class="i-carbon-list text-base" />
                  {{ t('docs.outlineLabel') }}
                </TxButton>
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
                <DocsAsideCards />
              </ClientOnly>
            </div>
          </aside>
        </div>
      </div>
    </div>
    <TuffFooter class="docs-layout-footer" />
    <BackToTop />
    <ClientOnly>
      <Drawer
        :visible="sidebarVisible"
        :title="t('docs.sidebarLabel')"
        width="82%"
        direction="left"
        @update:visible="(v) => (sidebarVisible = v)"
      >
        <div class="p-4">
          <DocsSidebar v-if="sidebarVisible" />
        </div>
      </Drawer>
      <Drawer
        :visible="outlineVisible"
        :title="t('docs.outlineLabel')"
        width="82%"
        direction="right"
        @update:visible="(v) => (outlineVisible = v)"
      >
        <div class="p-4">
          <DocsOutline v-if="outlineVisible" />
        </div>
      </Drawer>
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

.docs-tuffex-hero-bg-frame {
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 100vh;
  min-height: 520px;
  overflow: hidden;
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
</style>

<style>
.dark .docs-tuffex-hero-bg-frame,
[data-theme='dark'] .docs-tuffex-hero-bg-frame {
  --tuffex-docs-hero-tone: 2.1;
  opacity: 0.46;
}
</style>
