<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxGradientBorder :padding="16" :border-radius="16">
          <div style="background: var(--tx-bg-color); border-radius: 12px; padding: 16px;">
            Content
          </div>
        </TxGradientBorder>
  </div>
  <div v-else>
        <TxGradientBorder :padding="16" :border-radius="16">
          <div style="background: var(--tx-bg-color); border-radius: 12px; padding: 16px;">
            Content
          </div>
        </TxGradientBorder>
  </div>
</template>
