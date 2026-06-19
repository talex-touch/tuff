<script lang="ts" setup>
import type { ITouchPlugin } from '@talex-touch/utils/plugin'
import type { PluginFileTreeNode } from '@talex-touch/utils/transport/events/types'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxEmpty } from '@talex-touch/tuffex/empty'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { pluginSDK } from '~/modules/sdk/plugin-sdk'
import { createRendererLogger } from '~/utils/renderer-log'

const props = defineProps<{
  plugin: ITouchPlugin
}>()

const { t, locale } = useI18n()
const pluginStructureLog = createRendererLogger('PluginStructure')

type PluginPathType = 'plugin' | 'data' | 'config' | 'logs' | 'temp'

interface FileTreeRow {
  key: string
  level: number
  node: PluginFileTreeNode
}

const loading = ref(false)
const fileTree = ref<PluginFileTreeNode[]>([])

const fileCount = computed(() => {
  let count = 0

  function walk(nodes: PluginFileTreeNode[]): void {
    for (const node of nodes) {
      if (node.type === 'file') {
        count += 1
      }
      if (node.children?.length) {
        walk(node.children)
      }
    }
  }

  walk(fileTree.value)
  return count
})

const directoryCount = computed(() => {
  let count = 0

  function walk(nodes: PluginFileTreeNode[]): void {
    for (const node of nodes) {
      if (node.type === 'directory') {
        count += 1
      }
      if (node.children?.length) {
        walk(node.children)
      }
    }
  }

  walk(fileTree.value)
  return count
})

const rows = computed<FileTreeRow[]>(() => {
  const nextRows: FileTreeRow[] = []

  function walk(nodes: PluginFileTreeNode[], level: number): void {
    for (const node of nodes) {
      nextRows.push({
        key: node.path || node.name,
        level,
        node
      })
      if (node.children?.length) {
        walk(node.children, level + 1)
      }
    }
  }

  walk(fileTree.value, 0)
  return nextRows
})

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '--'

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDate(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '--'
  return new Date(timestamp).toLocaleString(locale.value || undefined)
}

function getFileIcon(node: PluginFileTreeNode): string {
  if (node.type === 'directory') return 'i-ri-folder-3-line'

  const ext = node.name.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, string> = {
    css: 'i-ri-file-code-line',
    html: 'i-ri-html5-line',
    js: 'i-ri-javascript-line',
    json: 'i-ri-braces-line',
    jsx: 'i-ri-reactjs-line',
    md: 'i-ri-markdown-line',
    ts: 'i-ri-file-code-line',
    tsx: 'i-ri-reactjs-line',
    vue: 'i-ri-vuejs-line'
  }

  return iconMap[ext || ''] || 'i-ri-file-line'
}

function getFileColor(node: PluginFileTreeNode): string {
  if (node.type === 'directory') return 'var(--tx-color-warning)'
  if (node.name === 'manifest.json') return 'var(--tx-color-success)'
  if (node.name.toLowerCase().includes('readme')) return 'var(--tx-color-info)'
  return 'var(--tx-text-color-secondary)'
}

async function loadFileTree(): Promise<void> {
  loading.value = true
  try {
    fileTree.value = await pluginSDK.getFileTree(props.plugin.name)
  } catch (error) {
    pluginStructureLog.error('Failed to load plugin file tree:', error)
    fileTree.value = []
  } finally {
    loading.value = false
  }
}

async function openPath(pathType: PluginPathType): Promise<void> {
  const result = await pluginSDK.openPath(props.plugin.name, pathType)
  if (!result.success) {
    pluginStructureLog.warn(`Failed to open plugin path: ${pathType}`)
  }
}

onMounted(() => {
  void loadFileTree()
})

watch(
  () => props.plugin.name,
  () => {
    fileTree.value = []
    void loadFileTree()
  }
)
</script>

