<template>
  <div class="capability-skeleton">
    <div class="skeleton-icon" />
    <div class="skeleton-content">
      <div class="skeleton-header">
        <div class="skeleton-title" />
        <div class="skeleton-badge" />
      </div>
      <div class="skeleton-description" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.capability-skeleton {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  margin-bottom: 0.5rem;
  border-radius: 0.75rem;
  background: var(--el-fill-color-blank);
  border: 1.5px solid var(--el-border-color-light);
}

.skeleton-icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.625rem;
  background: linear-gradient(
    90deg,
    var(--el-fill-color-light) 25%,
    var(--el-fill-color) 50%,
    var(--el-fill-color-light) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  flex-shrink: 0;
}

.skeleton-content {
  flex: 1;
  min-width: 0;
}

.skeleton-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.skeleton-title {
  height: 1.25rem;
  width: 40%;
  border-radius: 0.25rem;
  background: linear-gradient(
    90deg,
    var(--el-fill-color-light) 25%,
    var(--el-fill-color) 50%,
    var(--el-fill-color-light) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton-badge {
  height: 1.25rem;
  width: 3rem;
  border-radius: 0.375rem;
  background: linear-gradient(
    90deg,
    var(--el-fill-color-light) 25%,
    var(--el-fill-color) 50%,
    var(--el-fill-color-light) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  animation-delay: 0.1s;
}

.skeleton-description {
  height: 0.875rem;
  width: 80%;
  border-radius: 0.25rem;
  background: linear-gradient(
    90deg,
    var(--el-fill-color-light) 25%,
    var(--el-fill-color) 50%,
    var(--el-fill-color-light) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  animation-delay: 0.2s;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
