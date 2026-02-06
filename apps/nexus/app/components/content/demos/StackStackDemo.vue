<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 360px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <TxStack :gap="10">
          <TxButton>One</TxButton>
          <TxButton variant="secondary">
            Two
          </TxButton>
          <TxButton variant="ghost">
            Three
          </TxButton>
        </TxStack>
      </div>
  </div>
  <div v-else>
      <div style="width: 360px; padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
        <TxStack :gap="10">
          <TxButton>One</TxButton>
          <TxButton variant="secondary">
            Two
          </TxButton>
          <TxButton variant="ghost">
            Three
          </TxButton>
        </TxStack>
      </div>
  </div>
</template>
