<script setup lang="ts">
/**
 * Permission Status Card
 *
 * Shows permission summary for a plugin.
 */

import { computed } from 'vue'
import { ElCard, ElButton, ElProgress, ElAlert, ElTag, ElIcon } from 'element-plus'
import { Check, Warning, InfoFilled, Close } from '@element-plus/icons-vue'

interface Props {
  pluginId: string
  pluginName: string
  sdkapi?: number
  enforcePermissions: boolean
  requiredCount: number
  optionalCount: number
  grantedCount: number
  missingRequired: string[]
  warning?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'manage'): void
  (e: 'grant-all'): void
}>()

const totalDeclared = computed(() => props.requiredCount + props.optionalCount)

const grantProgress = computed(() => {
  if (totalDeclared.value === 0) return 100
  return Math.round((props.grantedCount / totalDeclared.value) * 100)
})

const statusType = computed(() => {
  if (!props.enforcePermissions) return 'warning'
  if (props.missingRequired.length > 0) return 'danger'
  if (props.grantedCount < totalDeclared.value) return 'warning'
  return 'success'
})

const statusIcon = computed(() => {
  if (!props.enforcePermissions) return Close
  if (props.missingRequired.length > 0) return Warning
  if (props.grantedCount < totalDeclared.value) return InfoFilled
  return Check
})

const statusText = computed(() => {
  if (!props.enforcePermissions) return '权限校验已跳过'
  if (props.missingRequired.length > 0) return `缺少 ${props.missingRequired.length} 个必需权限`
  if (props.grantedCount < totalDeclared.value) return '部分权限未授予'
  return '所有权限已授予'
})

const progressColor = computed(() => {
  switch (statusType.value) {
    case 'danger':
      return 'var(--el-color-danger)'
    case 'warning':
      return 'var(--el-color-warning)'
    case 'success':
      return 'var(--el-color-success)'
    default:
      return 'var(--el-color-primary)'
  }
})
</script>

<template>
  <ElCard class="permission-status-card" shadow="never">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <ElIcon
            :size="20"
            :class="['status-icon', statusType]"
          ><component :is="statusIcon" /></ElIcon>
          <span class="header-title">权限状态</span>
        </div>
        <ElButton size="small" @click="emit('manage')">
          管理权限
        </ElButton>
      </div>
    </template>

    <div class="card-content">
      <!-- Legacy SDK Warning -->
      <ElAlert
        v-if="warning && !enforcePermissions"
        type="warning"
        :closable="false"
        class="legacy-warning"
      >
        <template #title>
          <div class="warning-title">
            <ElIcon :size="16"><Warning /></ElIcon>
            <span>旧版 SDK</span>
          </div>
        </template>
        {{ warning }}
      </ElAlert>

      <!-- Status Summary -->
      <div class="status-summary">
        <div class="status-text" :class="statusType">
          {{ statusText }}
        </div>

        <div class="permission-stats">
          <ElTag type="danger" effect="light" size="small">
            必需: {{ requiredCount }}
          </ElTag>
          <ElTag type="info" effect="light" size="small">
            可选: {{ optionalCount }}
          </ElTag>
          <ElTag type="success" effect="light" size="small">
            已授予: {{ grantedCount }}
          </ElTag>
        </div>
      </div>

      <!-- Progress -->
      <div v-if="enforcePermissions && totalDeclared > 0" class="progress-section">
        <ElProgress
          :percentage="grantProgress"
          :stroke-width="8"
          :color="progressColor"
          :show-text="false"
        />
        <span class="progress-text">{{ grantedCount }} / {{ totalDeclared }}</span>
      </div>

      <!-- Missing Required -->
      <div v-if="missingRequired.length > 0" class="missing-section">
        <div class="missing-title">
          <ElIcon :size="14"><Warning /></ElIcon>
          <span>缺少必需权限：</span>
        </div>
        <div class="missing-list">
          <ElTag
            v-for="perm in missingRequired"
            :key="perm"
            type="danger"
            effect="plain"
            size="small"
          >
            {{ perm }}
          </ElTag>
        </div>
        <ElButton
          type="primary"
          size="small"
          class="grant-all-btn"
          @click="emit('grant-all')"
        >
          授予全部必需权限
        </ElButton>
      </div>
    </div>
  </ElCard>
</template>

<style scoped lang="scss">
.permission-status-card {
  :deep(.el-card__header) {
    padding: 12px 16px;
  }

  :deep(.el-card__body) {
    padding: 16px;
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-icon {
  &.success {
    color: var(--el-color-success);
  }
  &.warning {
    color: var(--el-color-warning);
  }
  &.danger {
    color: var(--el-color-danger);
  }
}

.header-title {
  font-weight: 500;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.legacy-warning {
  .warning-title {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.status-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-text {
  font-weight: 500;

  &.success {
    color: var(--el-color-success);
  }
  &.warning {
    color: var(--el-color-warning);
  }
  &.danger {
    color: var(--el-color-danger);
  }
}

.permission-stats {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.progress-section {
  display: flex;
  align-items: center;
  gap: 12px;

  .el-progress {
    flex: 1;
  }

  .progress-text {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
  }
}

.missing-section {
  background: var(--el-color-danger-light-9);
  border-radius: 8px;
  padding: 12px;
}

.missing-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--el-color-danger);
  margin-bottom: 8px;
}

.missing-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.grant-all-btn {
  width: 100%;
}
</style>
