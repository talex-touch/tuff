<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 360px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <TxFlex justify="space-between" align="center">
          <TxTag label="Left" />
          <TxButton variant="primary">
            Action
          </TxButton>
        </TxFlex>
      </div>
  </div>
  <div v-else>
      <div style="width: 360px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <TxFlex justify="space-between" align="center">
          <TxTag label="Left" />
          <TxButton variant="primary">
            Action
          </TxButton>
        </TxFlex>
      </div>
  </div>
</template>
