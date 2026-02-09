<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxEmptyState
          variant="no-selection"
          layout="horizontal"
          surface="card"
          title="No selection"
          description="Pick an item from the left to continue."
        />
  </div>
  <div v-else>
        <TxEmptyState
          variant="no-selection"
          layout="horizontal"
          surface="card"
          title="No selection"
          description="Pick an item from the left to continue."
        />
  </div>
</template>
