<script setup lang="ts">
import type { DropdownMenuProps } from './types'
import { computed, nextTick, provide, ref, watch } from 'vue'
import TxPopover from '../../popover/src/TxPopover.vue'

defineOptions({ name: 'TxDropdownMenu' })

const props = withDefaults(defineProps<DropdownMenuProps>(), {
  modelValue: undefined,
  placement: 'bottom-start',
  offset: 6,
  closeOnSelect: true,
  animation: () => ({}),
  duration: 180,

  minWidth: 220,
  maxHeight: 420,
  unlimitedHeight: false,
  panelVariant: 'solid',
  panelBackground: 'refraction',
  panelShadow: 'soft',
  panelRadius: 18,
  panelPadding: 8,
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()

const internalOpen = ref(false)
const panelRef = ref<HTMLElement | null>(null)

const open = computed({
  get: () => (typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value),
  set: (v) => {
    const current = typeof props.modelValue === 'boolean' ? props.modelValue : internalOpen.value
    if (current === v)
      return

    internalOpen.value = v
    emit('update:modelValue', v)
    if (v)
      emit('open')
    else
      emit('close')
  },
})

function close() {
  open.value = false
}

function getEnabledItems(): HTMLElement[] {
  if (!panelRef.value)
    return []

  return Array.from(panelRef.value.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .filter(item => item.closest('[role="menu"]') === panelRef.value)
    .filter(item => item.getAttribute('aria-disabled') !== 'true')
}

function focusFirstItem() {
  nextTick(() => getEnabledItems()[0]?.focus())
}

function handleKeydown(event: KeyboardEvent) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
    return

  const eventTarget = event.target instanceof HTMLElement ? event.target : null
  if (eventTarget?.closest('[role="menu"]') !== panelRef.value)
    return

  const items = getEnabledItems()
  if (items.length === 0)
    return

  event.preventDefault()
  const targetItem = eventTarget?.closest<HTMLElement>('[role="menuitem"]')
  const activeItem = targetItem
    ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const activeIndex = activeItem ? items.indexOf(activeItem) : -1

  if (event.key === 'Home') {
    items[0]?.focus()
    return
  }
  if (event.key === 'End') {
    items[items.length - 1]?.focus()
    return
  }

  const direction = event.key === 'ArrowDown' ? 1 : -1
  const fallbackIndex = direction > 0 ? -1 : 0
  const nextIndex = (Math.max(activeIndex, fallbackIndex) + direction + items.length) % items.length
  items[nextIndex]?.focus()
}

watch(
  open,
  (isOpen) => {
    if (isOpen)
      focusFirstItem()
  },
  { immediate: true },
)

provide('txDropdownMenu', {
  close,
  closeOnSelect: props.closeOnSelect,
})
</script>

<template>
  <TxPopover
    v-model="open"
    class="tx-dropdown"
    :placement="placement"
    :offset="offset"
    :animation="animation"
    :duration="duration"
    :width="0"
    :min-width="minWidth"
    :max-width="360"
    :max-height="maxHeight"
    :unlimited-height="unlimitedHeight"
    :reference-class="props.referenceClass"
    :panel-variant="panelVariant"
    :panel-background="panelBackground"
    :panel-shadow="panelShadow"
    :panel-radius="panelRadius"
    :panel-padding="panelPadding"
    :panel-card="panelCard"
  >
    <template #reference>
      <slot name="trigger" />
    </template>

    <div
      ref="panelRef"
      class="tx-dropdown__panel"
      role="menu"
      @keydown="handleKeydown"
    >
      <slot />
    </div>
  </TxPopover>
</template>

<style lang="scss" scoped>
.tx-dropdown__panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px;
}
</style>
