<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const withPrefix = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffInput v-model="withPrefix" placeholder="Search">
          <template #prefix>
            <TxIcon icon="i-carbon-search" />
</template>
</tuffinput>
</div>
  <div v-else>
        <TuffInput v-model="withPrefix" placeholder="Search">
          <template #prefix>
            <TxIcon icon="i-carbon-search" />
</template>
</tuffinput>
</div>
</template>
