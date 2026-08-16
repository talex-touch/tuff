<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '要我下这笔补货单吗？',
      alternativesLabel: '其他方案',
      otherOptionsLabel: '其他方案',
      acceptedLabel: '已接受',
      options: [
        {
          key: 'high',
          short: '从 cone_king 补货 · 7 天交期',
          confidence: 'high' as const,
          label: '高置信',
          cta: '接受',
          ctaTone: 'accent' as const,
        },
        {
          key: 'review',
          short: '换成 vanilla_madagascar',
          confidence: 'medium' as const,
          label: '需要复核',
          cta: '去配置',
        },
        {
          key: 'none',
          short: '全 SKU 整体补货',
          confidence: 'none' as const,
          label: '无信号',
          cta: '接受整体补货',
        },
      ],
      accepted: '已接受方案',
    }
  }

  return {
    title: 'Want me to place this restock order?',
    alternativesLabel: 'Alternatives',
    otherOptionsLabel: 'Other options',
    acceptedLabel: 'Accepted',
    options: [
      {
        key: 'high',
        short: 'Reorder from cone_king · 7-day lead',
        confidence: 'high' as const,
        label: 'High confidence',
        cta: 'Accept',
        ctaTone: 'accent' as const,
      },
      {
        key: 'review',
        short: 'Switch to vanilla_madagascar',
        confidence: 'medium' as const,
        label: 'Needs review',
        cta: 'Configure',
      },
      {
        key: 'none',
        short: 'Full restock across every SKU',
        confidence: 'none' as const,
        label: 'No signal',
        cta: 'Accept full restock',
      },
    ],
    accepted: 'Accepted option',
  }
})

const active = ref('high')
const accepted = ref(false)
const lastAccepted = ref('')

function onAccept(option: { key: string, short: string }) {
  lastAccepted.value = option.short
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <TxRecommendationCard
      v-model="active"
      v-model:accepted="accepted"
      :title="copy.title"
      :options="copy.options"
      :alternatives-label="copy.alternativesLabel"
      :other-options-label="copy.otherOptionsLabel"
      :accepted-label="copy.acceptedLabel"
      @accept="onAccept"
    >
      <!-- Rich rationale lives in the slot; inline `code` picks up the tinted
           treatment from the component's own stylesheet. -->
      <template #body="{ option }">
        <template v-if="option.key === 'high'">
          {{ locale === 'zh' ? '从' : 'Reorder waffle cones from' }}
          <code>cone_king</code>
          {{ locale === 'zh' ? '补货华夫筒，交期' : 'with lead time' }}
          <code>7_days</code>.
        </template>
        <template v-else-if="option.key === 'review'">
          {{ locale === 'zh' ? '旺季把香草换成' : 'Switch vanilla to' }}
          <code class="is-warning">vanilla_madagascar</code>
          {{ locale === 'zh' ? '。' : 'for peak season.' }}
        </template>
        <template v-else>
          {{ locale === 'zh' ? '退回到全 SKU 整体补货。' : 'Fall back to a full restock across every SKU.' }}
        </template>
      </template>
    </TxRecommendationCard>

    <p v-if="lastAccepted" class="text-sm text-[var(--tx-text-color-secondary)]">
      {{ copy.accepted }}: {{ lastAccepted }}
    </p>
  </div>
</template>
