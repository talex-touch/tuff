<script setup lang="ts">
import type { DescriptionsLayout, DescriptionsSize } from '@talex-touch/tuffex/descriptions'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

const layout = ref<DescriptionsLayout>('horizontal')
const size = ref<DescriptionsSize>('md')

// TxFlatRadio reports any radio value; these two only ever hold their own.
function setLayout(value: unknown) {
  layout.value = value as DescriptionsLayout
}

function setSize(value: unknown) {
  size.value = value as DescriptionsSize
}

const copy = computed(() => (isZh.value
  ? {
      layoutLabel: '布局',
      sizeLabel: '尺寸',
      layouts: { horizontal: '水平', vertical: '垂直' },
      sizes: { md: 'md', sm: 'sm' },
      fields: [
        { label: '插件', value: '剪贴板历史' },
        { label: '版本', value: '2.4.1' },
        { label: '发布者', value: 'Tuff 官方' },
        { label: '安装量', value: '18,240' },
        { label: '更新于', value: '2026-09-30 18:02' },
        { label: '许可证', value: 'MIT' },
      ],
    }
  : {
      layoutLabel: 'Layout',
      sizeLabel: 'Size',
      layouts: { horizontal: 'Horizontal', vertical: 'Vertical' },
      sizes: { md: 'md', sm: 'sm' },
      fields: [
        { label: 'Plugin', value: 'Clipboard history' },
        { label: 'Version', value: '2.4.1' },
        { label: 'Publisher', value: 'Tuff official' },
        { label: 'Installs', value: '18,240' },
        { label: 'Updated', value: '2026-09-30 18:02' },
        { label: 'License', value: 'MIT' },
      ],
    }))
</script>

<template>
  <div class="descriptions-layout-demo not-prose">
    <div class="descriptions-layout-demo__bar">
      <TxFlatRadio :model-value="layout" size="sm" :aria-label="copy.layoutLabel" @update:model-value="setLayout">
        <TxFlatRadioItem value="horizontal" :label="copy.layouts.horizontal" />
        <TxFlatRadioItem value="vertical" :label="copy.layouts.vertical" />
      </TxFlatRadio>
      <TxFlatRadio :model-value="size" size="sm" :aria-label="copy.sizeLabel" @update:model-value="setSize">
        <TxFlatRadioItem value="md" :label="copy.sizes.md" />
        <TxFlatRadioItem value="sm" :label="copy.sizes.sm" />
      </TxFlatRadio>
    </div>

    <TxDescriptions :layout="layout" :size="size" :columns="3">
      <TxDescriptionsItem v-for="field in copy.fields" :key="field.label" :label="field.label">
        {{ field.value }}
      </TxDescriptionsItem>
    </TxDescriptions>
  </div>
</template>

<style scoped>
.descriptions-layout-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.descriptions-layout-demo__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
