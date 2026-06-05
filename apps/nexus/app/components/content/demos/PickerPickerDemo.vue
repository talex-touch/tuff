<script setup lang="ts">
import type { PickerColumn, PickerValue } from '@talex-touch/tuffex/picker'
import { computed, ref } from 'vue'

const { locale } = useI18n()

const popupVisible = ref(false)
const popupValue = ref<PickerValue>(['pro', 'monthly'])
const inlineValue = ref<PickerValue>(['high', 'triage'])
const denseValue = ref<PickerValue>(['apac', 30])

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      open: '打开选择器',
      value: '当前值',
      popupLabel: '弹层选择',
      popupTitle: '订阅计划',
      popupHint: '弹层模式适合表单、筛选器和移动端确认流程。',
      inlineLabel: '内联模式',
      inlineTitle: '告警策略',
      inlineHint: '禁用项会跳过选择和非法值回退。',
      denseLabel: '紧凑行高',
      denseHint: 'itemHeight 会限制最小高度，visibleItemCount 会自动修正为奇数。',
      confirm: '应用',
      cancel: '取消',
      inlineConfirm: '保存',
      inlineCancel: '重置',
      plans: ['免费版', '专业版', '团队版'] as const,
      cycles: ['月付', '年付', '企业合同'] as const,
      priorities: ['低优先级', '高优先级', '冻结中'] as const,
      queues: ['收件箱', '分诊队列', '升级通道'] as const,
      regions: ['北美', '欧洲', '亚太'] as const,
      windows: ['15 分钟', '30 分钟', '60 分钟'] as const,
    }
  }

  return {
    open: 'Open picker',
    value: 'Value',
    popupLabel: 'Popup picker',
    popupTitle: 'Subscription plan',
    popupHint: 'Popup mode works well for forms, filters, and mobile confirmation flows.',
    inlineLabel: 'Inline mode',
    inlineTitle: 'Alert routing',
    inlineHint: 'Disabled options are skipped by selection and invalid-value fallback.',
    denseLabel: 'Dense rows',
    denseHint: 'itemHeight is clamped to a minimum height and visibleItemCount is rounded to an odd count.',
    confirm: 'Apply',
    cancel: 'Cancel',
    inlineConfirm: 'Save',
    inlineCancel: 'Reset',
    plans: ['Free', 'Pro', 'Team'] as const,
    cycles: ['Monthly', 'Annual', 'Enterprise contract'] as const,
    priorities: ['Low priority', 'High priority', 'Frozen'] as const,
    queues: ['Inbox', 'Triage queue', 'Escalation path'] as const,
    regions: ['North America', 'Europe', 'Asia Pacific'] as const,
    windows: ['15 minutes', '30 minutes', '60 minutes'] as const,
  }
})

const popupColumns = computed<PickerColumn[]>(() => [
  {
    key: 'plan',
    options: [
      { value: 'free', label: labels.value.plans[0] },
      { value: 'pro', label: labels.value.plans[1] },
      { value: 'team', label: labels.value.plans[2] },
    ],
  },
  {
    key: 'cycle',
    options: [
      { value: 'monthly', label: labels.value.cycles[0] },
      { value: 'annual', label: labels.value.cycles[1] },
      { value: 'contract', label: labels.value.cycles[2] },
    ],
  },
])

const inlineColumns = computed<PickerColumn[]>(() => [
  {
    key: 'priority',
    options: [
      { value: 'low', label: labels.value.priorities[0] },
      { value: 'high', label: labels.value.priorities[1] },
      { value: 'frozen', label: labels.value.priorities[2], disabled: true },
    ],
  },
  {
    key: 'queue',
    options: [
      { value: 'inbox', label: labels.value.queues[0] },
      { value: 'triage', label: labels.value.queues[1] },
      { value: 'escalation', label: labels.value.queues[2] },
    ],
  },
])

const denseColumns = computed<PickerColumn[]>(() => [
  {
    key: 'region',
    options: [
      { value: 'na', label: labels.value.regions[0] },
      { value: 'eu', label: labels.value.regions[1] },
      { value: 'apac', label: labels.value.regions[2] },
    ],
  },
  {
    key: 'window',
    options: [
      { value: 15, label: labels.value.windows[0] },
      { value: 30, label: labels.value.windows[1] },
      { value: 60, label: labels.value.windows[2] },
    ],
  },
])

function formatValue(value: PickerValue) {
  return value.join(' / ')
}
</script>

<template>
  <div class="tx-demo tx-demo__col picker-demo">
    <section class="picker-demo__section">
      <div class="picker-demo__header">
        <div>
          <div class="tx-demo__label">
            {{ labels.popupLabel }}
          </div>
          <div class="picker-demo__hint">
            {{ labels.popupHint }}
          </div>
        </div>
        <TxButton variant="primary" @click="popupVisible = true">
          {{ labels.open }}
        </TxButton>
      </div>

      <TxCard variant="plain" background="mask" :padding="10" :radius="12">
        <div class="tx-demo__meta">
          {{ labels.value }}: {{ formatValue(popupValue) }}
        </div>
      </TxCard>

      <TxPicker
        v-model="popupValue"
        v-model:visible="popupVisible"
        :title="labels.popupTitle"
        :columns="popupColumns"
        :confirm-text="labels.confirm"
        :cancel-text="labels.cancel"
      />
    </section>

    <section class="picker-demo__section">
      <div class="picker-demo__header">
        <div>
          <div class="tx-demo__label">
            {{ labels.inlineLabel }}
          </div>
          <div class="picker-demo__hint">
            {{ labels.inlineHint }}
          </div>
        </div>
      </div>

      <TxPicker
        v-model="inlineValue"
        :popup="false"
        :title="labels.inlineTitle"
        :columns="inlineColumns"
        :confirm-text="labels.inlineConfirm"
        :cancel-text="labels.inlineCancel"
      />

      <TxCard variant="plain" background="mask" :padding="10" :radius="12">
        <div class="tx-demo__meta">
          {{ labels.value }}: {{ formatValue(inlineValue) }}
        </div>
      </TxCard>
    </section>

    <section class="picker-demo__section">
      <div class="picker-demo__header">
        <div>
          <div class="tx-demo__label">
            {{ labels.denseLabel }}
          </div>
          <div class="picker-demo__hint">
            {{ labels.denseHint }}
          </div>
        </div>
      </div>

      <TxPicker
        v-model="denseValue"
        :popup="false"
        :show-toolbar="false"
        :columns="denseColumns"
        :item-height="28"
        :visible-item-count="4"
      />

      <TxCard variant="plain" background="mask" :padding="10" :radius="12">
        <div class="tx-demo__meta">
          {{ labels.value }}: {{ formatValue(denseValue) }}
        </div>
      </TxCard>
    </section>
  </div>
</template>

<style scoped>
.picker-demo {
  width: min(100%, 680px);
  gap: 16px;
}

.picker-demo__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--tx-border-color-light);
  border-radius: 14px;
  background: var(--tx-bg-color);
}

.picker-demo__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.picker-demo__hint {
  margin-top: 4px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
