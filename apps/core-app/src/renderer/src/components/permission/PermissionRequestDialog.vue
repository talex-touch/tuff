<script setup lang="ts">
/**
 * Permission Request Dialog
 *
 * Shows when a plugin requests a permission at runtime.
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
import { TxButton, TxModal } from '@talex-touch/tuffex'
import { ElAlert, ElIcon } from 'element-plus'
import { computed, ref } from 'vue'

interface Props {
  visible: boolean
  pluginId: string
  pluginName: string
  permissionId: string
  permissionName: string
  permissionDesc: string
  riskLevel: 'low' | 'medium' | 'high'
  reason?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'allow-once'): void
  (e: 'allow-always'): void
  (e: 'deny'): void
}>()

const allowClose = ref(false)
const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => {
    if (!val && !allowClose.value) return
    emit('update:visible', val)
    if (!val) {
      allowClose.value = false
    }
  }
})

const riskColor = computed(() => {
  switch (props.riskLevel) {
    case 'low':
      return 'var(--el-color-success)'
    case 'medium':
      return 'var(--el-color-warning)'
    case 'high':
      return 'var(--el-color-danger)'
    default:
      return 'var(--el-color-info)'
  }
})

const riskLabel = computed(() => {
  switch (props.riskLevel) {
    case 'low':
      return '低风险'
    case 'medium':
      return '中风险'
    case 'high':
      return '高风险'
    default:
      return '未知风险'
  }
})

const iconComponent = computed(() => {
  const category = props.permissionId.split('.')[0]
  switch (category) {
    case 'fs':
      return Document
    case 'clipboard':
      return DocumentCopy
    case 'network':
      return Connection
    case 'system':
      return Cpu
    case 'intelligence':
      return Coin
    case 'storage':
      return Platform
    case 'window':
      return Monitor
    default:
      return Check
  }
})

function handleAllowOnce() {
  emit('allow-once')
  requestClose()
}

function handleAllowAlways() {
  emit('allow-always')
  requestClose()
}

function handleDeny() {
  emit('deny')
  requestClose()
}

function requestClose() {
  allowClose.value = true
  dialogVisible.value = false
}
</script>

<template>
  <TxModal v-model="dialogVisible" title="权限请求" width="420px" class="permission-dialog">
    <div class="permission-content">
      <!-- Header -->
      <div class="permission-header">
        <div class="permission-icon" :style="{ color: riskColor }">
          <ElIcon :size="32">
            <component :is="iconComponent" />
          </ElIcon>
        </div>
        <div class="permission-title">
          <h3>{{ pluginName }}</h3>
          <p>请求以下权限</p>
        </div>
      </div>

      <!-- Permission Info -->
      <div class="permission-info">
        <div class="permission-name">
          <ElIcon v-if="riskLevel === 'high'" :size="18" class="risk-icon high">
            <Warning />
          </ElIcon>
          <ElIcon v-else-if="riskLevel === 'medium'" :size="18" class="risk-icon medium">
            <InfoFilled />
          </ElIcon>
          <ElIcon v-else :size="18" class="risk-icon low">
            <Check />
          </ElIcon>
          <span>{{ permissionName }}</span>
          <span class="risk-badge" :class="riskLevel">{{ riskLabel }}</span>
        </div>
        <p class="permission-desc">
          {{ permissionDesc }}
        </p>
      </div>

      <!-- Reason -->
      <ElAlert v-if="reason" type="info" :closable="false" class="permission-reason">
        <template #title>
          <span class="reason-label">插件说明：</span>
        </template>
        {{ reason }}
      </ElAlert>

      <!-- Warning for high risk -->
      <ElAlert v-if="riskLevel === 'high'" type="warning" :closable="false" class="risk-warning">
        此权限风险较高，请确认您信任此插件。
      </ElAlert>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <TxButton @click="handleDeny"> 拒绝 </TxButton>
        <TxButton type="primary" plain @click="handleAllowOnce"> 仅本次 </TxButton>
        <TxButton type="primary" @click="handleAllowAlways"> 始终允许 </TxButton>
      </div>
    </template>
  </TxModal>
</template>

<style scoped lang="scss">
.permission-dialog {
  :deep(.tx-modal__body) {
    padding: 16px 20px;
  }

  :deep(.tx-modal__close) {
    display: none;
  }
}

.permission-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.permission-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.permission-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  border-radius: 12px;
}

.permission-title {
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  p {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
}

.permission-info {
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 12px;
}

.permission-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;

  .risk-icon {
    &.high {
      color: var(--el-color-danger);
    }
    &.medium {
      color: var(--el-color-warning);
    }
    &.low {
      color: var(--el-color-success);
    }
  }

  .risk-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: normal;

    &.high {
      background: var(--el-color-danger-light-9);
      color: var(--el-color-danger);
    }
    &.medium {
      background: var(--el-color-warning-light-9);
      color: var(--el-color-warning);
    }
    &.low {
      background: var(--el-color-success-light-9);
      color: var(--el-color-success);
    }
  }
}

.permission-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.permission-reason {
  :deep(.el-alert__title) {
    font-weight: 500;
  }

  .reason-label {
    color: var(--el-text-color-regular);
  }
}

.risk-warning {
  :deep(.el-alert__content) {
    font-size: 13px;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
