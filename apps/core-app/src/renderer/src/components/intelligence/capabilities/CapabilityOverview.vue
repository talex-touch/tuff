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

<style lang="scss" scoped>
.capability-overview {
  margin-bottom: 1rem;
}

.overview-card {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.875rem;
  padding: 1.25rem;
  background: linear-gradient(135deg, var(--el-fill-color-blank) 0%, var(--el-fill-color) 100%);
  border-radius: 1rem;
  border: 1px solid var(--el-border-color-lighter);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.overview-card__item {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 1.125rem;
  background: var(--el-fill-color-blank);
  border-radius: 0.875rem;
  border: 1px solid var(--el-border-color-lighter);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
  }
}

.overview-card__icon {
  font-size: 1.75rem;
  flex-shrink: 0;
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: linear-gradient(
    135deg,
    var(--el-color-primary-light-8) 0%,
    var(--el-color-primary-light-9) 100%
  );
  color: var(--el-color-primary);
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
  letter-spacing: 0.02em;
}

.overview-card__value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1;
}
</style>
