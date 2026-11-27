<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      menu: '菜单',
      open: '打开（闪烁确认）',
      immediate: '立即执行（关闭反馈）',
      delete: '删除',
      action: '最近操作',
    }
  }

  return {
    menu: 'Menu',
    open: 'Open (confirm blink)',
    immediate: 'Run immediately (feedback off)',
    delete: 'Delete',
    action: 'Last action',
  }
})

const lastAction = ref('—')

function select(action: string) {
  lastAction.value = action
}
</script>

<template>
  <div class="not-prose dropdown-menu-demo">
    <TxDropdownMenu>
      <template #trigger>
        <TxButton>{{ labels.menu }}</TxButton>
      </template>

      <TxDropdownItem @select="select(labels.open)">
        {{ labels.open }}
      </TxDropdownItem>
      <TxDropdownItem :activation-feedback="false" @select="select(labels.immediate)">
        {{ labels.immediate }}
      </TxDropdownItem>
      <TxDropdownItem danger @select="select(labels.delete)">
        {{ labels.delete }}
      </TxDropdownItem>
    </TxDropdownMenu>

    <div class="dropdown-menu-demo__status">
      {{ labels.action }}: {{ lastAction }}
    </div>
  </div>
</template>

<style scoped>
.dropdown-menu-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.dropdown-menu-demo__status {
  padding: 7px 10px;
  border-radius: 10px;
  color: var(--tx-text-color-secondary, #909399);
  background: color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 70%, transparent);
  font-size: 13px;
}
</style>
