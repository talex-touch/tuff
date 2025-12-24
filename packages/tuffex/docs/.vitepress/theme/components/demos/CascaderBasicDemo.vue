<script setup lang="ts">
import { ref } from 'vue'

const value1 = ref<any>(undefined)
const value2 = ref<any>([])

const options = [
  {
    value: 'zhejiang',
    label: 'Zhejiang',
    children: [
      {
        value: 'hangzhou',
        label: 'Hangzhou',
        children: [
          { value: 'xihu', label: 'West Lake', leaf: true },
          { value: 'binjiang', label: 'Binjiang', leaf: true },
        ],
      },
    ],
  },
  {
    value: 'jiangsu',
    label: 'Jiangsu',
    children: [
      {
        value: 'nanjing',
        label: 'Nanjing',
        children: [
          { value: 'zhonghuamen', label: 'Zhong Hua Men', leaf: true },
        ],
      },
    ],
  },
]
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px; width: 520px;">
    <div style="display: flex; gap: 12px; align-items: center;">
      <TxCascader v-model="value1" :options="options" placeholder="Single" />
      <TxCascader v-model="value2" :options="options" multiple placeholder="Multiple" />
    </div>

    <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
      single: {{ value1 }}
    </div>
    <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
      multiple: {{ value2 }}
    </div>
  </div>
</template>
