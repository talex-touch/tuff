<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const disabledValue = ref(false)
const readonlyValue = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffInput v-model="readonlyValue" readonly placeholder="只读" />
        <TuffInput v-model="disabledValue" disabled placeholder="禁用" />
  </div>
  <div v-else>
        <TuffInput v-model="readonlyValue" readonly placeholder="Readonly" />
        <TuffInput v-model="disabledValue" disabled placeholder="Disabled" />
  </div>
</template>
