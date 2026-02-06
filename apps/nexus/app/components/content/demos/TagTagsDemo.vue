<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxTag label="默认" />
        <TxTag label="成功" color="var(--tx-color-success)" />
        <TxTag label="警告" color="var(--tx-color-warning)" />
        <TxTag label="危险" color="var(--tx-color-danger)" />
  </div>
  <div v-else>
        <TxTag label="Default" />
        <TxTag label="Success" color="var(--tx-color-success)" />
        <TxTag label="Warning" color="var(--tx-color-warning)" />
        <TxTag label="Danger" color="var(--tx-color-danger)" />
  </div>
</template>
