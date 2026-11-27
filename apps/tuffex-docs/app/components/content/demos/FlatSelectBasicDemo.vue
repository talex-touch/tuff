<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()

const value = ref('json')
</script>

<template>
  <TxFlatSelect v-model="value" :placeholder="locale === 'zh' ? '选择格式' : 'Select format'">
    <TxFlatSelectItem value="json" label="JSON" />
    <TxFlatSelectItem value="csv" label="CSV" />
    <TxFlatSelectItem value="xml" label="XML" />
  </TxFlatSelect>
</template>
