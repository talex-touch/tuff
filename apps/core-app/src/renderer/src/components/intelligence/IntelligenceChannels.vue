<script setup name="IntelligenceChannels" lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import FlatButton from '~/components/base/button/FlatButton.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'

const { t } = useI18n()
const router = useRouter()
const { providers } = useIntelligenceManager()

const providerCount = computed(() => providers.value?.length || 0)
const enabledCount = computed(() => providers.value?.filter(p => p.enabled).length || 0)
const totalConsumption = ref(0) // TODO: 实际从数据存储获取

function handleChannelsClick() {
  router.push('/intelligence/channels')
}

function handleAudit() {
  router.push('/intelligence/audit')
}

function handleViewStats() {
  console.log('View channel statistics')
}
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.intelligence.landing.channels.title')"
    :description="t('settings.intelligence.landing.channels.desc')"
    default-icon="i-carbon-api-1"
    active-icon="i-carbon-api-1"
    memory-name="intelligence-channels"
  >
    <!-- 配置渠道 -->
    <TuffBlockSlot
      :title="t('settings.intelligence.landing.channels.manageTitle')"
      :description="t('settings.intelligence.landing.channels.manageDesc')"
      default-icon="i-carbon-settings"
      active-icon="i-carbon-settings"
    >
      <FlatButton primary @click="handleChannelsClick">
        <i class="i-carbon-launch" />
        <span>{{ t('settings.intelligence.landing.channels.manageButton') }}</span>
      </FlatButton>
    </TuffBlockSlot>

    <!-- 渠道审计 -->
    <TuffBlockSlot
      :title="t('settings.intelligence.landing.channels.auditTitle')"
      :description="t('settings.intelligence.landing.channels.auditDesc')"
      default-icon="i-carbon-event-schedule"
      active-icon="i-carbon-event-schedule"
      @click="handleAudit"
    >
      <FlatButton @click="handleAudit">
        <i class="i-carbon-chart-line" />
        <span>{{ t('settings.intelligence.landing.channels.auditButton') }}</span>
      </FlatButton>
    </TuffBlockSlot>

    <!-- 累计消耗 -->
    <TuffBlockSlot
      :title="t('settings.intelligence.landing.channels.statsTitle', { amount: totalConsumption.toFixed(2) })"
      :description="t('settings.intelligence.landing.channels.statsDesc', { total: providerCount, enabled: enabledCount })"
      default-icon="i-carbon-chart-bar"
      active-icon="i-carbon-chart-bar"
      @click="handleViewStats"
    >
      <FlatButton @click="handleViewStats">
        <i class="i-carbon-view" />
        <span>{{ t('settings.intelligence.landing.channels.statsButton') }}</span>
      </FlatButton>
    </TuffBlockSlot>
  </TuffGroupBlock>
</template>

<style lang="scss" scoped>
</style>
