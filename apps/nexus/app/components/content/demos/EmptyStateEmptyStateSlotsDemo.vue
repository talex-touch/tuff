<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxEmptyState variant="custom">
          <template #icon>
            <TxIcon name="i-carbon-search" :size="28" />
          </template>
          <template #title>
            Setup required
          </template>
          <template #description>
            Connect a workspace to enable this feature.
          </template>
          <template #actions>
            <TxButton type="primary">
Connect
</TxButton>
            <TxButton>Learn more</TxButton>
          </template>
        </TxEmptyState>
  </div>
  <div v-else>
        <TxEmptyState variant="custom">
          <template #icon>
            <TxIcon name="i-carbon-search" :size="28" />
          </template>
          <template #title>
            Setup required
          </template>
          <template #description>
            Connect a workspace to enable this feature.
          </template>
          <template #actions>
            <TxButton type="primary">
Connect
</TxButton>
            <TxButton>Learn more</TxButton>
          </template>
        </TxEmptyState>
  </div>
</template>
