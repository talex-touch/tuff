<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const jsonValue = ref('{"name":"Tuffex","version":1,"features":["lint","format","search"]}')
const yamlValue = ref('name: Tuffex\nversion: 1\nfeatures:\n  - lint\n  - format\n  - search\n')

const labels = computed(() => (locale.value === 'zh'
  ? {
      jsonPlaceholder: 'JSON 配置',
      yamlPlaceholder: 'YAML 配置',
    }
  : {
      jsonPlaceholder: 'JSON config',
      yamlPlaceholder: 'YAML config',
    }))
</script>

<template>
  <div class="grid gap-4">
    <TxCodeEditor v-model="jsonValue" language="json" :placeholder="labels.jsonPlaceholder" />
    <TxCodeEditor v-model="yamlValue" language="yaml" :placeholder="labels.yamlPlaceholder" />
  </div>
</template>
