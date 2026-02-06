<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const open = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxButton variant="primary" @click="open = true">
打开模态框
</TxButton>
        <TxModal v-model="open" title="快速操作">
          <p>在这里让用户完成一个小任务。</p>
          <template #footer>
            <TxButton variant="ghost" @click="open = false">
取消
</TxButton>
            <TxButton variant="primary" @click="open = false">
确认
</TxButton>
          </template>
        </TxModal>
  </div>
  <div v-else>
        <TxButton variant="primary" @click="open = true">
Open Modal
</TxButton>
        <TxModal v-model="open" title="Quick Action">
          <p>Give the user a short task or decision.</p>
          <template #footer>
            <TxButton variant="ghost" @click="open = false">
Cancel
</TxButton>
            <TxButton variant="primary" @click="open = false">
Confirm
</TxButton>
          </template>
        </TxModal>
  </div>
</template>
