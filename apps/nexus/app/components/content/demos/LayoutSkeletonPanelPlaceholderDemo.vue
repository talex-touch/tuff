<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxCard>
          <TxLayoutSkeleton />
        </TxCard>
  </div>
  <div v-else>
        <TxCard>
          <TxLayoutSkeleton />
        </TxCard>
  </div>
</template>
