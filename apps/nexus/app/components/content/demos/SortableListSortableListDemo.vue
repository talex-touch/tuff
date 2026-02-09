<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const list = ref([])
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxSortableList v-model="list">
          <template #item="{ item }">
            <div>{{ item.id }}</div>
          </template>
        </TxSortableList>
  </div>
  <div v-else>
        <TxSortableList v-model="list">
          <template #item="{ item }">
            <div>{{ item.id }}</div>
          </template>
        </TxSortableList>
  </div>
</template>
