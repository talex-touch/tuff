<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

// Mirrors `FineTuneValues`. Declared locally so this demo does not depend on the
// tuffex barrel having been rebuilt — no other demo imports package types either.
interface FineTuneValues {
  layout: 'row' | 'col' | 'grid'
  width: number
  height: number
  radius: number
  opacity: number
  type: string | null
}

const DEFAULTS: FineTuneValues = {
  layout: 'row',
  width: 324,
  height: 96,
  radius: 28,
  opacity: 100,
  type: null,
}

const values = ref<FineTuneValues>({ ...DEFAULTS })
const lastChange = ref<string | null>(null)

const typeOptions = computed(() => zh.value
  ? [
      { value: 'seasonal', label: '季节限定' },
      { value: 'classic', label: '经典款' },
      { value: 'limited', label: '限量款' },
    ]
  : [
      { value: 'seasonal', label: 'Seasonal' },
      { value: 'classic', label: 'Classic' },
      { value: 'limited', label: 'Limited' },
    ])

const labels = computed(() => zh.value
  ? {
      title: '风味卡片',
      layout: '布局',
      type: '类型',
      placeholder: '选择类型',
      adjust: '可调整',
      edited: '已修改',
      fields: { width: '宽', height: '高', radius: '圆角', opacity: '不透明' },
      reset: '恢复默认',
      changed: '最近改动：',
    }
  : {
      title: 'Flavor card',
      layout: 'Layout',
      type: 'Type',
      placeholder: 'Select type',
      adjust: 'Adjust',
      edited: 'Edited',
      fields: { width: 'W', height: 'H', radius: 'Radius', opacity: 'Opacity' },
      reset: 'Reset',
      changed: 'Last change: ',
    })

function onChange(key: string, value: unknown): void {
  lastChange.value = `${key} = ${String(value)}`
}

function reset(): void {
  values.value = { ...DEFAULTS }
  lastChange.value = null
}

// Mirrors the inspector onto a live preview, so the numbers visibly do something.
const previewStyle = computed(() => ({
  width: `${Math.min(values.value.width, 260)}px`,
  height: `${Math.min(values.value.height, 140)}px`,
  borderRadius: `${values.value.radius}px`,
  opacity: values.value.opacity / 100,
}))
</script>

<template>
  <div class="fine-tune-demo">
    <TxFineTuneCard
      v-model:values="values"
      :defaults="DEFAULTS"
      :title="labels.title"
      :layout-label="labels.layout"
      :type-label="labels.type"
      :type-placeholder="labels.placeholder"
      :adjust-label="labels.adjust"
      :edited-label="labels.edited"
      :field-labels="labels.fields"
      :type-options="typeOptions"
      @change="onChange"
    />

    <div class="fine-tune-demo__side">
      <div class="fine-tune-demo__preview" :style="previewStyle" :data-layout="values.layout" />
      <p v-if="lastChange" class="fine-tune-demo__log">
        {{ labels.changed }}<code>{{ lastChange }}</code>
      </p>
      <button type="button" class="fine-tune-demo__reset" @click="reset">
        {{ labels.reset }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.fine-tune-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: flex-start;
}

.fine-tune-demo__side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

.fine-tune-demo__preview {
  background: linear-gradient(135deg, var(--tx-bui-accent, #0285ff), var(--tx-bui-orange, #ef720c));
  transition: border-radius 0.2s ease, opacity 0.2s ease, width 0.2s ease, height 0.2s ease;
}

.fine-tune-demo__log {
  margin: 0;
  font-size: 12px;
  color: var(--tx-bui-ink-2, #62656b);
}

.fine-tune-demo__log code {
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-variant-numeric: tabular-nums;
}

.fine-tune-demo__reset {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--tx-bui-ink, #1f2124);
  cursor: pointer;
  background: var(--tx-bui-surface, #fff);
  border: 0;
  border-radius: 999px;
  box-shadow: var(--tx-bui-shadow-btn, 0 0 0 1px #e0e2e5, 0 1px 2px #1018280d);
}

@media (prefers-reduced-motion: reduce) {
  .fine-tune-demo__preview {
    transition: none;
  }
}
</style>
