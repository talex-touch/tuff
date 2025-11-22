<script lang="ts" setup>
import type { AISDKCapabilityConfig } from '@talex-touch/utils/types/intelligence'

defineProps<{
  capability: AISDKCapabilityConfig
}>()
</script>

<template>
  <header class="capability-header">
    <div class="capability-header__content">
      <div class="capability-header__meta">
        <span class="capability-header__id">{{ capability.id }}</span>
        <span class="capability-header__type-badge">{{ capability.type || 'capability' }}</span>
      </div>
      <h1 class="capability-header__title">
        {{ capability.label || capability.id }}
      </h1>
      <p class="capability-header__description">
        {{ capability.description }}
      </p>
    </div>
  </header>
</template>

<style lang="scss" scoped>
.capability-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  padding: 1.5rem 1.5rem 1rem 1.5rem;
  background: linear-gradient(180deg, var(--el-fill-color-blank) 0%, transparent 100%);
}

.capability-header__content {
  flex: 1;
}

.capability-header__meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.625rem;
}

.capability-header__id {
  font-size: 0.6875rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--el-text-color-placeholder);
  font-weight: 600;
}

.capability-header__type-badge {
  display: inline-flex;
  padding: 0.125rem 0.5rem;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.capability-header__title {
  font-size: 1.875rem;
  font-weight: 700;
  margin: 0 0 0.875rem 0;
  color: var(--el-text-color-primary);
  line-height: 1.2;
  background: linear-gradient(135deg, var(--el-text-color-primary) 0%, var(--el-text-color-regular) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.capability-header__description {
  margin: 0;
  color: var(--el-text-color-regular);
  max-width: 48rem;
  line-height: 1.7;
  font-size: 0.9375rem;
}
</style>
