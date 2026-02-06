<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const items = ref([])
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxImageGallery :items="items" />
  </div>
  <div v-else>
        <TxImageGallery :items="items" />
  </div>
</template>
