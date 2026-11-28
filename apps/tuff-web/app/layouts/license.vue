<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import DocsOutline from '~/components/docs/DocsOutline.vue'
import { TUFF_WEB_OUTLINE_KEY } from '~/composables/useWebCurrentDoc'
import type { DocTocEntry } from '~/utils/docs-outline'

const policyOutline = ref<DocTocEntry[]>([])
provide(TUFF_WEB_OUTLINE_KEY, computed(() => policyOutline.value))
provide('tuff-web-set-policy-outline', (entries: DocTocEntry[]) => {
  policyOutline.value = entries
})
</script>

<template>
  <div class="license-layout-root relative min-h-screen flex flex-col bg-white text-black dark:bg-black dark:text-light">
    <div class="license-layout-stage relative flex-1">
      <div class="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden="true">
        <div class="absolute left-1/2 h-[420px] w-[820px] rounded-[200px] from-primary/6 via-primary/3 to-transparent bg-gradient-to-br -top-32 -translate-x-1/2 dark:from-light/10 dark:via-light/5 dark:to-transparent" />
      </div>
      <!-- Pure CSS linear-gradient edge scrims (ZERO fixed backdrop-filter layers) -->
      <div class="license-edge-scrim license-edge-scrim--top" aria-hidden="true" />
      <div class="license-edge-scrim license-edge-scrim--bottom" aria-hidden="true" />

      <TheHeader title="Tuff" class="z-30" />

      <div class="license-layout-foreground relative flex flex-1 justify-center px-4 pb-24 pt-24 lg:px-10 sm:px-6">
        <div class="max-w-7xl w-full flex gap-6 lg:gap-10">
          <main class="flex-1 min-w-0">
            <div class="mx-auto max-w-3xl space-y-10">
              <slot />
            </div>
          </main>
          <aside class="hidden w-[220px] shrink-0 lg:block">
            <div class="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto p-5">
              <DocsOutline />
            </div>
          </aside>
        </div>
      </div>
    </div>
    <TuffFooter class="license-layout-footer" />
  </div>
</template>

<style scoped>
.license-layout-root {
  isolation: isolate;
  --license-edge-color: #ffffff;
}

.dark .license-layout-root,
[data-theme='dark'] .license-layout-root {
  --license-edge-color: #000000;
}

.license-layout-stage {
  isolation: isolate;
}

.license-layout-foreground {
  z-index: 2;
}

.license-layout-footer {
  position: relative;
  z-index: 3;
}

.license-edge-scrim {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 20;
  pointer-events: none;
}

.license-edge-scrim--top {
  top: 0;
  height: 88px;
  background: linear-gradient(
    to bottom,
    var(--license-edge-color) 0%,
    color-mix(in srgb, var(--license-edge-color) 70%, transparent) 55%,
    transparent 100%
  );
}

.license-edge-scrim--bottom {
  bottom: 0;
  height: 56px;
  background: linear-gradient(
    to top,
    var(--license-edge-color) 0%,
    color-mix(in srgb, var(--license-edge-color) 65%, transparent) 50%,
    transparent 100%
  );
}
</style>
