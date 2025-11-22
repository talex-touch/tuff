<template>
  <div class="provider-skeleton">
    <div class="skeleton-icon" />
    <div class="skeleton-content">
      <div class="skeleton-name" />
      <div class="skeleton-meta" />
    </div>
    <div class="skeleton-badge" />
  </div>
</template>

<style lang="scss" scoped>
.provider-skeleton {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  margin-bottom: 0.25rem;
  border-radius: 0.5rem;
  background: var(--el-fill-color-blank);
}

.skeleton-icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
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

.skeleton-name {
  height: 1rem;
  width: 60%;
  margin-bottom: 0.375rem;
  border-radius: 0.25rem;
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

.skeleton-meta {
  height: 0.75rem;
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
  animation-delay: 0.2s;
}

.skeleton-badge {
  width: 2.5rem;
  height: 1.5rem;
  border-radius: 0.375rem;
  background: linear-gradient(
    90deg,
    var(--el-fill-color-light) 25%,
    var(--el-fill-color) 50%,
    var(--el-fill-color-light) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  animation-delay: 0.3s;
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
