<script setup name="IntelligenceCapabilities" lang="ts">
import { TxButton } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import IntelligenceAuditOverlay from '~/components/intelligence/audit/IntelligenceAuditOverlay.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'

const { t } = useI18n()
const router = useRouter()
const { capabilities } = useIntelligenceManager()

const capabilityCount = computed(() => Object.keys(capabilities.value || {}).length)
const boundCapabilities = computed(
  () =>
    Object.values(capabilities.value || {}).filter((c) => c.providers && c.providers.length > 0)
      .length
)

const auditVisible = ref(false)
const auditSource = ref<HTMLElement | null>(null)

function handleCapabilitiesClick() {
  router.push('/intelligence/capabilities')
}

function handleAudit(event: MouseEvent) {
  auditSource.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  auditVisible.value = true
}

function handleViewMetrics(event: MouseEvent) {
  auditSource.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  auditVisible.value = true
}
</script>

<template>
  <TuffGroupBlock
    :name="t('settings.intelligence.landing.capabilities.title')"
    :description="t('settings.intelligence.landing.capabilities.desc')"
    default-icon="i-carbon-flow"
    active-icon="i-carbon-flow"
    memory-name="intelligence-capabilities"
  >
    <!-- 配置能力 -->
    <TuffBlockSlot
      :title="t('settings.intelligence.landing.capabilities.manageTitle')"
      :description="t('settings.intelligence.landing.capabilities.manageDesc')"
      default-icon="i-carbon-settings"
      active-icon="i-carbon-settings"
      @click="handleCapabilitiesClick"
    >
      <TxButton variant="flat" type="primary" @click="handleCapabilitiesClick">
        <i class="i-carbon-launch" />
        <span>{{ t('settings.intelligence.landing.capabilities.manageButton') }}</span>
      </TxButton>
    </TuffBlockSlot>

    <!-- 能力审计 -->
    <TuffBlockSlot
      :title="t('settings.intelligence.landing.capabilities.auditTitle')"
      :description="t('settings.intelligence.landing.capabilities.auditDesc')"
      default-icon="i-carbon-event-schedule"
      active-icon="i-carbon-event-schedule"
      @click="handleAudit"
    >
      <TxButton variant="flat" @click="handleAudit">
        <i class="i-carbon-chart-bar" />
        <span>{{ t('settings.intelligence.landing.capabilities.auditButton') }}</span>
      </TxButton>
    </TuffBlockSlot>

    <!-- 消耗统计 -->
    <TuffBlockSlot
      :title="t('settings.intelligence.landing.capabilities.statsTitle', { count: '—' })"
      :description="
        t('settings.intelligence.landing.capabilities.statsDesc', {
          total: capabilityCount,
          bound: boundCapabilities,
          freq: '—'
        })
      "
      default-icon="i-carbon-chart-line"
      active-icon="i-carbon-chart-line"
      @click="handleViewMetrics"
    >
      <TxButton variant="flat" @click="handleViewMetrics">
        <i class="i-carbon-view" />
        <span>{{ t('settings.intelligence.landing.capabilities.statsButton') }}</span>
      </TxButton>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <IntelligenceAuditOverlay v-model="auditVisible" :source="auditSource" />
</template>

<style lang="scss" scoped></style>
