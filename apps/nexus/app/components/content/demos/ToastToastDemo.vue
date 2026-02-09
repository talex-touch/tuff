<script setup lang="ts">
import { computed } from 'vue'
import { toast } from '@talex-touch/tuffex/utils'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      showToast: '显示提示',
      success: '成功',
      savedTitle: '已保存',
      savedDescription: '你的更改已保存。',
      successTitle: '操作成功',
      successDescription: '已完成',
    }
  }

  return {
    showToast: 'Show toast',
    success: 'Success',
    savedTitle: 'Saved',
    savedDescription: 'Your changes have been saved.',
    successTitle: 'Success',
    successDescription: 'Done',
  }
})

function showDefaultToast() {
  toast({
    title: labels.value.savedTitle,
    description: labels.value.savedDescription,
  })
}

function showSuccessToast() {
  toast({
    title: labels.value.successTitle,
    description: labels.value.successDescription,
    variant: 'success',
  })
}
</script>

<template>
  <TxToastHost />
  <TxButton @click="showDefaultToast">
    {{ labels.showToast }}
  </TxButton>
  <TxButton style="margin-left: 8px;" @click="showSuccessToast">
    {{ labels.success }}
  </TxButton>
</template>
