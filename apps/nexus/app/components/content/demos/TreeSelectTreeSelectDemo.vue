<script setup lang="ts">
import type { TreeSelectNode } from '@talex-touch/tuffex/tree-select'
import { computed, ref } from 'vue'
const { locale } = useI18n()

const multiple = ref(false)
const nodes = ref<TreeSelectNode[]>([
  {
    key: 'general',
    label: 'General',
    children: [
      { key: 'appearance', label: 'Appearance' },
      { key: 'language', label: 'Language' },
    ],
  },
  {
    key: 'account',
    label: 'Account',
    children: [
      { key: 'profile', label: 'Profile' },
      { key: 'billing', label: 'Billing' },
    ],
  },
  {
    key: 'danger',
    label: 'Danger Zone',
    disabled: true,
    children: [
      { key: 'delete', label: 'Delete account', disabled: true },
    ],
  },
])
const placeholder = computed(() => (multiple.value ? 'Select multiple' : 'Select one'))
const value = ref<string | number | Array<string | number> | undefined>(undefined)
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
