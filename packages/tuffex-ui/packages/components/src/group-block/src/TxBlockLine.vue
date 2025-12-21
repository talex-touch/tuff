<script setup lang="ts">
/**
 * TxBlockLine Component
 *
 * A simple line item component for displaying title and description.
 * Supports link-style appearance for navigation items.
 *
 * @example
 * ```vue
 * <TxBlockLine title="Version" description="1.0.0" />
 * <TxBlockLine title="View Details" link @click="handleClick" />
 * ```
 *
 * @component
 */
import type { BlockLineProps, BlockLineEmits } from './types'

defineOptions({
  name: 'TxBlockLine',
})

const props = withDefaults(defineProps<BlockLineProps>(), {
  title: '',
  description: '',
  link: false,
})

const emit = defineEmits<BlockLineEmits>()

/**
 * Handles click events on the block line.
 * @param event - The mouse event
 */
function handleClick(event: MouseEvent): void {
  emit('click', event)
}
</script>

<template>
  <div
    class="tx-block-line"
    :class="{ 'tx-block-line--link': link }"
    role="button"
    :tabindex="link ? 0 : undefined"
    @click="handleClick"
    @keydown.enter="link && handleClick($event as unknown as MouseEvent)"
  >
    <span class="tx-block-line__title">{{ title }}</span>
    <div v-if="!link" class="tx-block-line__description">
      <slot name="description">{{ description }}</slot>
    </div>
  </div>
</template>

<style lang="scss">
.tx-block-line {
  position: relative;
  display: flex;
  padding: 6px 18px 2px 18px;
  height: 24px;
  background: var(--tx-fill-color-light, #f5f7fa);

  &__title {
    font-size: 14px;
    font-weight: 500;
    color: var(--tx-text-color-primary, #303133);
  }

  &__description {
    position: absolute;
    left: 120px;
    opacity: 0.5;
    font-size: 13px;
    color: var(--tx-text-color-secondary, #909399);
  }

  &--link {
    display: flex;
    align-items: center;
    padding: 1px 12px;
    font-size: 12px;
    color: var(--tx-color-primary-dark-2, #337ecc);
    cursor: pointer;

    .tx-block-line__title {
      position: relative;
      padding: 2px 6px;
      left: 32px;
      font-size: 13px;
      width: max-content;
      border-radius: 4px;
      transition: background-color 0.2s ease;
    }

    &:hover .tx-block-line__title {
      background-color: var(--tx-fill-color, #ebeef5);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary);
      outline-offset: -2px;
    }
  }
}
</style>
