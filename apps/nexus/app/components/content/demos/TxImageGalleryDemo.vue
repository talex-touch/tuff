<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const items = ref([])
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="width: 560px;">
      <TxImageGallery :items="items" />
    </div>
  </div>
  <div v-else>
    <div style="width: 560px;">
      <TxImageGallery :items="items" />
    </div>
  </div>
</template>
