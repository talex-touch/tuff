<script setup name="IntelligenceChannels" lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import FlatButton from '~/components/base/button/FlatButton.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'
import { computed, ref } from 'vue'

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
  <tuff-group-block
    :name="t('settings.aisdk.landing.channels.title')"
    :description="t('settings.aisdk.landing.channels.desc')"
    default-icon="i-carbon-api-1"
    active-icon="i-carbon-api-1"
    memory-name="intelligence-channels"
  >
    <!-- 配置渠道 -->
    <tuff-block-slot
      :title="t('settings.aisdk.landing.channels.manageTitle')"
      :description="t('settings.aisdk.landing.channels.manageDesc')"
      default-icon="i-carbon-settings"
      active-icon="i-carbon-settings"
      @click="handleChannelsClick"
    >
      <FlatButton primary @click="handleChannelsClick">
        <i class="i-carbon-launch" />
        <span>{{ t('settings.aisdk.landing.channels.manageButton') }}</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 渠道审计 -->
    <tuff-block-slot
      :title="t('settings.aisdk.landing.channels.auditTitle')"
      :description="t('settings.aisdk.landing.channels.auditDesc')"
      default-icon="i-carbon-event-schedule"
      active-icon="i-carbon-event-schedule"
      @click="handleAudit"
    >
      <FlatButton @click="handleAudit">
        <i class="i-carbon-chart-line" />
        <span>{{ t('settings.aisdk.landing.channels.auditButton') }}</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 累计消耗 -->
    <tuff-block-slot
      :title="t('settings.aisdk.landing.channels.statsTitle', { amount: totalConsumption.toFixed(2) })"
      :description="t('settings.aisdk.landing.channels.statsDesc', { total: providerCount, enabled: enabledCount })"
      default-icon="i-carbon-chart-bar"
      active-icon="i-carbon-chart-bar"
      @click="handleViewStats"
    >
      <FlatButton @click="handleViewStats">
        <i class="i-carbon-view" />
        <span>{{ t('settings.aisdk.landing.channels.statsButton') }}</span>
      </FlatButton>
    </tuff-block-slot>
  </tuff-group-block>
</template>

<style lang="scss" scoped>
</style>
