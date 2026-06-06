<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const popupValue = ref('2026-01-02')
const popupVisible = ref(false)
const fieldValue = ref('2026-03-18')
const boundedValue = ref('2026-05-20')
const inlineValue = ref('2026-07-14')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      open: '打开日期选择器',
      popupTitle: '发布日期',
      popupLabel: '弹层日期',
      fieldLabel: '字段日历',
      boundedLabel: '受限范围',
      inlineLabel: '内联模式',
      inlineTitle: '排期日期',
      popupHint: '弹层适合表单和紧凑筛选器。',
      fieldHint: 'field/adaptive 变体适合桌面表单，在窄屏仍保持触控友好的面板。',
      boundedHint: '只能选择 2026-05-10 到 2026-05-31。',
      inlineHint: '关闭 popup 后可直接嵌入面板。',
      fieldPlaceholder: '选择日期',
      value: '当前值',
      confirm: '应用',
      cancel: '取消',
      inlineConfirm: '确定',
      inlineCancel: '返回',
    }
  }

  return {
    open: 'Open date picker',
    popupTitle: 'Release date',
    popupLabel: 'Popup date',
    fieldLabel: 'Field calendar',
    boundedLabel: 'Bounded range',
    inlineLabel: 'Inline mode',
    inlineTitle: 'Schedule date',
    popupHint: 'Popup mode works well in forms and compact filters.',
    fieldHint: 'The field/adaptive variant fits desktop forms while staying touch-friendly on narrow screens.',
    boundedHint: 'Selection is limited to 2026-05-10 through 2026-05-31.',
    inlineHint: 'Set popup to false when the picker should stay inside a panel.',
    fieldPlaceholder: 'Select date',
    value: 'Value',
    confirm: 'Apply',
    cancel: 'Cancel',
    inlineConfirm: 'OK',
    inlineCancel: 'Back',
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col date-picker-demo">
    <section class="date-picker-demo__section">
      <div class="date-picker-demo__header">
        <div>
          <div class="tx-demo__label">
            {{ labels.popupLabel }}
          </div>
          <div class="date-picker-demo__hint">
            {{ labels.popupHint }}
          </div>
        </div>
        <TxButton variant="primary" @click="popupVisible = true">
          {{ labels.open }}
        </TxButton>
      </div>

      <TxCard variant="plain" background="mask" :padding="10" :radius="12">
        <div class="tx-demo__meta">
          {{ labels.value }}: {{ popupValue }}
        </div>
      </TxCard>

      <TxDatePicker
        v-model="popupValue"
        v-model:visible="popupVisible"
        :title="labels.popupTitle"
        min="2025-01-01"
        max="2030-12-31"
        :confirm-text="labels.confirm"
        :cancel-text="labels.cancel"
      />
    </section>

    <section class="date-picker-demo__section">
      <div class="date-picker-demo__header">
        <div>
          <div class="tx-demo__label">
            {{ labels.fieldLabel }}
          </div>
          <div class="date-picker-demo__hint">
            {{ labels.fieldHint }}
          </div>
        </div>
      </div>

      <TxDatePicker
        v-model="fieldValue"
        variant="adaptive"
        :placeholder="labels.fieldPlaceholder"
        min="2026-01-01"
        max="2026-12-31"
      />

      <TxCard variant="plain" background="mask" :padding="10" :radius="12">
        <div class="tx-demo__meta">
          {{ labels.value }}: {{ fieldValue }}
        </div>
      </TxCard>
    </section>

    <section class="date-picker-demo__section">
      <div class="date-picker-demo__header">
        <div>
          <div class="tx-demo__label">
            {{ labels.boundedLabel }}
          </div>
          <div class="date-picker-demo__hint">
            {{ labels.boundedHint }}
          </div>
        </div>
      </div>

      <TxDatePicker
        v-model="boundedValue"
        :visible="true"
        :popup="false"
        :show-toolbar="false"
        min="2026-05-10"
        max="2026-05-31"
      />

      <TxCard variant="plain" background="mask" :padding="10" :radius="12">
        <div class="tx-demo__meta">
          {{ labels.value }}: {{ boundedValue }}
        </div>
      </TxCard>
    </section>

    <section class="date-picker-demo__section">
      <div class="date-picker-demo__header">
        <div>
          <div class="tx-demo__label">
            {{ labels.inlineLabel }}
          </div>
          <div class="date-picker-demo__hint">
            {{ labels.inlineHint }}
          </div>
        </div>
      </div>

      <TxDatePicker
        v-model="inlineValue"
        :visible="true"
        :popup="false"
        :title="labels.inlineTitle"
        :confirm-text="labels.inlineConfirm"
        :cancel-text="labels.inlineCancel"
      />

      <TxCard variant="plain" background="mask" :padding="10" :radius="12">
        <div class="tx-demo__meta">
          {{ labels.value }}: {{ inlineValue }}
        </div>
      </TxCard>
    </section>
  </div>
</template>

<style scoped>
.date-picker-demo {
  width: min(100%, 680px);
  gap: 16px;
}

.date-picker-demo__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--tx-border-color-light);
  border-radius: 14px;
  background: var(--tx-bg-color);
}

.date-picker-demo__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.date-picker-demo__hint {
  margin-top: 4px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
