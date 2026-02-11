<script lang="ts" name="IntelligencePage" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import IntelligenceCapabilities from '~/components/intelligence/IntelligenceCapabilities.vue'
import IntelligenceChannels from '~/components/intelligence/IntelligenceChannels.vue'
import IntelligenceFuture from '~/components/intelligence/IntelligenceFuture.vue'
import IntelligenceHeader from '~/components/intelligence/IntelligenceHeader.vue'
import IntelligencePrompts from '~/components/intelligence/IntelligencePrompts.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'

const { t } = useI18n()
const { providers, capabilities } = useIntelligenceManager()

const providerCount = computed(() => providers.value?.length || 0)
const enabledCount = computed(() => providers.value?.filter((p) => p.enabled).length || 0)
const capabilityCount = computed(() => Object.keys(capabilities.value || {}).length)
const boundCapabilities = computed(
  () =>
    Object.values(capabilities.value || {}).filter((c) => c.providers && c.providers.length > 0)
      .length
)
</script>

<template>
  <ViewTemplate title="Intelligence">
    <IntelligenceHeader />

    <!-- Stats strip -->
    <div class="intelligence-stats">
      <div class="intelligence-stats__item">
        <span class="intelligence-stats__value">{{ providerCount }}</span>
        <span class="intelligence-stats__label">{{
          t('settings.intelligence.statsProviders')
        }}</span>
      </div>
      <div class="intelligence-stats__divider" />
      <div class="intelligence-stats__item">
        <span class="intelligence-stats__value intelligence-stats__value--active">{{
          enabledCount
        }}</span>
        <span class="intelligence-stats__label">{{ t('settings.intelligence.statsActive') }}</span>
      </div>
      <div class="intelligence-stats__divider" />
      <div class="intelligence-stats__item">
        <span class="intelligence-stats__value">{{ capabilityCount }}</span>
        <span class="intelligence-stats__label">{{
          t('settings.intelligence.statsCapabilities')
        }}</span>
      </div>
      <div class="intelligence-stats__divider" />
      <div class="intelligence-stats__item">
        <span class="intelligence-stats__value intelligence-stats__value--bound">{{
          boundCapabilities
        }}</span>
        <span class="intelligence-stats__label">{{ t('settings.intelligence.statsBound') }}</span>
      </div>
    </div>

    <!-- Two-column grid for Channels + Capabilities -->
    <div class="intelligence-grid">
      <IntelligenceChannels />
      <IntelligenceCapabilities />
    </div>

    <IntelligencePrompts />

    <IntelligenceFuture />
  </ViewTemplate>
</template>

<style lang="scss" scoped>
.intelligence-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 0.75rem 1.5rem;
  margin: 0 0 0.75rem;
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-lighter);

  &__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.25rem 0.75rem;
  }

  &__value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--el-text-color-primary);
    line-height: 1.2;

    &--active {
      color: var(--el-color-success);
    }

    &--bound {
      color: var(--el-color-primary);
    }
  }

  &__label {
    font-size: 0.75rem;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
  }

  &__divider {
    width: 1px;
    height: 2rem;
    background: var(--el-border-color-lighter);
  }
}

.intelligence-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}
</style>
