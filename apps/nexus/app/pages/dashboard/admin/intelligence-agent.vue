<script setup lang="ts">
// Retired route. The forward is route meta rather than `await navigateTo()` in
// setup: the setup form still rendered and returned a 200 HTML shell on the
// server, so the retired URL only forwarded once hydration ran. A `redirect` on
// the route sends a real 302 and never instantiates this component.
definePageMeta({
  redirect: '/dashboard/admin/intelligence',
})

defineI18nRoute(false)
</script>

<template>
  <div />
</template>
