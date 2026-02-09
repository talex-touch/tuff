<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxTag>通知</TxTag>
        <TuffSwitch :model-value="true" />
  </div>
  <div v-else>
        <TxTag>Notifications</TxTag>
        <TuffSwitch :model-value="true" />
  </div>
</template>
