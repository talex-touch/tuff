<template>
  <div class="capability-overview">
    <div class="overview-card">
      <div class="overview-card__item">
        <i class="i-carbon-chart-logistic-regression overview-card__icon" />
        <div class="overview-card__content">
          <span class="overview-card__label">{{ t('settings.intelligence.activeProviders') }}</span>
          <span class="overview-card__value">{{ activeCount }}</span>
        </div>
      </div>
      <div class="overview-card__item">
        <i class="i-carbon-catalog overview-card__icon" />
        <div class="overview-card__content">
          <span class="overview-card__label">{{ t('settings.intelligence.totalBindings') }}</span>
          <span class="overview-card__value">{{ totalBindings }}</span>
        </div>
      </div>
      <div class="overview-card__item">
        <i class="i-carbon-model overview-card__icon" />
        <div class="overview-card__content">
          <span class="overview-card__label">{{
            t('settings.intelligence.configuredModels')
          }}</span>
          <span class="overview-card__value">{{ totalModels }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useI18n } from 'vue-i18n'

defineProps<{
  activeCount: number
  totalBindings: number
  totalModels: number
}>()

const { t } = useI18n()
</script>

<style lang="scss" scoped>
.capability-overview {
  margin-bottom: 0.5rem;
}

.overview-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  padding: 1rem;
  background: var(--el-fill-color-blank);
  border-radius: 0.875rem;
  border: 1px solid var(--el-border-color-lighter);
}

.overview-card__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--el-fill-color);
  border-radius: 0.75rem;
}

.overview-card__icon {
  font-size: 1.5rem;
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.overview-card__content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.overview-card__label {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.overview-card__value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
}
</style>
