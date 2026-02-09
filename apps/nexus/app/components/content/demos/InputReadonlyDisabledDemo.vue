<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const readonlyValue = ref('')
const disabledValue = ref('')

const labels = computed(() => (locale.value === 'zh'
  ? {
      readonly: '只读',
      disabled: '禁用',
    }
  : {
      readonly: 'Readonly',
      disabled: 'Disabled',
    }))
</script>

<template>
  <div style="display: grid; gap: 10px;">
    <TuffInput v-model="readonlyValue" readonly :placeholder="labels.readonly" />
    <TuffInput v-model="disabledValue" disabled :placeholder="labels.disabled" />
  </div>
</template>
