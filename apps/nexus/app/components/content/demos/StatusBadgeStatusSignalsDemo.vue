<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxStatusBadge text="成功" status="success" />
        <TxStatusBadge text="警告" status="warning" />
        <TxStatusBadge text="错误" status="danger" />
        <TxStatusBadge text="信息" status="info" />
  </div>
  <div v-else>
        <TxStatusBadge text="Success" status="success" />
        <TxStatusBadge text="Warning" status="warning" />
        <TxStatusBadge text="Error" status="danger" />
        <TxStatusBadge text="Info" status="info" />
  </div>
</template>
