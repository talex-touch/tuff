<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxTooltip content="分享">
          <TxButton icon="i-ri-share-line" circle />
        </TxTooltip>
  </div>
  <div v-else>
        <TxTooltip content="Share">
          <TxButton icon="i-ri-share-line" circle />
        </TxTooltip>
  </div>
</template>
