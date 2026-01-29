<script setup lang="ts">
import { ref } from 'vue'

const value = ref('home')

const items = [
  { value: 'home', label: 'Home', iconClass: 'i-carbon-home' },
  { value: 'search', label: 'Search', iconClass: 'i-carbon-search', badge: 3 },
  { value: 'profile', label: 'Me', iconClass: 'i-carbon-user' },
]
</script>

<template>
  <div style="width: 360px; height: 220px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden; position: relative;">
    <div style="padding: 16px; color: var(--tx-text-color-secondary);">
      Active: {{ value }}
    </div>

    <TxTabBar v-model="value" :items="items" />
  </div>
</template>
