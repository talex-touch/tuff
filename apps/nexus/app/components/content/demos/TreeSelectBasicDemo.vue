<script setup lang="ts">
import { computed, ref } from 'vue'

const multiple = ref(false)
const value = ref<string | number | Array<string | number> | undefined>(undefined)

const nodes = [
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
]

const placeholder = computed(() => (multiple.value ? 'Select multiple' : 'Select one'))
</script>

<template>
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
</template>
