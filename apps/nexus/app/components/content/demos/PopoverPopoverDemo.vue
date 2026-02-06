<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const open = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxPopover v-model="open">
          <template #reference>
            <TxButton>Click</TxButton>
          </template>
  
          Popover content
        </TxPopover>
  </div>
  <div v-else>
        <TxPopover v-model="open">
          <template #reference>
            <TxButton>Click</TxButton>
          </template>
  
          Popover content
        </TxPopover>
  </div>
</template>
