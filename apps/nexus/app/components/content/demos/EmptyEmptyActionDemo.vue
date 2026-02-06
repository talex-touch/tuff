<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxEmpty title="No items" description="Create your first item.">
          <template #action>
            <TxButton>New</TxButton>
          </template>
        </TxEmpty>
  </div>
  <div v-else>
        <TxEmpty title="No items" description="Create your first item.">
          <template #action>
            <TxButton>New</TxButton>
          </template>
        </TxEmpty>
  </div>
</template>
