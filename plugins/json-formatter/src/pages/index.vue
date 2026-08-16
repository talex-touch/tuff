<script setup lang="ts">
const router = useRouter()

onMounted(() => {
  router.replace('/json')
})
</script>

<template>
  <div />
</template>

<route lang="yaml">
meta:
  layout: json
</route>
