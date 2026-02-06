<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const blowOpen = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxButton @click="blowOpen = true">
显示爆炸对话框
</TxButton>
        <TxBlowDialog
          v-if="blowOpen"
          title="欢迎"
          message="<strong>你好！</strong> 欢迎使用我们的应用。"
          :close="() => (blowOpen = false)"
        />
  </div>
  <div v-else>
        <TxButton @click="blowOpen = true">
Show blow dialog
</TxButton>
        <TxBlowDialog
          v-if="blowOpen"
          title="Welcome"
          message="<strong>Hello!</strong> Welcome to the app."
          :close="() => (blowOpen = false)"
        />
  </div>
</template>
