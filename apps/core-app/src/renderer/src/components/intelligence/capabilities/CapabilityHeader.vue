<template>
  <header class="capability-header">
    <div class="capability-header__content">
      <p class="capability-header__id">{{ capability.id }}</p>
      <h1 class="capability-header__title">{{ capability.label || capability.id }}</h1>
      <p class="capability-header__description">{{ capability.description }}</p>
    </div>
  </header>
</template>

<script lang="ts" setup>
import type { AISDKCapabilityConfig } from '@talex-touch/utils/types/intelligence'

defineProps<{
  capability: AISDKCapabilityConfig
}>()
</script>

<style lang="scss" scoped>
.capability-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  padding: 1.5rem;
  background: var(--el-bg-color);
  border-radius: 1rem;
  border: 1px solid var(--el-border-color-lighter);
}

.capability-header__content {
  flex: 1;
}

.capability-header__id {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--el-text-color-placeholder);
  margin: 0 0 0.5rem 0;
  font-weight: 500;
}

.capability-header__title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.75rem 0;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}

.capability-header__description {
  margin: 0;
  color: var(--el-text-color-regular);
  max-width: 48rem;
  line-height: 1.6;
  font-size: 0.95rem;
}
</style>
