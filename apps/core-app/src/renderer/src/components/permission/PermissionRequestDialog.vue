<script setup lang="ts">
/**
 * Permission Request Dialog
 *
 * Shows when a plugin requests a permission at runtime.
 */

import { TxAlert, TxButton, TxModal } from '@talex-touch/tuffex'
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
      return 'var(--tx-color-success)'
    case 'medium':
      return 'var(--tx-color-warning)'
    case 'high':
      return 'var(--tx-color-danger)'
    default:
      return 'var(--tx-color-info)'
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

const iconClass = computed(() => {
  const category = props.permissionId.split('.')[0]
  switch (category) {
    case 'fs':
      return 'i-carbon-document'
    case 'clipboard':
      return 'i-carbon-document-copy'
    case 'network':
      return 'i-carbon-network-1'
    case 'system':
      return 'i-carbon-cpu'
    case 'intelligence':
      return 'i-carbon-currency-dollar'
    case 'storage':
      return 'i-carbon-application'
    case 'window':
      return 'i-carbon-monitor'
    default:
      return 'i-carbon-checkmark'
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
          <i :class="iconClass" class="text-2xl" />
        </div>
        <div class="permission-title">
          <h3>{{ pluginName }}</h3>
          <p>请求以下权限</p>
        </div>
      </div>

      <!-- Permission Info -->
      <div class="permission-info">
        <div class="permission-name">
          <i v-if="riskLevel === 'high'" class="i-carbon-warning risk-icon high text-lg" />
          <i
            v-else-if="riskLevel === 'medium'"
            class="i-carbon-information risk-icon medium text-lg"
          />
          <i v-else class="i-carbon-checkmark risk-icon low text-lg" />
          <span>{{ permissionName }}</span>
          <span class="risk-badge" :class="riskLevel">{{ riskLabel }}</span>
        </div>
        <p class="permission-desc">
          {{ permissionDesc }}
        </p>
      </div>

      <!-- Reason -->
      <TxAlert v-if="reason" type="info" :closable="false" class="permission-reason">
        <template #title>
          <span class="reason-label">插件说明：</span>
        </template>
        {{ reason }}
      </TxAlert>

      <!-- Warning for high risk -->
      <TxAlert v-if="riskLevel === 'high'" type="warning" :closable="false" class="risk-warning">
        此权限风险较高，请确认您信任此插件。
      </TxAlert>
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
  background: var(--tx-fill-color-light);
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
    color: var(--tx-text-color-secondary);
  }
}

.permission-info {
  background: var(--tx-fill-color-lighter);
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
      color: var(--tx-color-danger);
    }
    &.medium {
      color: var(--tx-color-warning);
    }
    &.low {
      color: var(--tx-color-success);
    }
  }

  .risk-badge {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: normal;

    &.high {
      background: var(--tx-color-danger-light-9);
      color: var(--tx-color-danger);
    }
    &.medium {
      background: var(--tx-color-warning-light-9);
      color: var(--tx-color-warning);
    }
    &.low {
      background: var(--tx-color-success-light-9);
      color: var(--tx-color-success);
    }
  }
}

.permission-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.permission-reason {
  :deep(.tx-alert__title) {
    font-weight: 500;
  }

  .reason-label {
    color: var(--tx-text-color-regular);
  }
}

.risk-warning {
  :deep(.tx-alert__message) {
    font-size: 13px;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
