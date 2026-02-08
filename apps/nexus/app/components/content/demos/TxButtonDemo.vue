<script setup lang="ts">
import { computed, ref } from 'vue'
import { TxButton as TuffButton, TxStagger as TuffStagger } from '@talex-touch/tuffex'

const { locale } = useI18n()

interface DemoItem {
  id: string
  text: string
}

const labels = computed(() => (locale.value === 'zh'
  ? {
      add: '添加',
      remove: '移除',
      prefix: '新条目',
      empty: '暂无条目',
    }
  : {
      add: 'Add',
      remove: 'Remove',
      prefix: 'New item',
      empty: 'No items',
    }))

const nextId = ref(4)
const items = ref<DemoItem[]>([
  { id: '1', text: 'Alpha' },
  { id: '2', text: 'Beta' },
  { id: '3', text: 'Gamma' },
])

function add() {
  const id = `${nextId.value}`
  nextId.value += 1
  items.value.unshift({
    id,
    text: `${labels.value.prefix} ${id}`,
  })
}

function remove() {
  items.value.shift()
}
</script>

<template>
  <div style="display: grid; gap: 12px; width: 420px;">
    <div style="display: flex; gap: 8px;">
      <TuffButton @click="add">
        {{ labels.add }}
      </TuffButton>
      <TuffButton @click="remove">
        {{ labels.remove }}
      </TuffButton>
    </div>

    <TuffStagger tag="div" :delay-step="30" :duration="180">
      <div
        v-for="item in items"
        :key="item.id"
        style="padding: 10px 12px; border-radius: 12px; border: 1px solid var(--tx-border-color-lighter); background: var(--tx-fill-color-blank);"
      >
        {{ item.text }}
      </div>
    </TuffStagger>

    <span v-if="items.length === 0" style="font-size: 12px; color: var(--tx-text-color-secondary);">
      {{ labels.empty }}
    </span>
  </div>
</template>
