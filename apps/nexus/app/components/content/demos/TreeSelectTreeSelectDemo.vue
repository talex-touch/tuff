<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()

interface TreeNode {
  label: string
  value: string
  children?: TreeNode[]
}

const multiple = ref(false)
const nodes = ref<TreeNode[]>([
  {
    label: 'Group A',
    value: 'group-a',
    children: [
      { label: 'Alpha', value: 'alpha' },
      { label: 'Beta', value: 'beta' },
    ],
  },
  {
    label: 'Group B',
    value: 'group-b',
    children: [
      { label: 'Gamma', value: 'gamma' },
      { label: 'Delta', value: 'delta' },
    ],
  },
])
const placeholder = ref('Select item')
const value = ref<string | string[] | undefined>(undefined)
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 12px; width: 420px;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <TxButton size="small" variant="secondary" @click="multiple = !multiple">
            Toggle multiple
          </TxButton>
          <TxButton size="small" variant="secondary" @click="value = multiple ? [] : undefined">
            Clear
          </TxButton>
        </div>

        <TxTreeSelect
          v-model="value"
          :nodes="nodes"
          :multiple="multiple"
          :placeholder="placeholder"
          :dropdown-max-height="260"
        />

        <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
          value: {{ value }}
        </div>
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 12px; width: 420px;">
        <div style="display: flex; gap: 8px; align-items: center;">
          <TxButton size="small" variant="secondary" @click="multiple = !multiple">
            Toggle multiple
          </TxButton>
          <TxButton size="small" variant="secondary" @click="value = multiple ? [] : undefined">
            Clear
          </TxButton>
        </div>

        <TxTreeSelect
          v-model="value"
          :nodes="nodes"
          :multiple="multiple"
          :placeholder="placeholder"
          :dropdown-max-height="260"
        />

        <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
          value: {{ value }}
        </div>
      </div>
  </div>
</template>
