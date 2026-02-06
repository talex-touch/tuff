<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 360px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden;">
        <TxNavBar title="Title" :show-back="true" @back="() => {}">
          <template #right>
            <TxButton variant="ghost" size="small">
              Edit
            </TxButton>
          </template>
        </TxNavBar>

        <div style="padding: 16px; color: var(--tx-text-color-secondary);">
          Content
        </div>
      </div>
  </div>
  <div v-else>
      <div style="width: 360px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden;">
        <TxNavBar title="Title" :show-back="true" @back="() => {}">
          <template #right>
            <TxButton variant="ghost" size="small">
              Edit
            </TxButton>
          </template>
        </TxNavBar>

        <div style="padding: 16px; color: var(--tx-text-color-secondary);">
          Content
        </div>
      </div>
  </div>
</template>
