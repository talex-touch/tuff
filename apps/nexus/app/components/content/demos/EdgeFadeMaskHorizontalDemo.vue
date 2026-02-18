<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div style="width: 520px; max-width: 100%; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <TxEdgeFadeMask axis="horizontal" :size="40" style="height: 116px;">
      <div style="display: flex; align-items: center; gap: 12px; width: max-content; padding: 12px;">
        <div
          v-for="index in 10"
          :key="index"
          style="width: 120px; height: 84px; border-radius: 10px; border: 1px solid var(--tx-border-color-light); background: var(--tx-fill-color-light); display: flex; align-items: center; justify-content: center; color: var(--tx-text-color-secondary); font-size: 13px;"
        >
          {{ locale === 'zh' ? '卡片' : 'Item' }} {{ index }}
        </div>
      </div>
    </TxEdgeFadeMask>
  </div>
</template>
