<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const open = ref(false)
</script>

<template>
  <div v-if="locale === 'zh'">
    <TxDropdownMenu v-model="open">
      <template #trigger>
        <TxButton>Menu</TxButton>
  </template>
</txdropdownmenu>
</div>
  <div v-else>
    <TxDropdownMenu v-model="open">
      <template #trigger>
        <TxButton>Menu</TxButton>
  </template>
</txdropdownmenu>
</div>
</template>
