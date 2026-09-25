<script setup lang="ts">
import type { DialogButton } from '@tuffex-components/dialog'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const rowsOpen = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      trigger: '显示行动列表',
      title: '钱包设置',
      viewKey: '查看私钥',
      viewPhrase: '查看助记词',
      remove: '移除钱包',
    }
  : {
      trigger: 'Show action rows',
      title: 'Wallet settings',
      viewKey: 'View private key',
      viewPhrase: 'View recovery phrase',
      remove: 'Remove wallet',
    }))

// `false` keeps the sheet open so the reader can inspect the rows; a real
// caller returns `true` from the row it wants to commit.
const buttons = computed<DialogButton[]>(() => [
  { content: labels.value.viewKey, icon: 'i-carbon-password', onClick: () => false },
  { content: labels.value.viewPhrase, icon: 'i-carbon-list', onClick: () => false },
  { content: labels.value.remove, icon: 'i-carbon-warning-alt', type: 'error', onClick: () => false },
])
</script>

<template>
  <TxButton @click="rowsOpen = true">
    {{ labels.trigger }}
  </TxButton>
  <TxBottomDialog
    v-if="rowsOpen"
    :title="labels.title"
    :btns="buttons"
    :close="() => (rowsOpen = false)"
  />
</template>
