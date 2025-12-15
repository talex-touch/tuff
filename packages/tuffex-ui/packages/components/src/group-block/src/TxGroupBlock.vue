<script setup lang="ts">
/**
 * TxGroupBlock Component
 *
 * A collapsible group container for organizing related content.
 * Features smooth expand/collapse animations and customizable header.
 *
 * @example
 * ```vue
 * <TxGroupBlock name="Settings" icon="i-carbon-settings" description="Configure options">
 *   <TxBlockSwitch ... />
 *   <TxBlockSlot ... />
 * </TxGroupBlock>
 * ```
 *
 * @component
 */
import { ref, watch } from 'vue'
import type { GroupBlockProps, GroupBlockEmits } from './types'

defineOptions({
  name: 'TxGroupBlock',
})

const props = withDefaults(defineProps<GroupBlockProps>(), {
  icon: '',
  description: '',
  expandFill: false,
  shrink: false,
})

const emit = defineEmits<GroupBlockEmits>()

/**
 * Internal expanded state.
 */
const expand = ref(!props.shrink)

/**
 * Toggles the expanded state.
 */
function toggle(): void {
  expand.value = !expand.value
  emit('update:expanded', expand.value)
  emit('toggle')
}

watch(
  () => props.shrink,
  (newVal) => {
    expand.value = !newVal
  },
)
</script>

<template>
  <div class="tx-group-block" :class="{ 'tx-group-block--expanded': expand }">
    <!-- Header -->
    <div class="tx-group-block__header" role="button" tabindex="0" @click="toggle" @keydown.enter="toggle" @keydown.space.prevent="toggle">
      <div class="tx-group-block__content">
        <i v-if="icon" :class="icon" class="tx-group-block__icon" aria-hidden="true" />
        <div class="tx-group-block__label">
          <h3 class="tx-group-block__name">{{ name }}</h3>
          <p v-if="description" class="tx-group-block__description">{{ description }}</p>
        </div>
      </div>
      <div class="tx-group-block__toggle" :class="expand ? 'i-ri-subtract-line' : 'i-ri-add-fill'" aria-hidden="true" />
    </div>

    <!-- Content -->
    <div class="tx-group-block__body">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.tx-group-block {
  --tx-group-block-radius: 12px;
  --tx-group-block-transition: 0.35s cubic-bezier(0.4, 0, 0.2, 1);

  position: relative;
  width: 100%;
  margin-bottom: 0.7rem;
  max-height: 56px;
  overflow: hidden;
  border-radius: var(--tx-group-block-radius);
  transition: max-height var(--tx-group-block-transition);

  &--expanded {
    max-height: 1000px;
    transition: max-height 1.5s cubic-bezier(0.39, 0.575, 0.565, 1);
  }

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 12px;
    width: 100%;
    height: 56px;
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
    background: var(--el-fill-color-dark, #f5f7fa);
    border-bottom: 1px solid var(--el-border-color-lighter, #eee);
    transition: background-color 0.25s ease;

    &:hover {
      background: var(--el-fill-color, #f0f2f5);
    }

    &:focus-visible {
      outline: 2px solid var(--el-color-primary);
      outline-offset: -2px;
    }
  }

  &__content {
    display: flex;
    align-items: center;
    height: 100%;
    gap: 12px;
  }

  &__icon {
    font-size: 24px;
    color: var(--el-text-color-primary, #303133);
  }

  &__label {
    flex: 1;
  }

  &__name {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    color: var(--el-text-color-primary, #303133);
  }

  &__description {
    margin: 0;
    font-size: 12px;
    font-weight: 400;
    opacity: 0.5;
    color: var(--el-text-color-secondary, #909399);
  }

  &__toggle {
    margin-right: 10px;
    font-size: 16px;
    color: var(--el-text-color-secondary, #909399);
    transition: transform 0.25s ease;
  }

  &__body {
    border-bottom: 1px solid var(--el-border-color, #dcdfe6);
  }
}
</style>
