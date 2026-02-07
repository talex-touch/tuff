<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="width: 360px;">
      <TxGradientBorder :padding="16" :border-radius="16">
        <div style="background: var(--tx-bg-color); border-radius: 12px; padding: 16px;">
          Content
        </div>
      </TxGradientBorder>
    </div>
  </div>
  <div v-else>
    <div style="width: 360px;">
      <TxGradientBorder :padding="16" :border-radius="16">
        <div style="background: var(--tx-bg-color); border-radius: 12px; padding: 16px;">
          Content
        </div>
      </TxGradientBorder>
    </div>
  </div>
</template>
