<script setup lang="ts">
</script>

<template>
  <div class="relative min-h-screen flex flex-col bg-white text-black dark:bg-black dark:text-light">
    <div>
      <div class="pointer-events-none absolute inset-0 overflow-hidden -z-10">
        <div class="docs-background absolute left-1/2 h-[420px] w-[820px] rounded-[200px] from-primary/6 via-primary/3 to-transparent bg-gradient-to-br blur-3xl -top-32 -translate-x-1/2 dark:from-light/10 dark:via-light/5 dark:to-transparent" />
      </div>
      <TheHeader title="Tuff" class="z-30" />
      <div class="relative flex flex-1 justify-center px-4 pb-24 pt-24 lg:px-10 sm:px-6">
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
    <TuffFooter />
  </div>
</template>
