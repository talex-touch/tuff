<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const blowOpen = ref(false)

const labels = computed(() => (locale.value === 'zh'
  ? {
      trigger: '显示爆炸对话框',
      title: '欢迎',
      message: '<strong>你好！</strong> 欢迎使用我们的应用。',
      confirm: '确认',
    }
  : {
      trigger: 'Show blow dialog',
      title: 'Welcome',
      message: '<strong>Hello!</strong> Welcome to the app.',
      confirm: 'Confirm',
    }))
</script>

<template>
  <TxButton @click="blowOpen = true">
    {{ labels.trigger }}
  </TxButton>
  <TxBlowDialog
    v-if="blowOpen"
    :title="labels.title"
    :message="labels.message"
    :confirm-text="labels.confirm"
    :close="() => (blowOpen = false)"
  />
</template>
