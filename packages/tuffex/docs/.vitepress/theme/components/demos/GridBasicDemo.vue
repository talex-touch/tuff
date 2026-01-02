<template>
  <div style="width: 520px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <TxGrid :cols="3" :gap="12">
      <TxGridItem v-for="i in 6" :key="i">
        <div style="height: 54px; border-radius: 10px; background: var(--tx-fill-color-light, #f5f7fa); display: flex; align-items: center; justify-content: center; color: var(--tx-text-color-secondary);">
          {{ i }}
        </div>
      </TxGridItem>
    </TxGrid>
  </div>
</template>
