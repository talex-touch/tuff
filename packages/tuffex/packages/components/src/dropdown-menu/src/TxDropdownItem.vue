<script setup lang="ts">
import type { DropdownItemProps } from './types'
import { inject } from 'vue'
import TxCardItem from '../../card-item/src/TxCardItem.vue'
import TxIcon from '../../icon/src/TxIcon.vue'

defineOptions({ name: 'TxDropdownItem' })

const props = withDefaults(defineProps<DropdownItemProps>(), {
  disabled: false,
  danger: false,
  arrow: false,
  closeOnSelect: undefined,
})

const emit = defineEmits<{
  (e: 'select'): void
}>()

const ctx = inject<{ close: () => void, closeOnSelect: boolean }>('txDropdownMenu')

function onClick() {
  if (props.disabled)
    return
  emit('select')
  const shouldClose = props.closeOnSelect ?? ctx?.closeOnSelect
  if (shouldClose)
    ctx?.close()
}
</script>

<template>
  <TxCardItem
    class="tx-dropdown-item"
    :class="{ 'is-disabled': disabled, 'is-danger': danger }"
    role="menuitem"
    :clickable="true"
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

/*
 * Hover is a soft pane, not the card's outlined box. A menu row highlights by
 * lifting a translucent veil over the panel, the way a selection does in a
 * system menu; the card's hover — a hairline border around an 18% overlay
 * fill — is invisible on a dark panel except for the border, which read as a
 * box drawn around the row. So: no edge at all, not even an inset rim — on a
 * dark panel any 1px line reads as an outline. The fill takes the text ink, so
 * one rule gives a light veil on a dark panel and a grey one on a light panel,
 * with a barely-there white gradient over it — a touch brighter at the top,
 * where the light would fall on glass, but flat enough that the row does not
 * read as raised. Keyboard focus wears the same veil, so arrowing through the
 * menu looks exactly like hovering it, plus the library's focus ring. The
 * doubled class outranks the card's own hover rule without leaning on
 * stylesheet order.
 */
.tx-dropdown-item.tx-dropdown-item:not(.is-disabled):hover,
.tx-dropdown-item.tx-dropdown-item:not(.is-disabled):focus-visible {
  border-color: transparent;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tx-color-white, #fff) 6%, transparent),
      color-mix(in srgb, var(--tx-color-white, #fff) 4%, transparent)
    ),
    color-mix(in srgb, var(--tx-text-color-primary, #303133) 5%, transparent);
  box-shadow: none;
}

.tx-dropdown-item.tx-dropdown-item:not(.is-disabled):focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 22%, transparent);
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
