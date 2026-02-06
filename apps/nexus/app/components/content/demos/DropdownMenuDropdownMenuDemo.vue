<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxDropdownMenu>
          <template #trigger>
            <TxButton>Menu</TxButton>
          </template>
  
          <TxDropdownItem>Open</TxDropdownItem>
          <TxDropdownItem danger>
Delete
</TxDropdownItem>
        </TxDropdownMenu>
  </div>
  <div v-else>
        <TxDropdownMenu>
          <template #trigger>
            <TxButton>Menu</TxButton>
          </template>
  
          <TxDropdownItem>Open</TxDropdownItem>
          <TxDropdownItem danger>
Delete
</TxDropdownItem>
        </TxDropdownMenu>
  </div>
</template>
