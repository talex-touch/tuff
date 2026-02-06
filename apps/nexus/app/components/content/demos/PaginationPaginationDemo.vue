<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const page = ref(0)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxPagination
          v-model:current-page="page"
          :total="120"
          :page-size="10"
          show-info
          show-first-last
        />
  </div>
  <div v-else>
        <TxPagination
          v-model:current-page="page"
          :total="120"
          :page-size="10"
          show-info
          show-first-last
        />
  </div>
</template>