<template>
  <div class="PluginStructure w-full h-full min-h-0 flex flex-col">
    <section class="PluginStructure-Panel">
      <div class="PluginStructure-Header">
        <div class="PluginStructure-TitleBlock">
          <h3>{{ t('plugin.structure.files.title') }}</h3>
          <p>
            {{
              t('plugin.structure.files.summary', {
                files: fileCount,
                directories: directoryCount
              })
            }}
          </p>
        </div>

        <div class="PluginStructure-Actions">
          <TxButton size="small" plain icon="i-ri-folder-open-line" @click="openPath('plugin')">
            {{ t('plugin.structure.actions.openRoot') }}
          </TxButton>
          <TxButton
            size="small"
            type="primary"
            plain
            icon="i-ri-refresh-line"
            :loading="loading"
            @click="loadFileTree"
          >
            {{ t('plugin.structure.actions.refresh') }}
          </TxButton>
        </div>
      </div>

      <div v-if="loading" class="PluginStructure-Loading">
        <i class="i-ri-loader-4-line animate-spin" />
        <span>{{ t('plugin.structure.loading') }}</span>
      </div>

      <TxEmpty
        v-else-if="rows.length === 0"
        class="PluginStructure-Empty"
        :title="t('plugin.structure.files.empty')"
        compact
      />

      <div v-else class="PluginStructure-Table">
        <div class="PluginStructure-TableHeader">
          <div>{{ t('plugin.structure.files.name') }}</div>
          <div>{{ t('plugin.structure.files.size') }}</div>
          <div>{{ t('plugin.structure.files.modified') }}</div>
        </div>

        <TxScroll no-padding native class="PluginStructure-Scroll">
          <div class="PluginStructure-Rows">
            <div
              v-for="row in rows"
              :key="row.key"
              class="PluginStructure-Row"
              :style="{ '--indent': `${row.level * 20}px` }"
            >
              <div class="PluginStructure-NameCell">
                <span class="PluginStructure-Indent" />
                <i :class="getFileIcon(row.node)" :style="{ color: getFileColor(row.node) }" />
                <div class="PluginStructure-NameText">
                  <strong>{{ row.node.name }}</strong>
                  <small>{{ row.node.path }}</small>
                </div>
              </div>

              <div class="PluginStructure-MetaCell">
                {{ row.node.type === 'directory' ? '--' : formatSize(row.node.size) }}
              </div>

              <div class="PluginStructure-MetaCell">
                {{ formatDate(row.node.modified) }}
              </div>
            </div>
          </div>
        </TxScroll>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.PluginStructure {
  min-height: 0;
  color: var(--tx-text-color-primary);
  overflow: hidden;
}

.PluginStructure-Panel {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 8px;
  background: var(--tx-bg-color);
}

.PluginStructure-Header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.PluginStructure-TitleBlock {
  min-width: 0;

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
  }

  p {
    margin: 4px 0 0;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
  }
}

.PluginStructure-Actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.PluginStructure-Loading,
.PluginStructure-Empty {
  min-height: 260px;
}

.PluginStructure-Loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}

.PluginStructure-Table {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
}

.PluginStructure-TableHeader,
.PluginStructure-Row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 180px;
  gap: 12px;
  align-items: center;
}

.PluginStructure-TableHeader {
  padding: 10px 16px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  font-weight: 650;
  text-transform: uppercase;
}

.PluginStructure-Scroll {
  min-height: 0;
  height: 100%;
  flex: 1;
}

.PluginStructure-Scroll :deep(.tx-scroll__native),
.PluginStructure-Scroll :deep(.tx-scroll__wrapper),
.PluginStructure-Scroll :deep(.tx-scroll__content) {
  min-height: 0;
}

.PluginStructure-Rows {
  padding: 6px 8px;
}

.PluginStructure-Row {
  min-height: 46px;
  padding: 6px 8px;
  border-radius: 8px;

  &:hover {
    background: var(--tx-fill-color-light);
  }
}

.PluginStructure-NameCell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.PluginStructure-Indent {
  flex: 0 0 var(--indent);
  width: var(--indent);
}

.PluginStructure-NameCell i {
  flex: 0 0 auto;
  font-size: 18px;
}

.PluginStructure-NameText {
  min-width: 0;
  display: flex;
  flex-direction: column;

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 13px;
    font-weight: 600;
  }

  small {
    color: var(--tx-text-color-secondary);
    font-size: 11px;
  }
}

.PluginStructure-MetaCell {
  overflow: hidden;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .PluginStructure-Header {
    flex-direction: column;
  }

  .PluginStructure-Actions {
    width: 100%;
    justify-content: flex-start;
  }

  .PluginStructure-TableHeader,
  .PluginStructure-Row {
    grid-template-columns: minmax(0, 1fr) 84px;
  }

  .PluginStructure-TableHeader > :last-child,
  .PluginStructure-Row > :last-child {
    display: none;
  }
}
</style>
