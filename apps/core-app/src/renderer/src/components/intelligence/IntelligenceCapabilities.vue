<script setup name="IntelligenceCapabilities" lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { computed, ref } from 'vue'

const { t } = useI18n()
const router = useRouter()
const { capabilities } = useIntelligenceManager()

const capabilityCount = computed(() => Object.keys(capabilities.value || {}).length)
const boundCapabilities = computed(() =>
  Object.values(capabilities.value || {}).filter(c => c.providers && c.providers.length > 0).length
)
const totalCalls = ref(0) // TODO: 实际从数据存储获取
const avgFrequency = ref(0) // TODO: 每小时平均调用次数

function handleCapabilitiesClick() {
  router.push('/intelligence/capabilities')
}

function handleAudit() {
  console.log('Open capability audit')
}

function handleViewMetrics() {
  console.log('View capability metrics')
}
</script>

<template>
  <tuff-group-block
    :name="t('settings.intelligence.landing.capabilities.title')"
    :description="t('settings.intelligence.landing.capabilities.desc')"
    default-icon="i-carbon-flow"
    active-icon="i-carbon-flow"
    memory-name="intelligence-capabilities"
  >
    <!-- 配置能力 -->
    <tuff-block-slot
      :title="t('settings.intelligence.landing.capabilities.manageTitle')"
      :description="t('settings.intelligence.landing.capabilities.manageDesc')"
      default-icon="i-carbon-settings"
      active-icon="i-carbon-settings"
      @click="handleCapabilitiesClick"
    >
      <FlatButton primary @click="handleCapabilitiesClick">
        <i class="i-carbon-launch" />
        <span>{{ t('settings.intelligence.landing.capabilities.manageButton') }}</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 能力审计 -->
    <tuff-block-slot
      :title="t('settings.intelligence.landing.capabilities.auditTitle')"
      :description="t('settings.intelligence.landing.capabilities.auditDesc')"
      default-icon="i-carbon-event-schedule"
      active-icon="i-carbon-event-schedule"
      @click="handleAudit"
    >
      <FlatButton @click="handleAudit">
        <i class="i-carbon-chart-bar" />
        <span>{{ t('settings.intelligence.landing.capabilities.auditButton') }}</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 消耗统计 -->
    <tuff-block-slot
      :title="t('settings.intelligence.landing.capabilities.statsTitle', { count: totalCalls })"
      :description="t('settings.intelligence.landing.capabilities.statsDesc', { total: capabilityCount, bound: boundCapabilities, freq: avgFrequency })"
      default-icon="i-carbon-chart-line"
      active-icon="i-carbon-chart-line"
      @click="handleViewMetrics"
    >
      <FlatButton @click="handleViewMetrics">
        <i class="i-carbon-view" />
        <span>{{ t('settings.intelligence.landing.capabilities.statsButton') }}</span>
      </FlatButton>
    </tuff-block-slot>
  </tuff-group-block>
</template>

<style lang="scss" scoped>
</style>
