<script setup lang="ts">
import type { TabBarEmits, TabBarProps, TabBarValue } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxTabBar' })

const props = withDefaults(defineProps<TabBarProps>(), {
  modelValue: '' as any,
  items: () => [],
  fixed: true,
  safeAreaBottom: true,
  disabled: false,
  zIndex: 2000,
})

const emit = defineEmits<TabBarEmits>()

const value = computed({
  get: () => props.modelValue,
  set: (v: TabBarValue) => {
    emit('update:modelValue', v)
    emit('change', v)
  },
})

const rootStyle = computed<Record<string, string>>(() => {
  return {
    '--tx-tab-bar-z-index': String(props.zIndex ?? 2000),
  }
})

function onPick(v: TabBarValue, disabled?: boolean) {
  if (props.disabled)
    return
  if (disabled)
    return
  value.value = v
}
</script>

<template>
  <nav
    class="tx-tab-bar"
    :class="{ 'is-fixed': fixed, 'is-disabled': disabled }"
    :style="rootStyle"
    role="tablist"
  >
    <div class="tx-tab-bar__inner">
      <button
        v-for="it in items"
        :key="String(it.value)"
        type="button"
        class="tx-tab-bar__item"
        :class="{ 'is-active': value === it.value, 'is-item-disabled': !!it.disabled }"
        :disabled="disabled || !!it.disabled"
        role="tab"
        :aria-selected="value === it.value"
        @click="onPick(it.value, it.disabled)"
      >
        <div class="tx-tab-bar__icon">
          <i v-if="it.iconClass" :class="it.iconClass" />
          <span v-if="it.badge != null && it.badge !== ''" class="tx-tab-bar__badge">{{ it.badge }}</span>
        </div>
        <div class="tx-tab-bar__label">
          {{ it.label }}
        </div>
      </button>
    </div>

    <div v-if="safeAreaBottom" class="tx-tab-bar__safe" aria-hidden="true" />
  </nav>
</template>

<style scoped lang="scss">
.tx-tab-bar {
  --tx-tab-bar-height: 56px;

  width: 100%;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 70%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 60%, transparent);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  z-index: var(--tx-tab-bar-z-index, 2000);

  &.is-fixed {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
  }

  &.is-disabled {
    opacity: 0.75;
  }
}

.tx-tab-bar__inner {
  height: var(--tx-tab-bar-height);
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  align-items: center;
}

.tx-tab-bar__item {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--tx-text-color-secondary, #909399);

  &.is-active {
    color: var(--tx-color-primary, #409eff);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.tx-tab-bar__icon {
  position: relative;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;

  i {
    font-size: 20px;
  }
}

.tx-tab-bar__badge {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--tx-color-danger, #f56c6c);
  color: #fff;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
}

.tx-tab-bar__label {
  font-size: 12px;
  line-height: 1.1;
}

.tx-tab-bar__safe {
  height: env(safe-area-inset-bottom, 0px);
}
</style>
