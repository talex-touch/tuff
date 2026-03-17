<script setup lang="ts">
const route = useRoute()
const router = useRouter()

function safeBack(fallback = '/') {
  if (!import.meta.client) {
    void router.replace(fallback)
    return
  }
  if (window.history.length > 1) {
    router.back()
    return
  }
  void router.replace(fallback)
}

function handleBack() {
  const any: any = route.meta.back

  if (typeof any === 'function') {
    if (any()) {
      safeBack()
    }
    return
  }

  safeBack()
}
</script>

<template>
  <div class="AdaptTemplate">
    <div class="AdaptTemplate-Header">
      <div i-carbon:arrow-left @click="handleBack" />
      <p>{{ route.meta.name }}</p>
      <div />
    </div>
    <div class="AdaptTemplate-Content">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.AdaptTemplate-Header {
  display: flex;

  align-items: center;
  justify-content: space-between;
}

.AdaptTemplate {
  .mobile & {
    flex-direction: column;
  }
  position: absolute;
  padding: 1rem;
  display: flex;

  width: 100%;
  height: 100%;

  background-color: var(--el-bg-color);
}
</style>
