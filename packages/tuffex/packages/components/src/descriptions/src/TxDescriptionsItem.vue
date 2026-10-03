<script setup lang="ts">
import type { VNode } from 'vue'
import type { DescriptionsItemProps } from './types'
import { Comment, computed, Fragment, inject, isVNode, Text, useSlots } from 'vue'
import { DESCRIPTIONS_KEY } from './types'

defineOptions({ name: 'TxDescriptionsItem' })

const props = withDefaults(defineProps<DescriptionsItemProps>(), {
  label: '',
  span: 1,
})

const slots = useSlots()
const context = inject(DESCRIPTIONS_KEY, null)

// Grid tracks to span: clamped to the list's columns, and doubled in the
// horizontal layout, where every column is a label track plus a value track.
const trackSpan = computed(() => {
  const columns = context?.columns.value ?? 1
  const requested = Math.floor(Number(props.span))
  const span = Math.min(Math.max(Number.isFinite(requested) ? requested : 1, 1), columns)
  return context?.layout.value === 'vertical' ? span : span * 2
})

/**
 * Whether the default slot renders anything a reader would see. Vue's own slot
 * fallback only skips comments, so an empty or whitespace-only interpolation
 * (`{{ user.phone }}` with no phone) would otherwise render as a blank value.
 */
function isBlank(nodes: unknown): boolean {
  if (!Array.isArray(nodes))
    return true
  return nodes.every((node) => {
    if (!isVNode(node))
      return node == null || typeof node === 'boolean' || String(node).trim() === ''
    const vnode = node as VNode
    if (vnode.type === Comment)
      return true
    if (vnode.type === Text)
      return String(vnode.children ?? '').trim() === ''
    if (vnode.type === Fragment)
      return isBlank(vnode.children)
    return false
  })
}

// Called from the template so the slot is read inside render, where its
// dependencies are tracked. The empty scope matches how the template types the
// slot (`<slot />` takes `{}`), as in TxSelectItem and TxStagger.
function hasValue(): boolean {
  return !isBlank(slots.default?.({}))
}
</script>

<template>
  <div class="tx-descriptions__item" :style="{ '--tx-descriptions-span': trackSpan }">
    <dt class="tx-descriptions__label">
      <slot name="label">
        {{ label }}
      </slot>
    </dt>
    <dd v-if="hasValue()" class="tx-descriptions__value">
      <slot />
    </dd>
    <dd v-else class="tx-descriptions__value is-empty">
      {{ context?.emptyText.value ?? '—' }}
    </dd>
  </div>
</template>
