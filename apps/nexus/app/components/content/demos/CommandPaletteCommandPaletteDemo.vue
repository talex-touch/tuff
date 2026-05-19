<script setup lang="ts">
import { computed, ref } from 'vue'

interface CommandItem {
  id: string
  title: string
  description: string
  keywords: string[]
  icon: string
  shortcut: string
  disabled?: boolean
}

const { locale } = useI18n()
const open = ref(false)
const selectedId = ref('search-files')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      kicker: '全局启动器',
      title: 'CommandPalette',
      description: '把搜索、系统动作、插件入口放进同一个键盘优先的选择面板。',
      open: '打开命令面板',
      lastAction: '最近动作',
      placeholder: '搜索命令、插件或设置...',
      emptyText: '没有匹配的命令',
      hint: '支持标题、描述和关键词匹配',
    }
  }

  return {
    kicker: 'Global launcher',
    title: 'CommandPalette',
    description: 'Place search, system actions, and plugin entries in one keyboard-first panel.',
    open: 'Open command palette',
    lastAction: 'Last action',
    placeholder: 'Search commands, plugins, or settings...',
    emptyText: 'No matching commands',
    hint: 'Matches title, description, and keywords',
  }
})

const commands = computed<CommandItem[]>(() => {
  if (locale.value === 'zh') {
    return [
      {
        id: 'search-files',
        title: '搜索文件',
        description: '在文档、下载和桌面中查找本地文件',
        keywords: ['file', 'finder', 'everything', '文件'],
        icon: 'i-carbon-search',
        shortcut: '⌘ K',
      },
      {
        id: 'quick-note',
        title: '保存快速笔记',
        description: '把当前剪贴板文本保存到片段库',
        keywords: ['snippet', 'note', 'clipboard', '片段'],
        icon: 'i-carbon-notebook',
        shortcut: '⌘ ⇧ N',
      },
      {
        id: 'browser-open',
        title: '用浏览器打开',
        description: '使用默认浏览器打开输入的 URL',
        keywords: ['url', 'link', 'browser', '网页'],
        icon: 'i-carbon-launch',
        shortcut: '⌘ ↵',
      },
      {
        id: 'sync-settings',
        title: '同步设置',
        description: '打开账户同步与设备管理',
        keywords: ['sync', 'account', 'device', '同步'],
        icon: 'i-carbon-cloud',
        shortcut: '⌘ ,',
      },
      {
        id: 'locked-admin',
        title: '管理员脚本',
        description: '需要管理员权限后才能运行',
        keywords: ['admin', 'shell', 'script', '权限'],
        icon: 'i-carbon-locked',
        shortcut: '⌘ ⇧ S',
        disabled: true,
      },
    ]
  }

  return [
    {
      id: 'search-files',
      title: 'Search Files',
      description: 'Find local files across Documents, Downloads, and Desktop',
      keywords: ['file', 'finder', 'everything'],
      icon: 'i-carbon-search',
      shortcut: '⌘ K',
    },
    {
      id: 'quick-note',
      title: 'Save Quick Note',
      description: 'Save clipboard text into the snippets library',
      keywords: ['snippet', 'note', 'clipboard'],
      icon: 'i-carbon-notebook',
      shortcut: '⌘ ⇧ N',
    },
    {
      id: 'browser-open',
      title: 'Open In Browser',
      description: 'Open the typed URL in the default browser',
      keywords: ['url', 'link', 'browser'],
      icon: 'i-carbon-launch',
      shortcut: '⌘ ↵',
    },
    {
      id: 'sync-settings',
      title: 'Sync Settings',
      description: 'Open account sync and device management',
      keywords: ['sync', 'account', 'device'],
      icon: 'i-carbon-cloud',
      shortcut: '⌘ ,',
    },
    {
      id: 'locked-admin',
      title: 'Admin Script',
      description: 'Requires administrator permission before running',
      keywords: ['admin', 'shell', 'script'],
      icon: 'i-carbon-locked',
      shortcut: '⌘ ⇧ S',
      disabled: true,
    },
  ]
})

const selected = computed(() => commands.value.find(command => command.id === selectedId.value))

function onSelect(command: CommandItem) {
  selectedId.value = command.id
}
</script>

