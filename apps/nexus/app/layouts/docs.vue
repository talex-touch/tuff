<script setup lang="ts">
import { TxGradualBlur } from '@talex-touch/tuffex'
import { ref } from 'vue'
import Drawer from '~/components/ui/Drawer.vue'

const { t } = useI18n()
const sidebarVisible = ref(false)
const outlineVisible = ref(false)
</script>

<template>
  <div class="relative min-h-screen flex flex-col bg-white text-black dark:bg-dark dark:text-light">
    <div>
      <div class="pointer-events-none absolute inset-0 overflow-hidden -z-10">
        <div class="docs-background absolute left-1/2 h-[420px] w-[820px] rounded-[200px] from-primary/6 via-primary/3 to-transparent bg-gradient-to-br blur-3xl -top-32 -translate-x-1/2 dark:from-light/10 dark:via-light/5 dark:to-transparent" />
      </div>
      <TxGradualBlur position="top" height="72px" :strength="1.3" :opacity="0.85" :z-index="-80" target="page" />
      <TxGradualBlur position="bottom" height="72px" :strength="1.3" :opacity="0.85" :z-index="-80" target="page" />
      <TheHeader title="Tuff Docs" class="z-30" />
      <div class="relative flex flex-1 justify-center px-4 pb-20 pt-20 lg:px-10 sm:px-6">
        <div class="max-w-7xl w-full flex gap-6 lg:gap-8">
          <aside class="hidden w-[200px] shrink-0 xl:block">
            <div class="docs-sidebar sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto pb-8 pr-1.5">
              <DocsSidebar />
            </div>
          </aside>
          <main class="flex-1">
            <div class="mx-auto max-w-3xl space-y-10">
              <div class="flex items-center gap-2 xl:hidden">
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-full border border-dark/10 bg-white/80 px-3 py-1.5 text-xs text-black/70 font-semibold shadow-sm transition hover:bg-white dark:border-light/10 dark:bg-dark/60 dark:text-light/70 dark:hover:bg-dark/40"
                  @click="sidebarVisible = true"
                >
                  <span class="i-carbon-menu text-base" />
                  {{ t('docs.sidebarLabel') }}
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-full border border-dark/10 bg-white/80 px-3 py-1.5 text-xs text-black/70 font-semibold shadow-sm transition hover:bg-white dark:border-light/10 dark:bg-dark/60 dark:text-light/70 dark:hover:bg-dark/40 lg:hidden"
                  @click="outlineVisible = true"
                >
                  <span class="i-carbon-list text-base" />
                  {{ t('docs.outlineLabel') }}
                </button>
              </div>
              <slot />
            </div>
          </main>
          <aside class="hidden w-[240px] shrink-0 lg:block">
            <div class="sticky top-24 flex flex-col gap-6">
              <div class="docs-outline-panel max-h-[calc(100vh-12rem)] overflow-y-auto pr-2">
                <DocsOutline />
              </div>
              <DocsAsideCards />
            </div>
          </aside>
        </div>
      </div>
    </div>
    <TuffFooter />
    <Drawer
      :visible="sidebarVisible"
      :title="t('docs.sidebarLabel')"
      width="82%"
      direction="left"
      @update:visible="(v) => (sidebarVisible = v)"
    >
      <div class="p-4">
        <DocsSidebar />
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
        <DocsOutline />
      </div>
    </Drawer>
  </div>
</template>

<style scoped>
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
  background: rgba(0, 0, 0, 0.1);
}
:root.dark .docs-outline-panel:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}
</style>
