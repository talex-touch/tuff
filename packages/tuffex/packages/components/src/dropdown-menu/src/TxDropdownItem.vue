<script setup lang="ts">
import type { DropdownItemProps, DropdownMenuContext } from './types'
import { inject } from 'vue'
import { useMenuActivationFeedback } from '../../../../utils/menu-activation-feedback'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import TxIcon from '../../icon/src/TxIcon.vue'
import { TX_DROPDOWN_MENU_INJECTION_KEY } from './types'

defineOptions({ name: 'TxDropdownItem' })

const props = withDefaults(defineProps<DropdownItemProps>(), {
  disabled: false,
  danger: false,
  arrow: false,
  closeOnSelect: undefined,
  activationFeedback: undefined,
})

const emit = defineEmits<{
  (e: 'select'): void
}>()

const ctx = inject<DropdownMenuContext | null>(TX_DROPDOWN_MENU_INJECTION_KEY, null)

const { activate, phase: activationPhase } = useMenuActivationFeedback({
  enabled: () => props.activationFeedback ?? ctx?.activationFeedback ?? true,
  shouldClose: () => Boolean(ctx && (props.closeOnSelect ?? ctx.closeOnSelect)),
  onSelect: () => emit('select'),
  onClose: () => ctx?.close(),
})

function onClick() {
  if (props.disabled)
    return
  activate()
}
</script>

<template>
  <TxCardItem
    class="tx-dropdown-item"
    align="center"
    :class="{
      'is-disabled': disabled,
      'is-danger': danger,
      'is-activation-feedback': activationPhase !== 'idle',
      'is-activation-clear': activationPhase === 'clear',
      'is-activation-confirm': activationPhase === 'confirm',
    }"
    role="menuitem"
    :clickable="true"
    :active="activationPhase === 'confirm'"
    :disabled="disabled"
    :aria-disabled="disabled ? 'true' : undefined"
    @click="onClick"
  >
    <template #title>
      <slot />
    </template>

    <template v-if="$slots.right || arrow" #right>
      <slot name="right">
        <TxIcon name="chevron-down" class="tx-dropdown-item__arrow" aria-hidden="true" />
      </slot>
    </template>
  </TxCardItem>
</template>

<style lang="scss" scoped>
.tx-dropdown-item {
  --tx-card-item-padding: 8px 10px;
  --tx-card-item-radius: 10px;
  --tx-card-item-gap: 10px;
}

// Menu rows wear the same outlined hover and active states as every other
// list row in the library. They used to opt out for a translucent veil, on the
// grounds that a hairline border reads as a box drawn around the row on a dark
// panel; that made a menu the one list that highlighted differently from a
// select, a tree or a cascader, which is the more confusing of the two.
.tx-dropdown-item.tx-dropdown-item:not(.is-disabled):focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 22%, transparent);
}

.tx-dropdown-item.tx-dropdown-item.is-activation-feedback {
  transition: none;
}

.tx-dropdown-item.tx-dropdown-item.is-activation-feedback.is-activation-clear {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.tx-dropdown-item :deep(.tx-card-item__title) {
  font-weight: 500;
  color: var(--tx-text-color-primary, #303133);
}

.tx-dropdown-item.is-danger :deep(.tx-card-item__title) {
  color: var(--tx-color-danger, #f56c6c);
}

.tx-dropdown-item.is-disabled {
  opacity: 0.5;
}

.tx-dropdown-item__arrow {
  transform: rotate(-90deg);
  opacity: 0.7;
}
</style>
