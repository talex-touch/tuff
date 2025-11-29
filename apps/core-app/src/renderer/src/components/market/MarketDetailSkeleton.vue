<script lang="ts" setup>
defineOptions({
  name: 'MarketDetailSkeleton'
})
</script>

<template>
  <div class="h-full flex flex-col gap-4 p-4">
    <div class="detail-header-skeleton">
      <div class="flex items-center gap-3 flex-1">
        <div class="skeleton-circle" />
        <div class="flex-1 flex flex-col gap-2">
          <div class="skeleton-line" style="width: 200px; height: 20px" />
          <div class="skeleton-line" style="width: 300px; height: 14px" />
        </div>
      </div>
      <div class="skeleton-line" style="width: 100px; height: 36px; border-radius: 8px" />
    </div>

    <div class="detail-content-skeleton">
      <div class="readme-skeleton">
        <div v-for="i in 8" :key="i" class="skeleton-line" :style="{ width: `${Math.random() * 40 + 50}%`, height: '16px' }" />
      </div>

      <div class="sidebar-skeleton">
        <div class="sidebar-card-skeleton">
          <div class="skeleton-line" style="width: 100px; height: 12px" />
          <div class="meta-skeleton">
            <div v-for="i in 4" :key="i" class="flex flex-col gap-1">
              <div class="skeleton-line" style="width: 80px; height: 10px" />
              <div class="skeleton-line" style="width: 100%; height: 14px" />
            </div>
          </div>
        </div>
        <div class="skeleton-line" style="width: 100%; height: 40px; border-radius: 8px" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.detail-header-skeleton {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
}

.detail-content-skeleton {
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.readme-skeleton {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: var(--el-bg-color-overlay);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sidebar-skeleton {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sidebar-card-skeleton {
  background: var(--el-bg-color-overlay);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.meta-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.skeleton-circle {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--el-fill-color);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-line {
  border-radius: 4px;
  background: var(--el-fill-color);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
