<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxSkeleton :loading="true" :lines="3" />
        <TxSkeleton variant="circle" :width="40" :height="40" />
  </div>
  <div v-else>
        <TxSkeleton :loading="true" :lines="3" />
        <TxSkeleton variant="circle" :width="40" :height="40" />
  </div>
</template>
