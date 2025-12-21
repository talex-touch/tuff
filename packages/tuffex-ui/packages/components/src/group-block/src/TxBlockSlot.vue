<script setup lang="ts">
/**
 * TxBlockSlot Component
 *
 * A block container with icon, title, description, and a slot for custom content.
 * Ideal for settings rows with custom controls.
 *
 * @example
 * ```vue
 * <TxBlockSlot title="Theme" description="Choose your preferred theme" icon="i-carbon-color-palette">
 *   <select>...</select>
 * </TxBlockSlot>
 * ```
 *
 * @component
 */
import type { BlockSlotProps, BlockSlotEmits } from './types'

defineOptions({
  name: 'TxBlockSlot',
})

const props = withDefaults(defineProps<BlockSlotProps>(), {
  disabled: false,
})

const emit = defineEmits<BlockSlotEmits>()

/**
 * Handles click events on the block slot.
 * @param event - The mouse event
 */
function handleClick(event: MouseEvent): void {
  if (!props.disabled) {
    emit('click', event)
  }
}
</script>

<template>
  <div
    class="tx-block-slot"
    :class="{ 'tx-block-slot--disabled': disabled }"
    @click="handleClick"
  >
    <div class="tx-block-slot__content">
      <i v-if="icon" :class="icon" class="tx-block-slot__icon" aria-hidden="true" />
      <div class="tx-block-slot__label">
        <slot name="label">
          <h3 class="tx-block-slot__title">{{ title }}</h3>
          <p class="tx-block-slot__description">{{ description }}</p>
        </slot>
      </div>
    </div>
    <div class="tx-block-slot__slot">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.tx-block-slot {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 4px 16px;
  width: 100%;
  height: 56px;
  user-select: none;
  border-radius: 4px;
  box-sizing: border-box;
  background: var(--tx-fill-color-light, #f5f7fa);
  transition: background-color 0.25s ease;

  &:hover {
    background: var(--tx-fill-color, #f0f2f5);
  }

  &--disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  &__content {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    cursor: pointer;
    gap: 16px;
  }

  &__icon {
    font-size: 24px;
    color: var(--tx-text-color-primary, #303133);
  }

  &__label {
    flex: 1;
  }

  &__title {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--tx-text-color-primary, #303133);
  }

  &__description {
    margin: 0;
    font-size: 12px;
    font-weight: 400;
    opacity: 0.5;
    color: var(--tx-text-color-secondary, #909399);
  }

  &__slot {
    display: flex;
    align-items: center;
  }
}
</style>
