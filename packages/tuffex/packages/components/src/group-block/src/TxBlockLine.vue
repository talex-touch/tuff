<script setup lang="ts">
/**
 * TxBlockLine Component
 *
 * A simple line item component for displaying title and description.
 * Supports link-style appearance for navigation items.
 */
import type { BlockLineEmits, BlockLineProps } from './types'

defineOptions({
  name: 'TxBlockLine',
})

const props = withDefaults(defineProps<BlockLineProps>(), {
  title: '',
  description: '',
  link: false,
})

const emit = defineEmits<BlockLineEmits>()

function handleClick(event: MouseEvent): void {
  if (!props.link)
    return
  emit('click', event)
}
</script>

<template>
  <div
    class="tx-block-line TBlockLine-Container fake-background index-fix"
    :class="{ 'tx-block-line--link': link, link }"
    role="button"
    :tabindex="link ? 0 : undefined"
    @click="handleClick"
    @keydown.enter="link && handleClick($event as unknown as MouseEvent)"
  >
    <span class="tx-block-line__title TBlockLine-Title">{{ title }}</span>
    <div v-if="!link" class="tx-block-line__description TBlockLine-Description">
      <slot name="description">
        {{ description }}
      </slot>
    </div>
    <div v-else class="tx-block-line__link-slot TBlockLine-LinkSlot">
      <slot name="description" />
    </div>
  </div>
</template>

<style lang="scss">
.tx-block-line,
.TBlockLine-Container {
  position: relative;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 2px 18px 2px 50px;
  min-height: 24px;
  border-radius: 12px;
  --fake-color: var(--tx-fill-color, #f0f2f5);
  --fake-opacity: 0.45;

  .tx-block-line__title {
    width: 120px;
    font-size: 13px;
    font-weight: 600;
    color: var(--tx-text-color-secondary, #909399);
  }

  .tx-block-line__description {
    flex: 1;
    font-size: 13px;
    line-height: 1.4;
    white-space: pre-line;
    color: var(--tx-text-color-secondary, #909399);
  }

  .tx-block-line__link-slot {
    font-size: 13px;
    font-weight: 600;
    color: var(--tx-color-primary, #409eff);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  &.link,
  &--link {
    cursor: pointer;
    padding-top: 2px;
    padding-bottom: 2px;
    --fake-color: var(--tx-fill-color, #f0f2f5);
    --fake-opacity: 0.4;

    .tx-block-line__title {
      width: auto;
      min-width: 120px;
      opacity: 0.7;
      color: var(--tx-text-color-primary, #303133);
    }

    .tx-block-line__link-slot {
      color: var(--tx-color-primary, #409eff);
      text-decoration-color: var(--tx-color-primary, #409eff);
    }

    &:focus-visible {
      outline: 2px solid var(--tx-color-primary);
      outline-offset: -2px;
    }

    &:hover {
      text-decoration: underline;
      --fake-inner-opacity: 0.75;
    }
  }
}
</style>
