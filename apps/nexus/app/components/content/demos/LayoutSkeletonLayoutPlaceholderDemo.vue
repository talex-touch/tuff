<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <div style="height: 240px;">
          <TxLayoutSkeleton />
        </div>
  </div>
  <div v-else>
        <div style="height: 240px;">
          <TxLayoutSkeleton />
        </div>
  </div>
</template>
