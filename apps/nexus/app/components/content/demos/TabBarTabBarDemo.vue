<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const items = ref([])
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 360px; height: 220px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden; position: relative;">
        <div style="padding: 16px; color: var(--tx-text-color-secondary);">
          Active: {{ value }}
        </div>

        <TxTabBar v-model="value" :items="items" />
      </div>
  </div>
  <div v-else>
      <div style="width: 360px; height: 220px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden; position: relative;">
        <div style="padding: 16px; color: var(--tx-text-color-secondary);">
          Active: {{ value }}
        </div>

        <TxTabBar v-model="value" :items="items" />
      </div>
  </div>
</template>
