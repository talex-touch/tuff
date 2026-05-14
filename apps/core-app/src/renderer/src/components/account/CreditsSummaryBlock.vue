<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useCreditsSummary } from '~/modules/nexus/credits-summary'

withDefaults(
  defineProps<{
    context?: 'settings' | 'intelligence'
  }>(),
  {
    context: 'settings'
  }
)

const { t } = useI18n()
const credits = useCreditsSummary()

const title = computed(() => t('creditsSummary.title', 'AI 积分'))
const description = computed(() =>
  t('creditsSummary.description', '查看 Nexus AI credits 的剩余、已用和总额度。')
)
const notice = computed(() =>
  t('creditsSummary.notice', 'Nexus 官方 provider 调用会按模型返回的 totalTokens 消耗该额度。')
)
const statusDescription = computed(() => {
  if (!credits.isLoggedIn.value) {
    return t('creditsSummary.loginRequired', '登录后可查看 credits 剩余和消耗。')
  }
  if (credits.error.value) {
    return credits.error.value
  }
  if (credits.loading.value && !credits.summary.value) {
    return t('creditsSummary.loading', '正在获取 credits 信息。')
  }
  if (!credits.summary.value) {
    return t('creditsSummary.empty', '暂无 credits 信息。')
  }
  return t('creditsSummary.month', {
    month: credits.summary.value.month || '-'
  })
})

function formatCredits(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
}

function refreshCredits() {
  void credits.refresh()
}
</script>

<template>
  <TuffGroupBlock
    :name="title"
    :description="description"
    default-icon="i-carbon-currency-dollar"
    active-icon="i-carbon-currency-dollar"
    memory-name="credits-summary"
  >
    <TuffBlockSlot
      :title="title"
      :description="statusDescription"
      default-icon="i-carbon-meter"
      active-icon="i-carbon-meter"
      :active="Boolean(credits.summary.value)"
    >
      <div class="credits-actions">
        <TxButton
          v-if="credits.isLoggedIn.value"
          variant="flat"
          size="sm"
          :loading="credits.loading.value"
          @click.stop="refreshCredits"
        >
          <i class="i-carbon-renew" />
          <span>{{ t('creditsSummary.refresh', '刷新') }}</span>
        </TxButton>
        <TxButton
          v-if="credits.isLoggedIn.value"
          variant="flat"
          size="sm"
          type="primary"
          @click.stop="credits.openCreditsDashboard"
        >
          <i class="i-carbon-launch" />
          <span>{{ t('creditsSummary.openDashboard', '打开 Nexus') }}</span>
        </TxButton>
      </div>
    </TuffBlockSlot>

    <div v-if="credits.isLoggedIn.value && credits.summary.value" class="credits-summary">
      <div class="credits-metric credits-metric--primary">
        <span class="credits-metric__label">{{ t('creditsSummary.personalRemaining', '个人剩余') }}</span>
        <strong class="credits-metric__value">{{ formatCredits(credits.personalRemaining.value) }}</strong>
      </div>
      <div class="credits-metric">
        <span class="credits-metric__label">{{ t('creditsSummary.personalUsed', '个人已用') }}</span>
        <strong class="credits-metric__value">{{ formatCredits(credits.personalUsed.value) }}</strong>
      </div>
      <div class="credits-metric">
        <span class="credits-metric__label">{{ t('creditsSummary.personalQuota', '个人总额') }}</span>
        <strong class="credits-metric__value">{{ formatCredits(credits.personalQuota.value) }}</strong>
      </div>
      <div class="credits-metric">
        <span class="credits-metric__label">{{ t('creditsSummary.teamRemaining', '团队池剩余') }}</span>
        <strong class="credits-metric__value">{{ formatCredits(credits.teamRemaining.value) }}</strong>
      </div>
    </div>

    <TuffBlockSlot
      v-if="!credits.isLoggedIn.value"
      :title="t('creditsSummary.loginTitle', '需要登录')"
      :description="t('creditsSummary.loginDescription', '请先登录 Tuff 账户以读取 Nexus credits summary。')"
      default-icon="i-carbon-login"
      active-icon="i-carbon-login"
    />

    <TuffBlockSlot
      v-else-if="credits.error.value"
      :title="t('creditsSummary.errorTitle', 'Credits 信息不可用')"
      :description="credits.error.value"
      default-icon="i-carbon-warning"
      active-icon="i-carbon-warning"
    >
      <TxButton
        variant="flat"
        size="sm"
        type="primary"
        :loading="credits.loading.value"
        @click.stop="refreshCredits"
      >
        <i class="i-carbon-renew" />
        <span>{{ t('creditsSummary.retry', '重试') }}</span>
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="context === 'intelligence'"
      :title="t('creditsSummary.billingNoticeTitle', '计费提示')"
      :description="notice"
      default-icon="i-carbon-information"
      active-icon="i-carbon-information"
    />
  </TuffGroupBlock>
</template>

<style scoped>
.credits-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.credits-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 8px 12px 12px;
}

.credits-metric {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 8px;
  background: var(--tx-fill-color-lighter);
}

.credits-metric--primary {
  border-color: color-mix(in srgb, var(--tx-color-primary) 35%, var(--tx-border-color-lighter));
  background: color-mix(in srgb, var(--tx-color-primary) 8%, var(--tx-fill-color-lighter));
}

.credits-metric__label,
.credits-metric__value {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credits-metric__label {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.credits-metric__value {
  margin-top: 4px;
  font-size: 18px;
  line-height: 1.2;
  color: var(--tx-text-color-primary);
}

@media (max-width: 920px) {
  .credits-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .credits-summary {
    grid-template-columns: 1fr;
  }
}
</style>
