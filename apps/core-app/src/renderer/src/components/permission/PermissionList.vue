<script setup lang="ts">
/**
 * Permission List
 *
 * Displays a list of permissions with their grant status.
 */

import {
  Check,
  Coin,
  Connection,
  Cpu,
  Document,
  DocumentCopy,
  InfoFilled,
  Monitor,
  Platform,
  Warning
} from '@element-plus/icons-vue'
import { ElEmpty, ElIcon, ElSwitch, ElTag, ElTooltip } from 'element-plus'
import type { Component } from 'vue'
import { computed } from 'vue'

interface PermissionItem {
  id: string
  name: string
  desc: string
  category: string
  risk: 'low' | 'medium' | 'high'
  required: boolean
  granted: boolean
  reason?: string
}

interface Props {
  permissions: PermissionItem[]
  readonly?: boolean
  showEmpty?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  showEmpty: true
})

const emit = defineEmits<{
  (e: 'toggle', id: string, granted: boolean): void
}>()

const groupedPermissions = computed(() => {
  const groups: Record<string, PermissionItem[]> = {}

  for (const perm of props.permissions) {
    if (!groups[perm.category]) {
      groups[perm.category] = []
    }
    groups[perm.category].push(perm)
  }

  return groups
})

const categoryNames: Record<string, string> = {
  fs: '文件系统',
  clipboard: '剪贴板',
  network: '网络',
  system: '系统',
  ai: 'AI 能力',
  storage: '存储',
  window: '窗口'
}

const categoryIcons: Record<string, Component> = {
  fs: Document,
  clipboard: DocumentCopy,
  network: Connection,
  system: Cpu,
  ai: Coin,
  storage: Platform,
  window: Monitor
}

function getRiskColor(risk: string) {
  switch (risk) {
    case 'low':
      return 'success'
    case 'medium':
      return 'warning'
    case 'high':
      return 'danger'
    default:
      return 'info'
  }
}

function getRiskLabel(risk: string) {
  switch (risk) {
    case 'low':
      return '低'
    case 'medium':
      return '中'
    case 'high':
      return '高'
    default:
      return '?'
  }
}

function handleToggle(id: string, granted: boolean) {
  emit('toggle', id, granted)
}
</script>

<template>
  <div class="permission-list">
    <ElEmpty
      v-if="showEmpty && permissions.length === 0"
      description="此插件未声明任何权限"
      :image-size="60"
    />

    <div v-for="(perms, category) in groupedPermissions" :key="category" class="permission-group">
      <div class="group-header">
        <ElIcon :size="16">
          <component :is="categoryIcons[category] || Check" />
        </ElIcon>
        <span>{{ categoryNames[category] || category }}</span>
      </div>

      <div class="permission-items">
        <div
          v-for="perm in perms"
          :key="perm.id"
          class="permission-item"
          :class="{ granted: perm.granted, required: perm.required }"
        >
          <div class="item-main">
            <div class="item-header">
              <span class="item-name">{{ perm.name }}</span>
              <ElTag v-if="perm.required" size="small" type="danger" effect="plain"> 必需 </ElTag>
              <ElTag :type="getRiskColor(perm.risk)" size="small" effect="light">
                {{ getRiskLabel(perm.risk) }}
              </ElTag>
            </div>
            <p class="item-desc">
              {{ perm.desc }}
            </p>
            <div v-if="perm.reason" class="item-reason">
              <ElIcon :size="12">
                <InfoFilled />
              </ElIcon>
              <span>{{ perm.reason }}</span>
            </div>
          </div>

          <div class="item-action">
            <ElTooltip
              v-if="perm.required && !perm.granted"
              content="此权限为必需权限"
              placement="top"
            >
              <ElIcon :size="18" class="required-icon">
                <Warning />
              </ElIcon>
            </ElTooltip>
            <ElIcon v-else-if="perm.granted" :size="18" class="granted-icon">
              <Check />
            </ElIcon>
            <ElSwitch
              v-if="!readonly"
              :model-value="perm.granted"
              :disabled="perm.required && perm.granted"
              size="small"
              @change="(val) => handleToggle(perm.id, Boolean(val))"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.permission-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.permission-group {
  .group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
  }
}

.permission-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.permission-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  border: 1px solid transparent;
  transition: all 0.2s;

  &.granted {
    background: var(--el-color-success-light-9);
    border-color: var(--el-color-success-light-7);
  }

  &.required:not(.granted) {
    background: var(--el-color-danger-light-9);
    border-color: var(--el-color-danger-light-7);
  }

  &:hover {
    border-color: var(--el-border-color);
  }
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.item-name {
  font-weight: 500;
  font-size: 14px;
}

.item-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.item-reason {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--el-color-info);

  svg {
    flex-shrink: 0;
    margin-top: 2px;
  }
}

.item-action {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  .required-icon {
    color: var(--el-color-danger);
  }

  .granted-icon {
    color: var(--el-color-success);
  }
}
</style>
