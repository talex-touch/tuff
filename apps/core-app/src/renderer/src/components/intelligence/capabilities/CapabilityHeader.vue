<script lang="ts" setup>
import type { IntelligenceCapabilityConfig } from '@talex-touch/tuff-intelligence'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The top of a built-in skill's drawer: its id and kind, what it does, and the drawer's actions.
 *
 * The skill's name is the drawer's own title, so it is not repeated here. The header scrolls with
 * the drawer body; it is not a window drag region — it sits in a panel over the page, not in the
 * window's title bar.
 */
const props = defineProps<{
  capability: IntelligenceCapabilityConfig
}>()

const { t } = useI18n()

const capabilityType = computed(() => {
  const meta = props.capability.metadata as { type?: string } | undefined
  return typeof meta?.type === 'string' ? meta.type : t('settings.skillsPage.typeBadge')
})
</script>

<template>
  <header class="capability-header">
    <div v-if="$slots.notice" class="capability-header__notice">
      <slot name="notice" />
    </div>
    <div class="capability-header__main">
      <div class="capability-header__content">
        <div class="capability-header__meta">
          <span class="capability-header__id">{{ capability.id }}</span>
          <span class="capability-header__type-badge">{{ capabilityType }}</span>
        </div>
        <p v-if="capability.description" class="capability-header__description">
          {{ capability.description }}
        </p>
      </div>
      <div v-if="$slots.actions" class="capability-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style lang="scss" scoped>
.capability-header {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.capability-header__notice {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2rem;
  color: var(--tx-text-color-secondary);
  font-size: 0.8125rem;
  font-weight: 500;
}

.capability-header__main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.capability-header__content {
  flex: 1;
  min-width: 0;
}

.capability-header__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

.capability-header__description {
  margin: 0.5rem 0 0;
  color: var(--tx-text-color-regular);
  max-width: 48rem;
  line-height: 1.45;
  font-size: 0.8125rem;
}

.capability-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
}
</style>
