<script setup lang="ts">
definePageMeta({
  layout: 'pilot',
})

const router = useRouter()

onMounted(() => {
  void router.replace('/cms/system/pilot-settings')
})
</script>

<template>
  <main class="pilot-admin-redirect">
    <p>存储设置已迁移到 CMS，正在跳转...</p>
    <a href="/cms/system/pilot-settings">若未自动跳转，请点击这里</a>
  </main>
</template>

<style scoped>
.pilot-admin-redirect {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--tx-text-color-primary);
}
</style>
