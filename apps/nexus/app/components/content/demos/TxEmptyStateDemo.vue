<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
    <div style="max-width: 420px;">
      <TxEmptyState variant="custom">
        <template #icon>
          <TxIcon name="i-carbon-search" :size="28" />
        </template>
        <template #title>
          No data
        </template>
        <template #description>
          Create a new item to get started.
        </template>
        <template #action>
          <TxButton size="small">
Create
</TxButton>
        </template>
      </TxEmptyState>
    </div>
  </div>
  <div v-else>
    <div style="max-width: 420px;">
      <TxEmptyState variant="custom">
        <template #icon>
          <TxIcon name="i-carbon-search" :size="28" />
        </template>
        <template #title>
          No data
        </template>
        <template #description>
          Create a new item to get started.
        </template>
        <template #action>
          <TxButton size="small">
Create
</TxButton>
        </template>
      </TxEmptyState>
    </div>
  </div>
</template>
