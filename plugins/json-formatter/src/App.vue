<script setup lang="ts">
/**
 * The Surface renders inside a plugin WebContents, so there is no document head worth managing:
 * the host owns the window chrome and no favicon or theme-color is ever shown. The template's
 * `useHead` block set all three to Vitesse defaults, and once `@unhead/vue` was dropped with the
 * rest of the scaffolding `useHead` became an undefined global that would have thrown on mount.
 */
</script>

<template>
  <RouterView />
</template>
