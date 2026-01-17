<script setup lang="ts">
import type { BreadcrumbItem, BreadcrumbProps } from './types'
import { TxIcon } from '../../icon'

interface Props extends BreadcrumbProps {}

interface Emits {
  click: [item: BreadcrumbItem, index: number]
}

const props = withDefaults(defineProps<Props>(), {
  separatorIcon: 'chevron-right',
})

const emit = defineEmits<Emits>()

function handleClick(item: BreadcrumbItem, index: number) {
  if (!item.href) {
    emit('click', item, index)
  }
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
          :is="item.href ? 'a' : 'span'"
          :href="item.href"
          class="tx-breadcrumb__link"
          :class="{ 'tx-breadcrumb__link--current': index === items.length - 1 }"
          :aria-current="index === items.length - 1 ? 'page' : undefined"
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
