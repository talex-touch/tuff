<script setup lang="ts">

defineOptions({
  name: 'TxCardSkeleton',
})
</script>

<template>
  <div class="tx-card-skeleton">
    <div class="tx-card-skeleton__icon" />
    <div class="tx-card-skeleton__content">
      <div class="tx-card-skeleton__header">
        <div class="tx-card-skeleton__title" />
        <div class="tx-card-skeleton__badge" />
      </div>
      <div class="tx-card-skeleton__desc" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tx-card-skeleton {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  margin-bottom: 0.5rem;
  border-radius: 0.75rem;
  background: var(--tx-fill-color-blank, #fff);
  border: 1px solid var(--tx-border-color-light, #e5e7eb);
  box-sizing: border-box;
}

.tx-card-skeleton__icon {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.625rem;
  flex-shrink: 0;
}

.tx-card-skeleton__content {
  flex: 1;
  min-width: 0;
}

.tx-card-skeleton__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.tx-card-skeleton__title {
  height: 1.25rem;
  width: 40%;
  border-radius: 0.25rem;
}

.tx-card-skeleton__badge {
  height: 1.25rem;
  width: 3rem;
  border-radius: 0.375rem;
}

.tx-card-skeleton__desc {
  height: 0.875rem;
  width: 80%;
  border-radius: 0.25rem;
}

.tx-card-skeleton__icon,
.tx-card-skeleton__title,
.tx-card-skeleton__badge,
.tx-card-skeleton__desc {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 70%, transparent) 0%,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 95%, transparent) 50%,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 70%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: tx-card-skeleton-shimmer 1.2s ease-in-out infinite;
}

.tx-card-skeleton__badge {
  animation-delay: 0.1s;
}

.tx-card-skeleton__desc {
  animation-delay: 0.2s;
}

@keyframes tx-card-skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
