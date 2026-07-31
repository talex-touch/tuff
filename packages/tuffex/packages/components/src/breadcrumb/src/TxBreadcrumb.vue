<script setup lang="ts">
import type { BreadcrumbItem, BreadcrumbProps } from './types'
import { TxIcon } from '../../icon'

interface Props extends BreadcrumbProps {}

interface Emits {
  click: [item: BreadcrumbItem, index: number]
}

const props = withDefaults(defineProps<Props>(), {
  separatorIcon: 'i-carbon-chevron-right',
})

const emit = defineEmits<Emits>()

function isCurrent(index: number) {
  return index === props.items.length - 1
}

function isLink(item: BreadcrumbItem, index: number) {
  return Boolean(item.href) && !item.disabled && !isCurrent(index)
}

function isButton(item: BreadcrumbItem, index: number) {
  // A no-href, non-current, enabled crumb is the documented "manual click target".
  // Render it as a real <button> so it is keyboard-reachable, not a bare <span>.
  return !item.href && !item.disabled && !isCurrent(index)
}

function handleClick(item: BreadcrumbItem, index: number) {
  if (item.disabled || isCurrent(index))
    return

  if (!item.href)
    emit('click', item, index)
}
</script>

<template>
  <nav class="tx-breadcrumb" aria-label="Breadcrumb">
    <ol class="tx-breadcrumb__list">
      <li
        v-for="(item, index) in items"
        :key="index"
        class="tx-breadcrumb__item"
      >
        <component
          :is="isLink(item, index) ? 'a' : (isButton(item, index) ? 'button' : 'span')"
          :href="isLink(item, index) ? item.href : undefined"
          :type="isButton(item, index) ? 'button' : undefined"
          class="tx-breadcrumb__link"
          :class="{
            'tx-breadcrumb__link--current': isCurrent(index),
            'tx-breadcrumb__link--disabled': item.disabled,
          }"
          :aria-current="isCurrent(index) ? 'page' : undefined"
          :aria-disabled="item.disabled ? 'true' : undefined"
          @click="handleClick(item, index)"
        >
          <TxIcon v-if="item.icon" :name="item.icon" class="tx-breadcrumb__icon" />
          {{ item.label }}
        </component>

        <span
          v-if="index < items.length - 1"
          class="tx-breadcrumb__separator"
          aria-hidden="true"
        >
          <TxIcon :name="separatorIcon" />
        </span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.tx-breadcrumb {
  display: flex;
  align-items: center;
}

.tx-breadcrumb__list {
  display: flex;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0;
}

.tx-breadcrumb__item {
  display: flex;
  align-items: center;
}

.tx-breadcrumb__link {
  display: flex;
  align-items: center;
  color: var(--tx-breadcrumb-text, #6b7280);
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
  padding: 4px 8px;
  border-radius: 4px;
  /* Reset native <button> chrome so a clickable crumb matches its <a>/<span> siblings. */
  font-family: inherit;
  line-height: inherit;
  background: none;
  border: none;
  cursor: pointer;
}

.tx-breadcrumb__link:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 60%, transparent);
  outline-offset: 2px;
}

.tx-breadcrumb__link:hover:not(.tx-breadcrumb__link--current) {
  color: var(--tx-breadcrumb-hover, #374151);
  background: var(--tx-breadcrumb-hover-bg, #f3f4f6);
}

.tx-breadcrumb__link--current {
  color: var(--tx-breadcrumb-current, #111827);
  font-weight: 500;
  cursor: default;
}

.tx-breadcrumb__link--disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.tx-breadcrumb__icon {
  margin-right: 6px;
  font-size: 16px;
}

.tx-breadcrumb__separator {
  display: flex;
  align-items: center;
  color: var(--tx-breadcrumb-separator, #9ca3af);
  margin: 0 4px;
  font-size: 16px;
}
</style>
