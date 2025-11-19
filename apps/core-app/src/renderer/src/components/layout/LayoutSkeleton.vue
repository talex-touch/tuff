<script lang="ts" setup>
defineOptions({
  name: 'LayoutSkeleton',
})
</script>

<template>
  <div class="LayoutSkeleton fake-background">
    <div class="LayoutSkeleton-Container">
      <!-- Header skeleton -->
      <div class="LayoutSkeleton-Header">
        <div class="skeleton-line skeleton-header-line" />
      </div>

      <!-- Main content skeleton -->
      <div class="LayoutSkeleton-Main">
        <!-- Sidebar skeleton -->
        <div class="LayoutSkeleton-Sidebar">
          <div
            v-for="i in 6"
            :key="i"
            class="skeleton-sidebar-item"
          >
            <div class="skeleton-circle" />
            <div class="skeleton-line skeleton-sidebar-text" />
          </div>
        </div>

        <!-- Content skeleton -->
        <div class="LayoutSkeleton-Content">
          <div
            v-for="i in 8"
            :key="i"
            class="skeleton-content-line"
          >
            <div class="skeleton-line" :style="{ width: `${Math.random() * 40 + 40}%` }" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.LayoutSkeleton {
  position: relative;

  width: 100%;
  height: 100%;

  --fake-inner-opacity: 0.5;
  --fake-radius: 12px;
}

.LayoutSkeleton-Container {
  position: relative;

  width: 100%;
  height: 100%;

  display: flex;
  flex-direction: column;
}

.LayoutSkeleton-Header {
  height: 40px;
  padding: 0 1rem;

  display: flex;
  align-items: center;
}

.skeleton-header-line {
  width: 200px;
  height: 20px;
}

.LayoutSkeleton-Main {
  flex: 1;

  display: flex;

  padding: 1rem;
  gap: 1rem;
}

.LayoutSkeleton-Sidebar {
  width: 200px;

  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.skeleton-sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;

  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.skeleton-circle {
  width: 32px;
  height: 32px;

  border-radius: 50%;
  background: var(--el-fill-color);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-sidebar-text {
  flex: 1;
  height: 16px;
}

.LayoutSkeleton-Content {
  flex: 1;

  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;

  background: var(--el-bg-color-page);
  border-radius: 8px;
}

.skeleton-content-line {
  height: 20px;
}

.skeleton-line {
  height: 100%;

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
