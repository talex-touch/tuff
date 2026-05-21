<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)

function startLoading(done: () => void) {
  window.setTimeout(done, 1200)
}
</script>

<template>
  <TxButton @click="open = true">
    Show button states
  </TxButton>

  <TxBottomDialog
    v-if="open"
    title="Button states"
    message="role=&quot;dialog&quot; and aria-modal=&quot;true&quot; are applied while the async action shows loading."
    :btns="[
      { content: '信息', type: 'info', onClick: () => false },
      { content: '警告', type: 'warning', onClick: () => false },
      { content: '错误', type: 'error', onClick: () => false },
      { content: '提交', type: 'success', loading: startLoading, onClick: async () => true },
    ]"
    :close="() => (open = false)"
  />
</template>
