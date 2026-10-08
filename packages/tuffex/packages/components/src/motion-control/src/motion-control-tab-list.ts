// Source: Amicro css-animations UIkit. MIT — Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { ComputedRef, Ref } from 'vue'
import type { MotionControlEmits, MotionControlItem, MotionControlProps, MotionControlValue } from './types'
import { computed, nextTick, ref } from 'vue'

interface ClosingTab {
  item: MotionControlItem
  index: number
  style: Record<string, string>
}

interface MotionControlTabListOptions {
  props: Readonly<MotionControlProps> & Required<Pick<MotionControlProps, 'items' | 'minItems'>>
  root: Ref<HTMLElement | null>
  motion: ComputedRef<boolean>
  value: ComputedRef<MotionControlValue>
  setValue: (value: MotionControlValue) => void
  emit: MotionControlEmits
}

/**
 * Owns the closeable tab list, not its renderer or selection model.
 * Model events remain immediate; measured leaving tabs only preserve exit geometry.
 * The control resets exits in its existing variant and motion watchers.
 */
export function useMotionControlTabList({ props, root, motion, value, setValue, emit }: MotionControlTabListOptions) {
  const closingTabs = ref<ClosingTab[]>([])
  const displayedTabs = computed(() => {
    const items = [...props.items]
    for (const closing of closingTabs.value) {
      if (!items.some(item => item.value === closing.item.value))
        items.splice(Math.min(closing.index, items.length), 0, closing.item)
    }
    return items
  })

  function closeTab(item: MotionControlItem) {
    if (props.disabled || item.disabled || item.closable === false || props.items.length <= props.minItems || closingTab(item)) return
    const index = props.items.indexOf(item)
    if (index < 0) return
    if (motion.value) {
      const tab = Array.from(root.value?.querySelectorAll<HTMLElement>('[data-motion-tab]') ?? []).find(element => element.dataset.motionTab === String(item.value))
      const nav = tab?.closest<HTMLElement>('.tx-tabs__nav-inner')
      if (tab && nav) {
        const rect = tab.getBoundingClientRect()
        const origin = nav.getBoundingClientRect()
        closingTabs.value = [...closingTabs.value, {
          item,
          index,
          style: {
            position: 'absolute',
            left: `${rect.left - origin.left + nav.scrollLeft}px`,
            top: `${rect.top - origin.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            pointerEvents: 'none',
          },
        }]
      }
    }
    const next = props.items.filter(entry => entry !== item)
    emit('update:items', next)
    emit('close', item)
    if (value.value === item.value) {
      const replacement = next.slice(index).find(entry => !entry.disabled) ?? [...next.slice(0, index)].reverse().find(entry => !entry.disabled)
      setValue(replacement?.value ?? '')
    }
    nextTick(() => root.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }))
  }

  function closingTab(item: MotionControlItem) {
    return closingTabs.value.find(closing => closing.item.value === item.value)
  }

  function finishClosingTab(event: AnimationEvent, item: MotionControlItem) {
    if (event.target === event.currentTarget && (event.animationName === 'tx-mc-tab-close' || event.animationName.startsWith('tx-mc-tab-close-')))
      closingTabs.value = closingTabs.value.filter(closing => closing.item.value !== item.value)
  }

  function addTab() {
    if (props.disabled || (props.maxItems !== undefined && props.items.length >= props.maxItems)) return
    if (props.newItem && !props.items.some(item => item.value === props.newItem?.value)) {
      emit('update:items', [...props.items, props.newItem])
      setValue(props.newItem.value)
      emit('add', props.newItem)
    }
    else if (!props.newItem) emit('add')
  }

  return { closingTabs, displayedTabs, closeTab, closingTab, finishClosingTab, addTab }
}
