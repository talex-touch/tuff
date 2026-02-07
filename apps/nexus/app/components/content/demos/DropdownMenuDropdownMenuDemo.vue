<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      menu: '菜单',
      open: '打开',
      delete: '删除',
    }
  }

  return {
    menu: 'Menu',
    open: 'Open',
    delete: 'Delete',
  }
})
</script>

<template>
  <TxDropdownMenu>
    <template #trigger>
      <TxButton>{{ labels.menu }}</TxButton>
    </template>

    <TxDropdownItem>{{ labels.open }}</TxDropdownItem>
    <TxDropdownItem danger>
      {{ labels.delete }}
    </TxDropdownItem>
  </TxDropdownMenu>
</template>
