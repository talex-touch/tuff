<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const tipOpen = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      trigger: '显示 TouchTip',
      title: '提示',
      message: '请选择一个操作。',
      cancel: '取消',
      confirm: '确定',
    }
  : {
      trigger: 'Show TouchTip',
      title: 'Notice',
      message: 'Pick an action.',
      cancel: 'Cancel',
      confirm: 'Confirm',
    }))

const buttons = computed(() => [
  { content: labels.value.cancel, type: 'info', onClick: () => true },
  { content: labels.value.confirm, type: 'success', onClick: async () => true },
])
</script>

<template>
  <TxButton @click="tipOpen = true">
    {{ labels.trigger }}
  </TxButton>
  <TxTouchTip
    v-if="tipOpen"
    :title="labels.title"
    :message="labels.message"
    :buttons="buttons"
    :close="() => (tipOpen = false)"
  />
</template>
