<script setup lang="ts">
/**
 * Permission Status Card
 *
 * Shows permission summary for a plugin.
 */

import { TuffProgress, TxButton, TxCard, TxTag } from '@talex-touch/tuffex'
import { ElAlert } from 'element-plus'
import { computed } from 'vue'

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

const statusIcon = computed((): string => {
  if (!props.enforcePermissions) return 'i-carbon-close'
  if (props.missingRequired.length > 0) return 'i-carbon-warning'
  if (props.grantedCount < totalDeclared.value) return 'i-carbon-information'
  return 'i-carbon-checkmark'
})

const statusText = computed(() => {
  if (!props.enforcePermissions) return '权限校验已跳过'
  if (props.missingRequired.length > 0) return `缺少 ${props.missingRequired.length} 个必需权限`
  if (props.grantedCount < totalDeclared.value) return '部分权限未授予'
  return '所有权限已授予'
})

const progressStatus = computed(() => {
  if (statusType.value === 'danger') return 'error'
  if (statusType.value === 'warning') return 'warning'
  if (statusType.value === 'success') return 'success'
  return ''
})
</script>

<template>
  <TxCard class="permission-status-card" shadow="none">
    <template #header>
      <div class="card-header">
        <div class="header-left">
          <i :class="[statusIcon, statusType]" class="status-icon text-lg" />
          <span class="header-title">权限状态</span>
        </div>
        <TxButton size="small" @click="emit('manage')"> 管理权限 </TxButton>
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
            <i class="i-carbon-warning text-base" />
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
          <TxTag color="var(--tx-color-danger)" size="sm"> 必需: {{ requiredCount }} </TxTag>
          <TxTag color="var(--tx-color-info)" size="sm"> 可选: {{ optionalCount }} </TxTag>
          <TxTag color="var(--tx-color-success)" size="sm"> 已授予: {{ grantedCount }} </TxTag>
        </div>
      </div>

      <!-- Progress -->
      <div v-if="enforcePermissions && totalDeclared > 0" class="progress-section">
        <TuffProgress
          :percentage="grantProgress"
          :stroke-width="8"
          :status="progressStatus"
          :show-text="false"
        />
        <span class="progress-text">{{ grantedCount }} / {{ totalDeclared }}</span>
      </div>

      <!-- Missing Required -->
      <div v-if="missingRequired.length > 0" class="missing-section">
        <div class="missing-title">
          <i class="i-carbon-warning text-sm" />
          <span>缺少必需权限：</span>
        </div>
        <div class="missing-list">
          <TxTag
            v-for="perm in missingRequired"
            :key="perm"
            color="var(--tx-color-danger)"
            size="sm"
          >
            {{ perm }}
          </TxTag>
        </div>
        <TxButton type="primary" size="small" class="grant-all-btn" @click="emit('grant-all')">
          授予全部必需权限
        </TxButton>
      </div>
    </div>
  </TxCard>
</template>

<style scoped lang="scss">
.permission-status-card {
  :deep(.tx-card__header) {
    padding: 12px 16px;
  }

  :deep(.tx-card__body) {
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
