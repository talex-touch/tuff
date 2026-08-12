<template>
  <div>
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
