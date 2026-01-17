<script setup lang="ts">
defineOptions({
  name: 'TxListItemSkeleton',
})
</script>

<template>
  <div class="tx-list-item-skeleton">
    <div class="tx-list-item-skeleton__icon" />
    <div class="tx-list-item-skeleton__content">
      <div class="tx-list-item-skeleton__name" />
      <div class="tx-list-item-skeleton__meta" />
    </div>
    <div class="tx-list-item-skeleton__badge" />
  </div>
</template>

<style lang="scss" scoped>
.tx-list-item-skeleton {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  margin-bottom: 0.25rem;
  border-radius: 0.5rem;
  background: var(--tx-fill-color-blank, #fff);
  box-sizing: border-box;
}

.tx-list-item-skeleton__icon {
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  flex-shrink: 0;
}

.tx-list-item-skeleton__content {
  flex: 1;
  min-width: 0;
}

.tx-list-item-skeleton__name {
  height: 1rem;
  width: 60%;
  margin-bottom: 0.375rem;
  border-radius: 0.25rem;
}

.tx-list-item-skeleton__meta {
  height: 0.75rem;
  width: 40%;
  border-radius: 0.25rem;
}

.tx-list-item-skeleton__badge {
  width: 2.5rem;
  height: 1.5rem;
  border-radius: 0.375rem;
}

.tx-list-item-skeleton__icon,
.tx-list-item-skeleton__name,
.tx-list-item-skeleton__meta,
.tx-list-item-skeleton__badge {
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 70%, transparent) 0%,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 95%, transparent) 50%,
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 70%, transparent) 100%
  );
  background-size: 200% 100%;
  animation: tx-list-item-skeleton-shimmer 1.2s ease-in-out infinite;
}

.tx-list-item-skeleton__name {
  animation-delay: 0.1s;
}

.tx-list-item-skeleton__meta {
  animation-delay: 0.2s;
}

.tx-list-item-skeleton__badge {
  animation-delay: 0.3s;
}

@keyframes tx-list-item-skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
