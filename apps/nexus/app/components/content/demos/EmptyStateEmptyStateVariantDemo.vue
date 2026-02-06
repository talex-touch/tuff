<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxEmptyState
          variant="no-data"
          :primary-action="{ label: 'Create', type: 'primary' }"
          :secondary-action="{ label: 'Refresh' }"
        />
  </div>
  <div v-else>
        <TxEmptyState
          variant="no-data"
          :primary-action="{ label: 'Create', type: 'primary' }"
          :secondary-action="{ label: 'Refresh' }"
        />
  </div>
</template>
