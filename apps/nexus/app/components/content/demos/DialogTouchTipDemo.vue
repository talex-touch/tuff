<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const tipOpen = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxButton @click="tipOpen = true">
显示 TouchTip
</TxButton>
        <TxTouchTip
          v-if="tipOpen"
          title="提示"
          message="请选择一个操作。"
          :buttons="[
            { content: '取消', type: 'info', onClick: () => true },
            { content: '确定', type: 'success', onClick: async () => true },
          ]"
          :close="() => (tipOpen = false)"
        />
  </div>
  <div v-else>
        <TxButton @click="tipOpen = true">
Show TouchTip
</TxButton>
        <TxTouchTip
          v-if="tipOpen"
          title="Notice"
          message="Pick an action."
          :buttons="[
            { content: 'Cancel', type: 'info', onClick: () => true },
            { content: 'Confirm', type: 'success', onClick: async () => true },
          ]"
          :close="() => (tipOpen = false)"
        />
  </div>
</template>
