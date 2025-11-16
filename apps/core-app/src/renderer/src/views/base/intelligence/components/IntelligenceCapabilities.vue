<script setup name="IntelligenceCapabilities" lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import FlatButton from '@comp/base/button/FlatButton.vue'
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
  router.push('/aisdk/capabilities')
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
    :name="t('settings.aisdk.landing.capabilities.title')"
    :description="t('settings.aisdk.landing.capabilities.desc')"
    default-icon="i-carbon-flow"
    active-icon="i-carbon-flow"
    memory-name="intelligence-capabilities"
  >
    <!-- 配置能力 -->
    <tuff-block-slot
      title="配置能力"
      description="为 OCR、Embedding 等能力绑定渠道与模型"
      default-icon="i-carbon-settings"
      active-icon="i-carbon-settings"
      @click="handleCapabilitiesClick"
    >
      <FlatButton primary @click="handleCapabilitiesClick">
        <i class="i-carbon-launch" />
        <span>进入配置</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 能力审计 -->
    <tuff-block-slot
      title="能力审计"
      description="查看能力调用记录和性能指标"
      default-icon="i-carbon-event-schedule"
      active-icon="i-carbon-event-schedule"
      @click="handleAudit"
    >
      <FlatButton @click="handleAudit">
        <i class="i-carbon-chart-bar" />
        <span>查看审计</span>
      </FlatButton>
    </tuff-block-slot>

    <!-- 消耗统计 -->
    <tuff-block-slot
      :title="`总调用: ${totalCalls} 次`"
      :description="`能力总数: ${capabilityCount} | 已绑定: ${boundCapabilities} | 调用频率: ${avgFrequency}/小时`"
      default-icon="i-carbon-chart-line"
      active-icon="i-carbon-chart-line"
      @click="handleViewMetrics"
    >
      <FlatButton @click="handleViewMetrics">
        <i class="i-carbon-view" />
        <span>查看指标</span>
      </FlatButton>
    </tuff-block-slot>
  </tuff-group-block>
</template>

<style lang="scss" scoped>
</style>