<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

defineProps<{
  activeCount: number
  totalBindings: number
  totalModels: number
}>()

const { t } = useI18n()
</script>

<template>
  <div class="capability-overview">
    <div class="overview-card">
      <div class="overview-card__item">
        <span class="overview-card__value">{{ activeCount }}</span>
        <span class="overview-card__label">{{ t('settings.intelligence.activeProviders') }}</span>
      </div>
      <div class="overview-card__item">
        <span class="overview-card__value">{{ totalBindings }}</span>
        <span class="overview-card__label">{{ t('settings.intelligence.totalBindings') }}</span>
      </div>
      <div class="overview-card__item">
        <span class="overview-card__value">{{ totalModels }}</span>
        <span class="overview-card__label">{{ t('settings.intelligence.configuredModels') }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.capability-overview {
  margin-bottom: 0.75rem;
}

.overview-card {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  padding: 0.875rem 1rem;
  background: var(--tx-fill-color-blank);
  border-radius: 1rem;
  border: 1px solid var(--tx-border-color-lighter);
}

.overview-card__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.25rem 0.75rem;

  & + & {
    border-left: 1px solid var(--tx-border-color-lighter);
  }
}

.overview-card__label {
  max-width: 100%;
  font-size: 0.75rem;
  color: var(--tx-text-color-secondary);
  font-weight: 500;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-card__value {
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--tx-text-color-primary);
  line-height: 1;
}
</style>
