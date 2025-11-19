<script lang="ts" setup>
import type { StorageTreeNode } from '@talex-touch/utils/types/storage'
import { computed, ref } from 'vue'

// Props
const props = withDefaults(
  defineProps<{
    node: StorageTreeNode
    level?: number
    selectedPath?: string | null
  }>(),
  {
    level: 0,
    selectedPath: null,
  },
)

// Emits
const emit = defineEmits<{
  (e: 'select', node: StorageTreeNode): void
}>()

// State
const expanded = ref(props.level === 0) // Expand root level by default

// Computed
const isSelected = computed(() => props.selectedPath === props.node.path)

const iconClass = computed(() => {
  if (props.node.type === 'directory') {
    return expanded.value ? 'i-ri-folder-open-line' : 'i-ri-folder-line'
  }

  const ext = props.node.name.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, string> = {
    json: 'i-ri-file-code-line',
    log: 'i-ri-file-text-line',
    txt: 'i-ri-file-text-line',
    md: 'i-ri-markdown-line',
    png: 'i-ri-image-line',
    jpg: 'i-ri-image-line',
    jpeg: 'i-ri-image-line',
    gif: 'i-ri-image-line',
    webp: 'i-ri-image-line',
    svg: 'i-ri-image-line',
  }

  return iconMap[ext || ''] || 'i-ri-file-line'
})

const iconColor = computed(() => {
  if (props.node.type === 'directory') {
    return 'var(--el-color-warning)'
  }

  const ext = props.node.name.split('.').pop()?.toLowerCase()
  const colorMap: Record<string, string> = {
    json: 'var(--el-color-success)',
    log: 'var(--el-color-info)',
    txt: 'var(--el-color-info)',
    md: 'var(--el-color-info)',
    png: 'var(--el-color-primary)',
    jpg: 'var(--el-color-primary)',
    jpeg: 'var(--el-color-primary)',
    gif: 'var(--el-color-primary)',
    webp: 'var(--el-color-primary)',
    svg: 'var(--el-color-primary)',
  }

  return colorMap[ext || ''] || 'var(--el-text-color-secondary)'
})

// Methods
function formatSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

function toggleExpand(): void {
  if (props.node.type === 'directory') {
    expanded.value = !expanded.value
  }
}

function handleClick(): void {
  if (props.node.type === 'file') {
    emit('select', props.node)
  }
  else {
    toggleExpand()
  }
}
</script>

<template>
  <div class="StorageTreeItem">
    <div
      class="StorageTreeItem-Row flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--el-fill-color-light)] transition-colors"
      :class="{
        'bg-[var(--el-fill-color)]': isSelected,
        'pl-8': level > 0,
      }"
      :style="{ paddingLeft: `${level * 20 + 12}px` }"
      @click="handleClick"
    >
      <!-- Expand/Collapse Icon -->
      <i
        v-if="node.type === 'directory'"
        class="text-sm transition-transform cursor-pointer"
        :class="expanded ? 'i-ri-arrow-down-s-line' : 'i-ri-arrow-right-s-line'"
        @click.stop="toggleExpand"
      />
      <div v-else class="w-4" />

      <!-- File/Directory Icon -->
      <i class="text-lg" :class="iconClass" :style="{ color: iconColor }" />

      <!-- Name -->
      <span class="flex-1 text-sm truncate">{{ node.name }}</span>

      <!-- Size -->
      <span class="text-xs text-[var(--el-text-color-secondary)]">
        {{ formatSize(node.size) }}
      </span>
    </div>

    <!-- Children (for directories) -->
    <div v-if="node.type === 'directory' && expanded && node.children">
      <StorageTreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :level="level + 1"
        :selected-path="selectedPath"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.StorageTreeItem-Row {
  user-select: none;
}
</style>
