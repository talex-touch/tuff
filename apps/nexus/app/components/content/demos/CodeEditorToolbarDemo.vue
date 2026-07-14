<script setup lang="ts">
import type { CodeEditorToolbarAction, CodeEditorToolbarActionKey } from '@talex-touch/tuffex/code-editor'
import { computed, ref } from 'vue'

const { locale } = useI18n()

interface CodeEditorToolbarSlot {
  format: () => boolean
  openSearch: () => boolean
  foldAll: () => boolean
  unfoldAll: () => boolean
  copy: () => Promise<boolean>
}

const value = ref('{"name":"Tuffex","version":1,"features":["lint","format","search"]}')
const lastAction = ref('')

const copy = computed(() => (locale.value === 'zh'
  ? {
      format: '格式化',
      search: '搜索',
      foldAll: '折叠',
      unfoldAll: '展开',
      copy: '复制',
      lastAction: '最近操作',
    }
  : {
      format: 'Format',
      search: 'Search',
      foldAll: 'Fold',
      unfoldAll: 'Unfold',
      copy: 'Copy',
      lastAction: 'Last action',
    }))

const toolbarActions = computed<CodeEditorToolbarAction[]>(() => [
  { key: 'format', label: copy.value.format, icon: 'i-carbon-code' },
  { key: 'search', label: copy.value.search, icon: 'i-carbon-search', shortcut: '⌘F' },
  { key: 'foldAll', label: copy.value.foldAll, icon: 'i-carbon-collapse-categories' },
  { key: 'unfoldAll', label: copy.value.unfoldAll, icon: 'i-carbon-row-expand' },
  { key: 'copy', label: copy.value.copy, icon: 'i-carbon-copy' },
])

function handleAction(key: CodeEditorToolbarActionKey, editor: CodeEditorToolbarSlot) {
  lastAction.value = String(key)

  if (key === 'format')
    editor.format()
  if (key === 'search')
    editor.openSearch()
  if (key === 'foldAll')
    editor.foldAll()
  if (key === 'unfoldAll')
    editor.unfoldAll()
  if (key === 'copy')
    editor.copy()
}
</script>

<template>
  <div class="code-editor-toolbar-demo">
    <TxCodeEditor v-model="value" language="json" :line-wrapping="true">
      <template #toolbar="editor">
        <TxCodeEditorToolbar
          :actions="toolbarActions"
          compact
          @action="handleAction($event as CodeEditorToolbarActionKey, editor)"
        />
      </template>
    </TxCodeEditor>

    <p v-if="lastAction" class="code-editor-toolbar-demo__status">
      {{ copy.lastAction }}: {{ lastAction }}
    </p>
  </div>
</template>

<style scoped>
.code-editor-toolbar-demo {
  display: grid;
  gap: 10px;
}

.code-editor-toolbar-demo__status {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>
