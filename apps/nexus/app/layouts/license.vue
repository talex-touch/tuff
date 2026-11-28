<script setup lang="ts">
</script>

<template>
  <div class="license-layout-root relative min-h-screen flex flex-col bg-white text-black dark:bg-black dark:text-light">
    <div class="license-layout-stage relative flex-1">
      <div class="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div class="docs-background absolute left-1/2 h-[420px] w-[820px] rounded-[200px] from-primary/6 via-primary/3 to-transparent bg-gradient-to-br blur-3xl -top-32 -translate-x-1/2 dark:from-light/10 dark:via-light/5 dark:to-transparent" />
      </div>
      <div class="license-edge-blur license-edge-blur--top" aria-hidden="true">
        <span v-for="layer in 4" :key="layer" class="license-edge-blur__layer" />
      </div>
      <div class="license-edge-blur license-edge-blur--bottom" aria-hidden="true">
        <span v-for="layer in 4" :key="layer" class="license-edge-blur__layer" />
      </div>
      <TheHeader title="Tuff" class="z-30" />
      <div class="license-layout-foreground relative flex flex-1 justify-center px-4 pb-24 pt-24 lg:px-10 sm:px-6">
        <div class="max-w-7xl w-full flex gap-6 lg:gap-10">
          <main class="flex-1">
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
  --license-edge-color: #fff;
}

.dark .license-layout-root,
[data-theme='dark'] .license-layout-root {
  --license-edge-color: #000;
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

/* Effect-free progressive blur edge fade matching docs-layout contract (nexus-docs-layout.md). */
.license-edge-blur {
  position: fixed;
  left: 0;
  right: 0;
  z-index: 20;
  height: var(--license-edge-height);
  pointer-events: none;
}

.license-edge-blur--top {
  top: 0;
  --license-edge-height: 88px;
  --license-edge-dir: to top;
}

.license-edge-blur--bottom {
  bottom: 0;
  --license-edge-height: 64px;
  --license-edge-dir: to bottom;
}

.license-edge-blur__layer {
  position: absolute;
  inset: 0;
  -webkit-backdrop-filter: blur(var(--license-edge-blur));
  backdrop-filter: blur(var(--license-edge-blur));
  -webkit-mask-image: linear-gradient(var(--license-edge-dir), var(--license-edge-band));
  mask-image: linear-gradient(var(--license-edge-dir), var(--license-edge-band));
}

.license-edge-blur__layer:nth-child(1) {
  --license-edge-blur: 1px;
  --license-edge-band: transparent 0%, #000 25%, #000 50%, transparent 75%;
}

.license-edge-blur__layer:nth-child(2) {
  --license-edge-blur: 2px;
  --license-edge-band: transparent 25%, #000 50%, #000 75%, transparent 100%;
}

.license-edge-blur__layer:nth-child(3) {
  --license-edge-blur: 4px;
  --license-edge-band: transparent 50%, #000 75%, #000 100%;
}

.license-edge-blur__layer:nth-child(4) {
  --license-edge-blur: 8px;
  --license-edge-band: transparent 75%, #000 100%;
}

.license-edge-blur::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    var(--license-edge-dir),
    transparent 0%,
    color-mix(in srgb, var(--license-edge-color) 55%, transparent) 55%,
    var(--license-edge-color) 92%
  );
}

.license-edge-blur--top::after {
  background: linear-gradient(
    var(--license-edge-dir),
    transparent 8%,
    color-mix(in srgb, var(--license-edge-color) 72%, transparent) 55%,
    var(--license-edge-color) 80%
  );
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .license-edge-blur__layer {
    display: none;
  }
}
</style>
