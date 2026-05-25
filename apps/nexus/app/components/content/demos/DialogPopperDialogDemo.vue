<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const popperOpen = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      trigger: '显示弹出对话框',
      title: '提示',
      message: '这是一段提示内容。',
      confirm: '确认',
    }
  : {
      trigger: 'Show popper dialog',
      title: 'Tip',
      message: 'This is a short tip.',
      confirm: 'Confirm',
    }))
</script>

<template>
  <TxButton @click="popperOpen = true">
    {{ labels.trigger }}
  </TxButton>
  <TxPopperDialog
    v-if="popperOpen"
    :title="labels.title"
    :message="labels.message"
    :confirm-text="labels.confirm"
    :close="() => (popperOpen = false)"
  />
</template>
