<script setup lang="ts">
import type { CollapseContext } from './types'
import { computed, inject } from 'vue'
import { TxIcon } from '../../icon'

interface Props {
  title?: string
  name?: string
  disabled?: boolean
  arrowIcon?: string
}

const props = withDefaults(defineProps<Props>(), {
  arrowIcon: 'chevron-down',
})

const collapse = inject<CollapseContext>('collapse')

const itemName = computed(() => props.name || props.title || '')

const isActive = computed(() => {
  return collapse?.activeNames.value.includes(itemName.value) || false
})

function handleHeaderClick() {
  if (props.disabled || !collapse)
    return
  collapse.handleItemClick(itemName.value)
}
</script>

<template>
  <div class="tx-collapse-item">
    <div
      class="tx-collapse-item__header"
      :class="{ 'tx-collapse-item__header--active': isActive }"
      @click="handleHeaderClick"
    >
      <TxIcon
        :name="arrowIcon"
        class="tx-collapse-item__arrow"
        :class="{ 'tx-collapse-item__arrow--active': isActive }"
      />
      <slot name="title">
        {{ title }}
      </slot>
    </div>

    <Transition name="tx-collapse">
      <div v-show="isActive" class="tx-collapse-item__content">
        <div class="tx-collapse-item__content-inner">
          <slot />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tx-collapse-item {
  border-bottom: 1px solid var(--tx-collapse-border, #e5e7eb);
}

.tx-collapse-item:last-child {
  border-bottom: none;
}

.tx-collapse-item__header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  background: var(--tx-collapse-header-bg, #ffffff);
  color: var(--tx-collapse-header-text, #374151);
  font-weight: 500;
  transition: background-color 0.2s;
}

.tx-collapse-item__header:hover:not(.tx-collapse-item__header--active) {
  background: var(--tx-collapse-header-hover-bg, #f9fafb);
}

.tx-collapse-item__header--active {
  background: var(--tx-collapse-header-active-bg, #f3f4f6);
  color: var(--tx-collapse-header-active-text, #111827);
}

.tx-collapse-item__arrow {
  margin-right: 8px;
  transition: transform 0.3s;
  font-size: 16px;
  color: var(--tx-collapse-arrow, #6b7280);
}

.tx-collapse-item__arrow--active {
  transform: rotate(180deg);
}

.tx-collapse-item__content {
  overflow: hidden;
}

.tx-collapse-item__content-inner {
  padding: 16px;
  color: var(--tx-collapse-content-text, #6b7280);
  line-height: 1.6;
}

/* Transition animations */
.tx-collapse-enter-active,
.tx-collapse-leave-active {
  transition: height 0.3s ease-in-out;
}

.tx-collapse-enter-from,
.tx-collapse-leave-to {
  height: 0 !important;
}
</style>
