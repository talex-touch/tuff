<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const list = ref(
  locale.value === 'zh'
    ? [
        { id: 'one', title: '第一项' },
        { id: 'two', title: '第二项' },
        { id: 'three', title: '第三项' },
      ]
    : [
        { id: 'one', title: 'One' },
        { id: 'two', title: 'Two' },
        { id: 'three', title: 'Three' },
      ],
)
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxSortableList v-model="list">
          <template #item="{ item, dragging }">
            <div :class="['sortable-row', { 'sortable-row--dragging': dragging }]">
              {{ item.title }}
            </div>
          </template>
        </TxSortableList>
  </div>
  <div v-else>
        <TxSortableList v-model="list">
          <template #item="{ item, dragging }">
            <div :class="['sortable-row', { 'sortable-row--dragging': dragging }]">
              {{ item.title }}
            </div>
          </template>
        </TxSortableList>
  </div>
</template>
