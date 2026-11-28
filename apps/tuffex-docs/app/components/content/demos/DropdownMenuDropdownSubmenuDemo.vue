<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const format = ref('PNG')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      menu: '操作',
      open: '打开',
      export: '导出为…',
      more: '更多格式',
    }
  }

  return {
    menu: 'Actions',
    open: 'Open',
    export: 'Export as…',
    more: 'More formats',
  }
})
</script>

<template>
  <TxDropdownMenu>
    <template #trigger>
      <TxButton>{{ labels.menu }}</TxButton>
    </template>

    <TxDropdownItem>{{ labels.open }}</TxDropdownItem>
    <TxDropdownSubmenu>
      {{ labels.export }}
      <template #right>
        <span style="opacity: 0.6; font-size: 12px;">{{ format }}</span>
      </template>
      <template #menu>
        <TxDropdownItem @select="format = 'PNG'">
          PNG
        </TxDropdownItem>
        <TxDropdownItem @select="format = 'SVG'">
          SVG
        </TxDropdownItem>
        <TxDropdownSubmenu>
          {{ labels.more }}
          <template #menu>
            <TxDropdownItem @select="format = 'WebP'">
              WebP
            </TxDropdownItem>
            <TxDropdownItem @select="format = 'AVIF'">
              AVIF
            </TxDropdownItem>
          </template>
        </TxDropdownSubmenu>
      </template>
    </TxDropdownSubmenu>
  </TxDropdownMenu>
</template>
