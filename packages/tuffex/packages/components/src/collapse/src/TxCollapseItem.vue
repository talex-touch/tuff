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
    <!--
      The chevron trails the title: a disclosure row reads title first and
      state last, and a leading chevron made every row start with the same
      glyph before the eye reached the words.
    -->
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
      <span class="tx-collapse-item__title">
        <slot name="title">
          {{ title }}
        </slot>
      </span>
      <TxIcon
        :name="arrowIcon"
        class="tx-collapse-item__arrow"
        :class="{ 'tx-collapse-item__arrow--active': isActive }"
        aria-hidden="true"
      />
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

<style lang="scss" scoped>
// Hairlines between rows, none at the frame's edges — the frame draws its own rim.
.tx-collapse-item + .tx-collapse-item {
  border-top: 1px solid var(--tx-collapse-border, color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 55%, transparent));
}

.tx-collapse-item__header {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 9px 12px 9px 14px;
  border: 0;
  border-radius: 0;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.45;
  text-align: left;
  user-select: none;
  background: var(--tx-collapse-header-bg, var(--tx-bg-color-overlay, #ffffff));
  color: var(--tx-collapse-header-text, var(--tx-text-color-primary, #374151));
  outline: none;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

// Corner nesting. The frame clips its children with `overflow: hidden`, so a
// square header at the frame's corners had its hover fill and focus ring cut
// off at an angle the frame's radius did not share. The first header and a
// collapsed last header take the frame's radius less its 1px border instead,
// so anything drawn on them follows the frame. An open last header ends in
// its content, not the frame, so it stays square.
.tx-collapse-item:first-child .tx-collapse-item__header {
  border-top-left-radius: calc(var(--tx-collapse-radius, 12px) - 1px);
  border-top-right-radius: calc(var(--tx-collapse-radius, 12px) - 1px);
}

.tx-collapse-item:last-child .tx-collapse-item__header:not(.tx-collapse-item__header--active) {
  border-bottom-left-radius: calc(var(--tx-collapse-radius, 12px) - 1px);
  border-bottom-right-radius: calc(var(--tx-collapse-radius, 12px) - 1px);
}

// Hover is a soft veil of the text ink, the same language as the menu rows.
.tx-collapse-item__header:hover:not(.tx-collapse-item__header--active):not(.tx-collapse-item__header--disabled) {
  background: var(--tx-collapse-header-hover-bg, color-mix(in srgb, var(--tx-text-color-primary, #111827) 5%, transparent));
}

// Open: a half-strength tint of the fill token, so the open row is marked without becoming a slab.
.tx-collapse-item__header--active {
  background: color-mix(in srgb, var(--tx-collapse-header-active-bg, var(--tx-fill-color, #f3f4f6)) 55%, transparent);
  color: var(--tx-collapse-header-active-text, var(--tx-text-color-primary, #111827));
}

// Keyboard focus is an inset ring: the browser's own outline sat outside the
// button and was cut by the frame's clip into a square-cornered box. Inset,
// it follows the header's nested radius and is never clipped.
.tx-collapse-item__header:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, transparent);
}

.tx-collapse-item__header--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tx-collapse-item__title {
  flex: 1;
  min-width: 0;
}

// The glyph is a hairline stroke (see TxIcon's builtin table) held one step
// below the title in both size and ink, so the row's weight sits on the words.
.tx-collapse-item__arrow {
  flex: none;
  font-size: 12px;
  color: var(--tx-collapse-arrow, var(--tx-text-color-secondary, #6b7280));
  opacity: 0.75;
  transition:
    transform 0.32s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1)),
    opacity 0.18s ease;
}

.tx-collapse-item__header:hover .tx-collapse-item__arrow,
.tx-collapse-item__arrow--active {
  opacity: 1;
}

.tx-collapse-item__arrow--active {
  transform: rotate(180deg);
}

.tx-collapse-item__content {
  overflow: hidden;
}

.tx-collapse-item__content-inner {
  padding: 0 14px 13px;
  font-size: 13px;
  color: var(--tx-collapse-content-text, var(--tx-text-color-regular, #6b7280));
  line-height: 1.6;
}

// Height is animated in JS (@enter/@leave); CSS cannot tween 0 ↔ auto. The body
// fades a touch behind the height so the panel arrives instead of snapping in.
.tx-collapse-enter-active,
.tx-collapse-leave-active {
  overflow: hidden;
  transition: height 0.32s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
}

.tx-collapse-enter-active .tx-collapse-item__content-inner,
.tx-collapse-leave-active .tx-collapse-item__content-inner {
  transition:
    opacity 0.28s ease,
    transform 0.32s var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
}

.tx-collapse-enter-from .tx-collapse-item__content-inner,
.tx-collapse-leave-to .tx-collapse-item__content-inner {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .tx-collapse-item__arrow,
  .tx-collapse-enter-active,
  .tx-collapse-leave-active,
  .tx-collapse-enter-active .tx-collapse-item__content-inner,
  .tx-collapse-leave-active .tx-collapse-item__content-inner {
    transition-duration: 0.01ms;
  }

  .tx-collapse-enter-from .tx-collapse-item__content-inner,
  .tx-collapse-leave-to .tx-collapse-item__content-inner {
    transform: none;
  }
}
</style>
