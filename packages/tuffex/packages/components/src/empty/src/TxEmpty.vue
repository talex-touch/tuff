<script setup lang="ts">
import type { EmptyProps } from './types'

defineOptions({ name: 'TxEmpty' })

const props = withDefaults(defineProps<EmptyProps>(), {
  title: 'Nothing here',
  description: '',
  iconClass: 'i-carbon-incomplete',
  compact: false,
})
</script>

<template>
  <div class="tx-empty" :class="{ 'tx-empty--compact': compact }">
    <div class="tx-empty__icon">
      <slot name="icon">
        <i :class="iconClass" aria-hidden="true" />
      </slot>
    </div>

    <div class="tx-empty__content">
      <div class="tx-empty__title">
        <slot name="title">{{ title }}</slot>
      </div>
      <div v-if="description || $slots.description" class="tx-empty__desc">
        <slot name="description">{{ description }}</slot>
      </div>

      <div v-if="$slots.action" class="tx-empty__action">
        <slot name="action" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.tx-empty {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border-radius: 14px;
  border: 1px solid var(--tx-border-color-lighter, #ebeef5);
  background: var(--tx-fill-color-lighter, #fafafa);
  box-sizing: border-box;
}

.tx-empty--compact {
  padding: 16px;
}

.tx-empty__icon {
  font-size: 34px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-empty__content {
  margin-top: 10px;
  text-align: center;
}

.tx-empty__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.tx-empty__desc {
  margin-top: 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-empty__action {
  margin-top: 12px;
}
</style>
