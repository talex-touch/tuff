<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const i = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 520px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <TxGrid :cols="3" :gap="12">
          <TxGridItem v-for="itemIndex in 6" :key="itemIndex">
            <div style="height: 54px; border-radius: 10px; background: var(--tx-fill-color-light, #f5f7fa); display: flex; align-items: center; justify-content: center; color: var(--tx-text-color-secondary);">
              {{ itemIndex }}
            </div>
          </TxGridItem>
        </TxGrid>
      </div>
  </div>
  <div v-else>
      <div style="width: 520px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <TxGrid :cols="3" :gap="12">
          <TxGridItem v-for="itemIndex in 6" :key="itemIndex">
            <div style="height: 54px; border-radius: 10px; background: var(--tx-fill-color-light, #f5f7fa); display: flex; align-items: center; justify-content: center; color: var(--tx-text-color-secondary);">
              {{ itemIndex }}
            </div>
          </TxGridItem>
        </TxGrid>
      </div>
  </div>
</template>
