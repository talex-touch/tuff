<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const withPrefix = ref('')
const withSuffix = ref('')

const labels = computed(() => (locale.value === 'zh'
  ? {
      search: '搜索',
      user: '用户',
    }
  : {
      search: 'Search',
      user: 'User',
    }))
</script>

<template>
  <div style="display: grid; gap: 10px;">
    <TuffInput v-model="withPrefix" :placeholder="labels.search">
      <template #prefix>
        <TxIcon icon="i-carbon-search" />
      </template>
    </TuffInput>
    <TuffInput v-model="withSuffix" :placeholder="labels.user">
      <template #suffix>
        <TxIcon icon="i-carbon-user" />
      </template>
    </TuffInput>
  </div>
</template>
