<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { computed, onMounted, onUnmounted } from 'vue'
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
  t(
    'creditsSummary.notice',
    'Nexus 官方能力按能力自身的计价单位扣费：文本按 1K tokens、图片按张、语音转写按音频秒（长静音与密集语音取较高者）。调用前会先占用一笔预留额度，结算后自动退回多占部分。'
  )
)
const PRICED_UNIT_LABELS: Record<string, string> = {
  '1k_tokens': 'credits / 1K tokens',
  audio_second: 'credits / 音频秒',
  transcript_unit: 'credits / 转写单位',
  image: 'credits / 张'
}
const PRICED_CAPABILITY_LABELS: Record<string, string> = {
  'text.chat': '文本对话',
  'vision.ocr': '图片文字识别',
  'image.translate.e2e': '图片翻译',
  'audio.transcribe': '语音转写',
  'audio.stt': '语音转写'
}
const pricedCapabilities = computed(() =>
  credits.pricing.value
    .filter((rule) => PRICED_CAPABILITY_LABELS[rule.capability])
    .map((rule) => ({
      key: rule.capability,
      label: PRICED_CAPABILITY_LABELS[rule.capability],
      price: `${formatCredits(rule.creditsPerUnit)} ${PRICED_UNIT_LABELS[rule.unit] ?? rule.unit}`
    }))
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
  lastRefreshAt = Date.now()
  void credits.refresh()
}

/**
 * The balance is only ever read when this block is mounted, so a user who spent
 * credits and then opens settings would otherwise be shown the number they left
 * behind. Refocusing the window re-reads it, throttled so alt-tabbing cannot turn
 * into a request loop.
 */
const FOCUS_REFRESH_MIN_INTERVAL_MS = 30_000
let lastRefreshAt = 0

function refreshCreditsOnFocus(): void {
  if (!credits.isLoggedIn.value) return
  if (Date.now() - lastRefreshAt < FOCUS_REFRESH_MIN_INTERVAL_MS) return
  refreshCredits()
}

onMounted(() => {
  window.addEventListener('focus', refreshCreditsOnFocus)
})
onUnmounted(() => {
  window.removeEventListener('focus', refreshCreditsOnFocus)
})
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

    <div
      v-if="credits.isLoggedIn.value && credits.summary.value"
      class="credits-summary"
      :class="{ 'credits-summary--personal': !credits.hasTeamPool.value }"
    >
      <div class="credits-metric credits-metric--primary">
        <span class="credits-metric__label">{{
          t('creditsSummary.personalRemaining', '个人剩余')
        }}</span>
        <strong class="credits-metric__value">{{
          formatCredits(credits.personalRemaining.value)
        }}</strong>
      </div>
      <div class="credits-metric">
        <span class="credits-metric__label">{{
          t('creditsSummary.personalUsed', '个人已用')
        }}</span>
        <strong class="credits-metric__value">{{
          formatCredits(credits.personalUsed.value)
        }}</strong>
      </div>
      <div class="credits-metric">
        <span class="credits-metric__label">{{
          t('creditsSummary.personalQuota', '个人总额')
        }}</span>
        <strong class="credits-metric__value">{{
          formatCredits(credits.personalQuota.value)
        }}</strong>
      </div>
      <div v-if="credits.hasTeamPool.value" class="credits-metric">
        <span class="credits-metric__label">{{
          t('creditsSummary.teamRemaining', '团队池剩余')
        }}</span>
        <strong class="credits-metric__value">{{
          formatCredits(credits.teamRemaining.value)
        }}</strong>
      </div>
    </div>

    <TuffBlockSlot
      v-if="!credits.isLoggedIn.value"
      :title="t('creditsSummary.loginTitle', '需要登录')"
      :description="
        t('creditsSummary.loginDescription', '请先登录 Tuff 账户以读取 Nexus credits summary。')
      "
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

    <div v-if="credits.isLoggedIn.value && pricedCapabilities.length" class="credits-pricing">
      <div v-for="entry in pricedCapabilities" :key="entry.key" class="credits-pricing__row">
        <span class="credits-pricing__label">{{ entry.label }}</span>
        <span class="credits-pricing__price">{{ entry.price }}</span>
      </div>
    </div>

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

.credits-summary--personal {
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.credits-pricing {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 16px;
  padding: 0 12px 12px;
}

.credits-pricing__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
}

.credits-pricing__label,
.credits-pricing__price {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credits-pricing__label {
  color: var(--tx-text-color-secondary);
}

.credits-pricing__price {
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

  .credits-pricing {
    grid-template-columns: 1fr;
  }
}
</style>
