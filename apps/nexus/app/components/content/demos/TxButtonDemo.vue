<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const items = ref([])
const add = () => {}
const remove = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="display: grid; gap: 12px; width: 420px;">
      <div style="display: flex; gap: 8px;">
        <TxButton @click="add">
Add
</TxButton>
        <TxButton @click="remove">
Remove
</TxButton>
      </div>

      <TxStagger tag="div" :delay-step="30" :duration="180">
        <div
          v-for="item in items"
          :key="item.id"
          style="padding: 10px 12px; border-radius: 12px; border: 1px solid var(--tx-border-color-lighter); background: var(--tx-fill-color-blank);"
        >
          {{ item.text }}
        </div>
      </TxStagger>
    </div>
  </div>
  <div v-else>
    <div style="display: grid; gap: 12px; width: 420px;">
      <div style="display: flex; gap: 8px;">
        <TxButton @click="add">
Add
</TxButton>
        <TxButton @click="remove">
Remove
</TxButton>
      </div>

      <TxStagger tag="div" :delay-step="30" :duration="180">
        <div
          v-for="item in items"
          :key="item.id"
          style="padding: 10px 12px; border-radius: 12px; border: 1px solid var(--tx-border-color-lighter); background: var(--tx-fill-color-blank);"
        >
          {{ item.text }}
        </div>
      </TxStagger>
    </div>
  </div>
</template>
