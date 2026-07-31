<script setup lang="ts">
import type { CollapseContext } from './types'
import { computed, inject, useId } from 'vue'
import { TxIcon } from '../../icon'

defineOptions({ name: 'TxCollapseItem' })

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
const contentId = useId()

const itemName = computed(() => props.name || props.title || '')

const isActive = computed(() => {
  return collapse?.activeNames.value.includes(itemName.value) || false
})

function handleHeaderClick() {
  if (props.disabled || !collapse)
    return
  collapse.handleItemClick(itemName.value)
}

// CSS cannot tween height:0 ↔ height:auto, so drive the disclosure height in JS:
// grow from 0 to the measured content height, then release to auto (and reverse).
function onEnter(el: Element) {
  const node = el as HTMLElement
  node.style.height = '0px'
  void node.offsetHeight
  node.style.height = `${node.scrollHeight}px`
}

function onAfterEnter(el: Element) {
  ;(el as HTMLElement).style.height = ''
}

function onLeave(el: Element) {
  const node = el as HTMLElement
  node.style.height = `${node.scrollHeight}px`
  void node.offsetHeight
  node.style.height = '0px'
}

function onAfterLeave(el: Element) {
  ;(el as HTMLElement).style.height = ''
}
</script>

<template>
  <div class="tx-collapse-item">
    <button
      type="button"
      class="tx-collapse-item__header"
      :class="{
        'tx-collapse-item__header--active': isActive,
        'tx-collapse-item__header--disabled': disabled,
      }"
      :disabled="disabled"
      :aria-expanded="isActive"
      :aria-controls="contentId"
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
    </button>

    <Transition
      name="tx-collapse"
      @enter="onEnter"
      @after-enter="onAfterEnter"
      @leave="onLeave"
      @after-leave="onAfterLeave"
    >
      <div
        v-show="isActive"
        :id="contentId"
        class="tx-collapse-item__content"
      >
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
  appearance: none;
  display: flex;
  align-items: center;
  width: 100%;
  padding: 12px 16px;
  border: 0;
  cursor: pointer;
  font: inherit;
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

.tx-collapse-item__header--disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

/* Height is animated in JS (@enter/@leave); CSS cannot tween 0 ↔ auto. */
.tx-collapse-enter-active,
.tx-collapse-leave-active {
  overflow: hidden;
  transition: height 0.3s ease-in-out;
}
</style>
