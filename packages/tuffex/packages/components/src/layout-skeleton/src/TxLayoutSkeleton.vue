<script setup lang="ts">
defineOptions({
  name: 'TxLayoutSkeleton',
})
</script>

<template>
  <div class="tx-layout-skeleton">
    <div class="tx-layout-skeleton__container">
      <div class="tx-layout-skeleton__header">
        <div class="tx-layout-skeleton__line tx-layout-skeleton__header-line" />
      </div>

      <div class="tx-layout-skeleton__main">
        <div class="tx-layout-skeleton__sidebar">
          <div v-for="i in 6" :key="i" class="tx-layout-skeleton__sidebar-item">
            <div class="tx-layout-skeleton__circle" />
            <div class="tx-layout-skeleton__line tx-layout-skeleton__sidebar-text" />
          </div>
        </div>

        <div class="tx-layout-skeleton__content">
          <div v-for="i in 8" :key="i" class="tx-layout-skeleton__content-line">
            <div class="tx-layout-skeleton__line" :style="{ width: `${Math.random() * 40 + 40}%` }" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@keyframes tx-skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.tx-layout-skeleton {
  width: 100%;
  height: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter, #eee);
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 65%, transparent);
}

.tx-layout-skeleton__container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tx-layout-skeleton__header {
  height: 40px;
  padding: 0 16px;
  display: flex;
  align-items: center;
}

.tx-layout-skeleton__header-line {
  width: 200px;
  height: 20px;
}

.tx-layout-skeleton__main {
  flex: 1;
  display: flex;
  padding: 16px;
  gap: 16px;
}

.tx-layout-skeleton__sidebar {
  width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tx-layout-skeleton__sidebar-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: 10px;
  background: var(--tx-fill-color-light, #f5f7fa);
}

.tx-layout-skeleton__circle {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: var(--tx-fill-color, #f0f2f5);
  animation: tx-skeleton-pulse 1.5s ease-in-out infinite;
}

.tx-layout-skeleton__sidebar-text {
  flex: 1;
  height: 16px;
}

.tx-layout-skeleton__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 10px;
  background: var(--tx-bg-color-page, #f7f7f7);
}

.tx-layout-skeleton__content-line {
  height: 20px;
}

.tx-layout-skeleton__line {
  height: 100%;
  border-radius: 6px;
  background: var(--tx-fill-color, #f0f2f5);
  animation: tx-skeleton-pulse 1.5s ease-in-out infinite;
}
</style>
