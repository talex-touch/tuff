<script setup lang="ts">
// `/admin` used to fall through to the catch-all 404. Forward it to the page the
// header menu's admin entry and AdminNav's fallback already open.
definePageMeta({
  redirect: '/admin/updates',
})

defineI18nRoute(false)
</script>

<template>
  <div />
</template>
