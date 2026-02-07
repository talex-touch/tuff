<script setup lang="ts">
import { computed, ref } from 'vue'

interface CommandItem {
  id: string
  title: string
  description: string
  shortcut: string
}

const { locale } = useI18n()
const open = ref(false)
const selected = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      open: '打开命令面板',
      selected: '选中',
      empty: '—',
    }
  }

  return {
    open: 'Open command palette',
    selected: 'Selected',
    empty: '-',
  }
})

const commands = computed<CommandItem[]>(() => {
  if (locale.value === 'zh') {
    return [
      { id: 'open', title: '打开文件', description: '快速打开文件', shortcut: 'Cmd/Ctrl+O' },
      { id: 'search', title: '全局搜索', description: '搜索全部内容', shortcut: 'Cmd/Ctrl+K' },
      { id: 'settings', title: '应用设置', description: '打开偏好设置', shortcut: 'Cmd/Ctrl+,' },
    ]
  }

  return [
    { id: 'open', title: 'Open File', description: 'Quickly open a file', shortcut: 'Cmd/Ctrl+O' },
    { id: 'search', title: 'Global Search', description: 'Search across content', shortcut: 'Cmd/Ctrl+K' },
    { id: 'settings', title: 'Settings', description: 'Open preferences', shortcut: 'Cmd/Ctrl+,' },
  ]
})

function onSelect(command: CommandItem) {
  selected.value = command.title
}
</script>

<template>
  <div class="group" style="max-width: 360px;">
    <TxButton variant="primary" @click="open = true">
      {{ labels.open }}
    </TxButton>
    <span style="margin-left: 8px; font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
      {{ labels.selected }}：{{ selected || labels.empty }}
    </span>
  </div>

  <TxCommandPalette v-model="open" :commands="commands" @select="onSelect" />
</template>
