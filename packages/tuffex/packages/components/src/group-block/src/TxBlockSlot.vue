<script setup lang="ts">
/**
 * TxBlockSlot Component
 *
 * A block container with icon, title, description, and a slot for custom content.
 * Ideal for settings rows with custom controls.
 *
 * @example
 * ```vue
 * <TxBlockSlot
 *   title="Theme"
 *   description="Choose your preferred theme"
 *   default-icon="i-carbon-color-palette"
 * >
 *   <select>...</select>
 * </TxBlockSlot>
 * ```
 *
 * @component
 */
import type { TxIconSource } from '../../icon'
import type { BlockSlotEmits, BlockSlotProps } from './types'
import { computed } from 'vue'
import { TuffIcon } from '../../icon'

defineOptions({
  name: 'TxBlockSlot',
})

type IconValue = TxIconSource | string | null | undefined

const props = withDefaults(defineProps<BlockSlotProps>(), {
  title: '',
  description: '',
  iconSize: 20,
  disabled: false,
  active: false,
})

const emit = defineEmits<BlockSlotEmits>()

/**
 * Handles click events on the block slot.
 * @param event - The mouse event
 */
function handleClick(event: MouseEvent): void {
  if (props.disabled)
    return
  emit('click', event)
}

function toIcon(icon?: IconValue): TxIconSource | null {
  if (!icon)
    return null
  if (typeof icon === 'string')
    return { type: 'class', value: icon }
  return icon
}

const defaultIcon = computed(() => {
  if (props.defaultIcon !== undefined)
    return toIcon(props.defaultIcon)
  return toIcon(props.icon)
})

const activeIcon = computed(() => {
  if (props.activeIcon !== undefined)
    return toIcon(props.activeIcon)
  return null
})

const currentIcon = computed(() => {
  if (props.active)
    return activeIcon.value ?? defaultIcon.value
  return defaultIcon.value ?? activeIcon.value
})
</script>

<template>
  <div
    class="tx-block-slot TBlockSlot-Container TBlockSelection fake-background index-fix"
    :class="{ 'tx-block-slot--disabled': disabled, disabled }"
    @click="handleClick"
  >
    <div class="tx-block-slot__content TBlockSlot-Content TBlockSelection-Content">
      <slot name="icon" :active="active">
        <TuffIcon v-if="currentIcon" :icon="currentIcon" :size="iconSize" />
      </slot>
      <div class="tx-block-slot__label TBlockSlot-Label TBlockSelection-Label">
        <template v-if="$slots.label">
          <slot name="label" />
          <div v-if="$slots.tags" class="tx-block-slot__tags tx-block-slot__tags--after">
            <slot name="tags" />
          </div>
        </template>
        <template v-else>
          <div class="tx-block-slot__title-row">
            <h5 class="tx-block-slot__title">
              {{ title }}
            </h5>
            <div v-if="$slots.tags" class="tx-block-slot__tags">
              <slot name="tags" />
            </div>
          </div>
          <p class="tx-block-slot__description">
            {{ description }}
          </p>
        </template>
      </div>
    </div>
    <div class="tx-block-slot__slot TBlockSlot-Slot TBlockSelection-Func">
      <slot :active="active" />
    </div>
  </div>
</template>

<style lang="scss">
.tx-block-slot,
.TBlockSlot-Container {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding: 4px 16px;
  width: 100%;
  height: 56px;
  user-select: none;
  border-radius: 12px;
  box-sizing: border-box;
  --fake-color: var(--tx-fill-color-darker, #ebeef5);
  --fake-radius: 12px;
  --fake-opacity: 0.5;

  .tx-block-slot__content {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    cursor: pointer;

    > * {
      margin-right: 16px;
      font-size: 24px;
    }

    > .tx-block-slot__label {
      flex: 1;
    }

    .tx-block-slot__title {
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      color: var(--tx-text-color-primary, #303133);
    }

    .tx-block-slot__description {
      margin: 2px 0 0;
      font-size: 12px;
      font-weight: 400;
      opacity: 0.5;
      color: var(--tx-text-color-secondary, #909399);
    }
  }

  .tx-block-slot__title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    width: 100%;
  }

  .tx-block-slot__tags {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    flex: 0 0 auto;
    max-width: 100%;
    align-self: flex-start;
    height: auto;
  }

  .tx-block-slot__tags--after {
    margin-top: 4px;
  }

  .tx-block-slot__slot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-left: auto;
    flex-shrink: 0;
    gap: 8px;
  }
}

.tx-block-slot:hover,
.TBlockSlot-Container:hover {
  --fake-color: var(--tx-fill-color, #f0f2f5);
}

.tx-block-slot--disabled,
.TBlockSlot-Container--disabled,
.tx-block-slot.disabled,
.TBlockSlot-Container.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.touch-blur .tx-block-slot,
.touch-blur .TBlockSlot-Container {
  --fake-color: var(--tx-fill-color, #f0f2f5);

}

.touch-blur .tx-block-slot:hover,
.touch-blur .TBlockSlot-Container:hover {
  --fake-color: var(--tx-fill-color-darker, #ebeef5);
}
</style>
