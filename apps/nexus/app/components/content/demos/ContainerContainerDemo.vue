<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 600px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden;">
        <TxContainer :padding="16">
          <TxRow :gutter="16">
            <TxCol :span="12">
              <div style="padding: 12px; border-radius: 10px; background: var(--tx-fill-color-light, #f5f7fa);">
                Left
              </div>
            </TxCol>
            <TxCol :span="12">
              <div style="padding: 12px; border-radius: 10px; background: var(--tx-fill-color-light, #f5f7fa);">
                Right
              </div>
            </TxCol>
          </TxRow>
        </TxContainer>
      </div>
  </div>
  <div v-else>
      <div style="width: 600px; border: 1px solid var(--tx-border-color); border-radius: 12px; overflow: hidden;">
        <TxContainer :padding="16">
          <TxRow :gutter="16">
            <TxCol :span="12">
              <div style="padding: 12px; border-radius: 10px; background: var(--tx-fill-color-light, #f5f7fa);">
                Left
              </div>
            </TxCol>
            <TxCol :span="12">
              <div style="padding: 12px; border-radius: 10px; background: var(--tx-fill-color-light, #f5f7fa);">
                Right
              </div>
            </TxCol>
          </TxRow>
        </TxContainer>
      </div>
  </div>
</template>
