<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const list = ref([])
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="width: 420px;">
      <TxSortableList v-model="list" @reorder="(event) => console.log('reorder', event)">
        <template #item="{ item }">
          <div
            style="padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;"
          >
            <span style="font-weight: 600;">{{ item.title }}</span>
            <span data-tx-sort-handle="true" style="opacity: 0.6; cursor: grab;">drag</span>
          </div>
        </template>
      </TxSortableList>
    </div>
  </div>
  <div v-else>
    <div style="width: 420px;">
      <TxSortableList v-model="list" @reorder="(event) => console.log('reorder', event)">
        <template #item="{ item }">
          <div
            style="padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;"
          >
            <span style="font-weight: 600;">{{ item.title }}</span>
            <span data-tx-sort-handle="true" style="opacity: 0.6; cursor: grab;">drag</span>
          </div>
        </template>
      </TxSortableList>
    </div>
  </div>
</template>
