<script lang="ts" setup>
import { initTuff } from '@talex-touch/utils/plugin/preload'

initTuff(window)
</script>

<template>
  <main font-sans p="4" text="center gray-700 dark:gray-200" class="h-full flex flex-col overflow-hidden">
    <RouterView class="flex-1" />
    <TheFooter class="absolute right-4 bottom-4" />
  </main>
</template>
