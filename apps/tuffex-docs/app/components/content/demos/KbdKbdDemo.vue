<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const shortcuts = computed(() => (locale.value === 'zh'
  ? [
      { action: '打开命令面板', keys: ['⌘', 'K'] },
      { action: '保存草稿', keys: ['⌘', 'S'] },
      { action: '切换预览', keys: ['⇧', '⌘', 'P'] },
    ]
  : [
      { action: 'Open command palette', keys: ['⌘', 'K'] },
      { action: 'Save draft', keys: ['⌘', 'S'] },
      { action: 'Toggle preview', keys: ['⇧', '⌘', 'P'] },
    ]))
</script>

<template>
  <div class="grid max-w-md gap-3">
    <div
      v-for="shortcut in shortcuts"
      :key="shortcut.action"
      class="flex items-center justify-between gap-4 rounded-xl border border-[var(--tx-border-color)] bg-[var(--tx-bg-color)] px-3 py-2"
    >
      <span class="text-sm text-[var(--tx-text-color-regular)]">{{ shortcut.action }}</span>
      <span class="flex items-center gap-1">
        <TxKbd
          v-for="key in shortcut.keys"
          :key="`${shortcut.action}-${key}`"
          tone="primary"
        >
          {{ key }}
        </TxKbd>
      </span>
    </div>
  </div>
</template>