<template>
  <div class="command-palette-demo">
    <div class="command-palette-demo__copy">
      <div class="command-palette-demo__kicker">
        {{ labels.kicker }}
      </div>
      <div class="command-palette-demo__title">
        {{ labels.title }}
      </div>
      <div class="command-palette-demo__desc">
        {{ labels.description }}
      </div>
      <TxButton variant="primary" @click="open = true">
        {{ labels.open }}
      </TxButton>
    </div>

    <div class="command-palette-demo__preview" role="presentation">
      <div class="command-palette-demo__search-row">
        <TxIcon name="i-carbon-search" :size="16" />
        <span>{{ labels.placeholder }}</span>
        <kbd>⌘ K</kbd>
      </div>

      <div class="command-palette-demo__list">
        <div
          v-for="command in commands.slice(0, 4)"
          :key="command.id"
          class="command-palette-demo__item"
          :class="{ 'is-selected': command.id === selectedId }"
        >
          <TxIcon :name="command.icon" :size="16" />
          <span>{{ command.title }}</span>
          <kbd>{{ command.shortcut }}</kbd>
        </div>
      </div>

      <div class="command-palette-demo__footer">
        <span>{{ labels.lastAction }}</span>
        <strong>{{ selected?.title }}</strong>
      </div>
    </div>

    <div class="command-palette-demo__hint">
      {{ labels.hint }}
    </div>
  </div>

  <TxCommandPalette
    v-model="open"
    :commands="commands"
    :placeholder="labels.placeholder"
    :empty-text="labels.emptyText"
    :max-height="280"
    @select="onSelect"
  />
</template>

<style scoped>
.command-palette-demo {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(260px, 1.1fr);
  gap: 18px;
  width: min(720px, 100%);
  padding: 18px;
  border: 1px solid var(--tx-border-color, rgba(148, 163, 184, 0.32));
  border-radius: 14px;
  background:
    linear-gradient(135deg, rgba(20, 184, 166, 0.08), rgba(59, 130, 246, 0.04)),
    var(--tx-fill-color-blank, rgba(255, 255, 255, 0.76));
}

.command-palette-demo__copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.command-palette-demo__kicker {
  font-size: 12px;
  font-weight: 700;
  color: var(--tx-color-primary, #14b8a6);
  text-transform: uppercase;
}

.command-palette-demo__title {
  font-size: 20px;
  font-weight: 700;
  color: var(--tx-text-color-primary, #111827);
}

.command-palette-demo__desc {
  max-width: 280px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--tx-text-color-secondary, #64748b);
}

.command-palette-demo__preview {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--tx-border-color, rgba(148, 163, 184, 0.32));
  border-radius: 12px;
  background: var(--tx-bg-color, rgba(255, 255, 255, 0.82));
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.08);
}

.command-palette-demo__search-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--tx-border-color, rgba(148, 163, 184, 0.24));
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 13px;
}

.command-palette-demo__search-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-palette-demo__list {
  display: grid;
  gap: 2px;
  padding: 8px;
}

.command-palette-demo__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
  border-radius: 9px;
  color: var(--tx-text-color-regular, #334155);
  font-size: 13px;
}

.command-palette-demo__item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-palette-demo__item.is-selected {
  color: var(--tx-color-primary, #0f766e);
  background: rgba(20, 184, 166, 0.11);
}

.command-palette-demo__footer {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--tx-border-color, rgba(148, 163, 184, 0.24));
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 12px;
}

.command-palette-demo__footer strong {
  overflow: hidden;
  color: var(--tx-text-color-primary, #111827);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-palette-demo__hint {
  grid-column: 1 / -1;
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 12px;
}

.command-palette-demo kbd {
  min-width: max-content;
  padding: 2px 6px;
  border: 1px solid var(--tx-border-color, rgba(148, 163, 184, 0.4));
  border-radius: 6px;
  background: var(--tx-fill-color-light, rgba(248, 250, 252, 0.9));
  color: var(--tx-text-color-secondary, #64748b);
  font-family: inherit;
  font-size: 11px;
}

@media (max-width: 680px) {
  .command-palette-demo {
    grid-template-columns: 1fr;
  }

  .command-palette-demo__desc {
    max-width: none;
  }
}
</style>
