<script setup lang="ts">
import { computed } from 'vue'
import { dismissToast, toastStore } from '../../../../utils/toast'

defineOptions({
  name: 'TxToastHost',
})

const items = computed(() => toastStore.items)
const zIndex = computed(() => toastStore.zIndex)
</script>

<template>
  <teleport to="body">
    <div class="tx-toast-host" role="region" aria-label="Notifications" :style="{ zIndex }">
      <div v-for="t in items" :key="t.id" class="tx-toast" :class="`tx-toast--${t.variant || 'default'}`">
        <div class="tx-toast__content">
          <div v-if="t.title" class="tx-toast__title">
            {{ t.title }}
          </div>
          <div v-if="t.description" class="tx-toast__desc">
            {{ t.description }}
          </div>
        </div>
        <button class="tx-toast__close" type="button" @click="dismissToast(t.id)">
          <i class="i-carbon-close" />
        </button>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
@keyframes tx-toast-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.tx-toast-host {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(360px, calc(100vw - 32px));
}

.tx-toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 12px;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  background: color-mix(in srgb, var(--tx-bg-color, #fff) 88%, transparent);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  box-shadow: var(--tx-box-shadow-light, 0px 0px 12px rgba(0, 0, 0, 0.12));
  animation: tx-toast-in 0.16s ease-out;
}

.tx-toast__content {
  flex: 1;
  min-width: 0;
}

.tx-toast__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
  line-height: 1.2;
}

.tx-toast__desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
  line-height: 1.3;
  word-break: break-word;
}

.tx-toast__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--tx-text-color-secondary, #909399);
  cursor: pointer;

  &:hover {
    background: color-mix(in srgb, var(--tx-fill-color-light, #f5f7fa) 70%, transparent);
  }
}

.tx-toast--success {
  border-color: color-mix(in srgb, var(--tx-color-success, #67c23a) 35%, transparent);
}

.tx-toast--warning {
  border-color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 35%, transparent);
}

.tx-toast--danger {
  border-color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 35%, transparent);
}
</style>
