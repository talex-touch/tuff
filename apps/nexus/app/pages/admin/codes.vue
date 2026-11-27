<script setup lang="ts">
// Activation codes live under `/admin/subscriptions`. A route-level redirect
// emits a real 302 instead of rendering an empty 200 admin shell before
// hydration; `/admin/subscriptions` enforces `layouts/admin.vue`'s
// `useAdminGate` for both admins and non-admins.
definePageMeta({
  redirect: '/admin/subscriptions',
})

defineI18nRoute(false)
</script>

<template>
  <div />
</template>
