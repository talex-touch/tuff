<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const withPrefix = ref('')
const withSuffix = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffInput v-model="withPrefix" placeholder="Search">
          <template #prefix>
            <TxIcon icon="i-carbon-search" />
          </template>
        </TuffInput>
        <TuffInput v-model="withSuffix" placeholder="User">
          <template #suffix>
            <TxIcon icon="i-carbon-user" />
          </template>
        </TuffInput>
  </div>
  <div v-else>
        <TuffInput v-model="withPrefix" placeholder="Search">
          <template #prefix>
            <TxIcon icon="i-carbon-search" />
          </template>
        </TuffInput>
        <TuffInput v-model="withSuffix" placeholder="User">
          <template #suffix>
            <TxIcon icon="i-carbon-user" />
          </template>
        </TuffInput>
  </div>
</template>
