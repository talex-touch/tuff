<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const popperOpen = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxButton @click="popperOpen = true">
显示弹出对话框
</TxButton>
        <TxPopperDialog
          v-if="popperOpen"
          title="Tip"
          message="这是一段提示内容。"
          :close="() => (popperOpen = false)"
        />
  </div>
  <div v-else>
        <TxButton @click="popperOpen = true">
Show popper dialog
</TxButton>
        <TxPopperDialog
          v-if="popperOpen"
          title="Tip"
          message="This is a short tip."
          :close="() => (popperOpen = false)"
        />
  </div>
</template>
