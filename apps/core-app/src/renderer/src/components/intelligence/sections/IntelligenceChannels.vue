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
  router.push('/aisdk/channels')
}

function handleAudit() {
  console.log('Open channel audit')
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
      title="配置渠道"
      description="接入 OpenAI、DeepSeek、Siliconflow 等渠道"
      default-icon="i-carbon-settings"
      active-icon="i-carbon-settings"
      @click="handleChannelsClick"
    >
      <FlatButton primary @click="handleChannelsClick">
        <i class="i-carbon-launch" />
        <span>进入配置</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 渠道审计 -->
    <tuff-block-slot
      title="渠道审计"
      description="查看渠道调用历史和日志"
      default-icon="i-carbon-event-schedule"
      active-icon="i-carbon-event-schedule"
      @click="handleAudit"
    >
      <FlatButton @click="handleAudit">
        <i class="i-carbon-chart-line" />
        <span>查看审计</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 累计消耗 -->
    <tuff-block-slot
      :title="`累计消耗: $${totalConsumption.toFixed(2)}`"
      :description="`渠道总数: ${providerCount} | 已启用: ${enabledCount}`"
      default-icon="i-carbon-chart-bar"
      active-icon="i-carbon-chart-bar"
      @click="handleViewStats"
    >
      <FlatButton @click="handleViewStats">
        <i class="i-carbon-view" />
        <span>查看统计</span>
      </FlatButton>
    </tuff-block-slot>
  </tuff-group-block>
</template>

<style lang="scss" scoped>
</style>