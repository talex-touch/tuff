<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const bottomOpen = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxButton @click="bottomOpen = true">
显示对话框
</TxButton>
        <TxBottomDialog
          v-if="bottomOpen"
          title="确认操作"
          message="您确定要继续吗？"
          :btns="[
            { content: '取消', type: 'info', onClick: () => true },
            { content: '确认', type: 'success', onClick: async () => true },
          ]"
          :close="() => (bottomOpen = false)"
        />
  </div>
  <div v-else>
        <TxButton @click="bottomOpen = true">
Show dialog
</TxButton>
        <TxBottomDialog
          v-if="bottomOpen"
          title="Confirm action"
          message="Are you sure you want to continue?"
          :btns="[
            { content: 'Cancel', type: 'info', onClick: () => true },
            { content: 'Confirm', type: 'success', onClick: async () => true },
          ]"
          :close="() => (bottomOpen = false)"
        />
  </div>
</template>
