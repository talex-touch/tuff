<script setup lang="ts">
import type { DropdownMenuContext, DropdownMenuProps } from './types'
import { computed, nextTick, provide, ref, watch } from 'vue'
import { createRovingFocus } from '../../../../utils/roving-focus'
import TxPopover from '../../popover/src/TxPopover.vue'
import { TX_DROPDOWN_MENU_INJECTION_KEY } from './types'

defineOptions({ name: 'TxDropdownMenu' })

const props = withDefaults(defineProps<DropdownMenuProps>(), {
  modelValue: undefined,
  placement: 'bottom-start',
  trigger: 'click',
  offset: 6,
  closeOnSelect: true,
  activationFeedback: true,
  initialFocus: 'first-item',
  animation: () => ({}),

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

// ARIA menus also hold radio/checkbox items; arrow navigation must not skip them.
const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'

// A field inside the panel (a search box) owns its caret keys: Home / End move
// the caret, not to the first / last item.
const roving = createRovingFocus(
  () => Array.from(panelRef.value?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [])
    .filter(item => item.closest('[role="menu"]') === panelRef.value),
  { skipDisabled: true, editableKeepsHomeEnd: true },
)

function focusFirstItem() {
  nextTick(() => roving.items()[0]?.focus())
}

function handleKeydown(event: KeyboardEvent) {
  const eventTarget = event.target instanceof HTMLElement ? event.target : null
  if (eventTarget?.closest('[role="menu"]') !== panelRef.value)
    return
  roving.move(event, eventTarget?.closest(MENU_ITEM_SELECTOR))
}

watch(
  open,
  (isOpen) => {
    if (isOpen && props.initialFocus === 'first-item')
      focusFirstItem()
  },
  { immediate: true },
)

provide<DropdownMenuContext>(TX_DROPDOWN_MENU_INJECTION_KEY, {
  close,
  get closeOnSelect() {
    return props.closeOnSelect
  },
  get activationFeedback() {
    return props.activationFeedback
  },
  get panelCard() {
    return props.panelCard
  },
})
</script>

<template>
  <TxPopover
    v-model="open"
    class="tx-dropdown"
    :placement="placement"
    :trigger="trigger"
    :offset="offset"
    :animation="animation"
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
