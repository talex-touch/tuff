<script setup lang="ts">
const route = useRoute()

const pathParam = route.params.path
const tail = Array.isArray(pathParam)
  ? pathParam.join('/')
  : String(pathParam || '')

await navigateTo({
  path: tail ? `/admin/${tail}` : '/admin',
  query: route.query,
}, {
  replace: true,
  redirectCode: 302,
})
</script>

<template>
  <main class="cms-legacy-redirect">
    <p>Legacy CMS 页面已迁移到 Admin，正在跳转...</p>
    <a href="/admin">若未自动跳转，请点击这里</a>
  </main>
</template>

<style scoped>
.cms-legacy-redirect {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--tx-text-color-primary);
}
</style>
