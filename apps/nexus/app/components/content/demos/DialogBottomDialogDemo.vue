<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const bottomOpen = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      trigger: '显示对话框',
      title: '确认操作',
      message: '您确定要继续吗？',
      cancel: '取消',
      confirm: '确认',
    }
  : {
      trigger: 'Show dialog',
      title: 'Confirm action',
      message: 'Are you sure you want to continue?',
      cancel: 'Cancel',
      confirm: 'Confirm',
    }))

const buttons = computed(() => [
  { content: labels.value.cancel, type: 'info', onClick: () => true },
  { content: labels.value.confirm, type: 'success', onClick: async () => true },
])
</script>

<template>
  <TxButton @click="bottomOpen = true">
    {{ labels.trigger }}
  </TxButton>
  <TxBottomDialog
    v-if="bottomOpen"
    :title="labels.title"
    :message="labels.message"
    :btns="buttons"
    :close="() => (bottomOpen = false)"
  />
</template>
