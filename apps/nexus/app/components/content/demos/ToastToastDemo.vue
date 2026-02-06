<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxToastHost />
        <TxButton @click="toast({ title: 'Saved', description: 'Your changes have been saved.' })">
          Show toast
        </TxButton>
        <TxButton
          style="margin-left: 8px;"
          @click="toast({ title: 'Success', description: 'Done', variant: 'success' })"
        >
          Success
        </TxButton>
  </div>
  <div v-else>
        <TxToastHost />
        <TxButton @click="toast({ title: 'Saved', description: 'Your changes have been saved.' })">
          Show toast
        </TxButton>
        <TxButton
          style="margin-left: 8px;"
          @click="toast({ title: 'Success', description: 'Done', variant: 'success' })"
        >
          Success
        </TxButton>
  </div>
</template>
