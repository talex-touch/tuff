<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxCard>
          <TxSkeleton :loading="true" :lines="2" />
        </TxCard>
  </div>
  <div v-else>
        <TxCard>
          <TxSkeleton :loading="true" :lines="2" />
        </TxCard>
  </div>
</template>
