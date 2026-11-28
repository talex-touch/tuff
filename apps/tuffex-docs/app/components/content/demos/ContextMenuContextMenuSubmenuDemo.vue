<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      surface: '在这里右键',
      copy: '复制',
      share: '分享',
      mail: '邮件',
      messages: '信息',
      link: '复制链接',
    }
  }

  return {
    surface: 'Right-click here',
    copy: 'Copy',
    share: 'Share',
    mail: 'Mail',
    messages: 'Messages',
    link: 'Copy link',
  }
})
</script>

<template>
  <TxContextMenu>
    <div
      style="display: flex; align-items: center; justify-content: center; height: 120px; border: 1px dashed var(--tx-border-color); border-radius: 12px; color: var(--tx-text-color-secondary); user-select: none;"
    >
      {{ labels.surface }}
    </div>

    <template #menu>
      <TxContextMenuItem>{{ labels.copy }}</TxContextMenuItem>
      <TxContextMenuSubmenu>
        {{ labels.share }}
        <template #menu>
          <TxContextMenuItem>{{ labels.mail }}</TxContextMenuItem>
          <TxContextMenuItem>{{ labels.messages }}</TxContextMenuItem>
          <TxContextMenuItem>{{ labels.link }}</TxContextMenuItem>
        </template>
      </TxContextMenuSubmenu>
    </template>
  </TxContextMenu>
</template>
