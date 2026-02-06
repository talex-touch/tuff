<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const ratio = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 520px; height: 240px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden;">
        <TxSplitter v-model="ratio" style="width: 100%; height: 100%;">
          <template #a>
            <div style="height: 100%; padding: 12px; color: var(--tx-text-color-secondary);">
              A ({{ ratio.toFixed(2) }})
            </div>
          </template>
          <template #b>
            <div style="height: 100%; padding: 12px; color: var(--tx-text-color-secondary);">
              B
            </div>
          </template>
        </TxSplitter>
      </div>
  </div>
  <div v-else>
      <div style="width: 520px; height: 240px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden;">
        <TxSplitter v-model="ratio" style="width: 100%; height: 100%;">
          <template #a>
            <div style="height: 100%; padding: 12px; color: var(--tx-text-color-secondary);">
              A ({{ ratio.toFixed(2) }})
            </div>
          </template>
          <template #b>
            <div style="height: 100%; padding: 12px; color: var(--tx-text-color-secondary);">
              B
            </div>
          </template>
        </TxSplitter>
      </div>
  </div>
</template>
