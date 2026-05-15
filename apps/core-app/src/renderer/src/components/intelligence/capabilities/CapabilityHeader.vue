<script lang="ts" setup>
import type { IntelligenceCapabilityConfig } from '@talex-touch/tuff-intelligence'
import { computed } from 'vue'

const props = defineProps<{
  capability: IntelligenceCapabilityConfig
}>()

const capabilityType = computed(() => {
  const meta = props.capability.metadata as { type?: string } | undefined
  return typeof meta?.type === 'string' ? meta.type : 'capability'
})
</script>

<template>
  <header class="capability-header">
    <div class="capability-header__content">
      <div class="capability-header__meta">
        <span class="capability-header__id">{{ capability.id }}</span>
        <span class="capability-header__type-badge">{{ capabilityType }}</span>
      </div>
      <h1 class="capability-header__title">
        {{ capability.label || capability.id }}
      </h1>
      <p class="capability-header__description">
        {{ capability.description }}
      </p>
    </div>
    <div v-if="$slots.actions" class="capability-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style lang="scss" scoped>
.capability-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem 1.25rem 0.75rem;
  background: linear-gradient(180deg, var(--tx-fill-color-blank) 0%, transparent 100%);
}

.capability-header__content {
  flex: 1;
  min-width: 0;
}

.capability-header__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.capability-header__id {
  font-size: 0.6875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tx-text-color-placeholder);
  font-weight: 600;
}

.capability-header__type-badge {
  display: inline-flex;
  padding: 0.125rem 0.5rem;
  background: var(--tx-color-primary-light-9);
  color: var(--tx-color-primary);
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.capability-header__title {
  font-size: 1rem;
  font-weight: 700;
  margin: 0 0 0.375rem;
  color: var(--tx-text-color-primary);
  line-height: 1.35;
}

.capability-header__description {
  display: -webkit-box;
  margin: 0;
  color: var(--tx-text-color-regular);
  max-width: 48rem;
  line-height: 1.45;
  font-size: 0.8125rem;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.capability-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  padding-top: 0.25rem;
}
</style>
