<script setup lang="ts">
import type { SplitButtonEmits, SplitButtonProps } from './split-button'
import { computed, ref, useSlots, watch } from 'vue'
import Spinner from '../../spinner'
import TxPopover from '../../popover/src/TxPopover.vue'

defineOptions({ name: 'TxSplitButton' })

const props = withDefaults(defineProps<SplitButtonProps>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  icon: undefined,
  menuIcon: 'i-ri-more-2-line',
  menuDisabled: false,
  menuWidth: 200,
  menuPlacement: 'bottom-end',
  menuOffset: 8,
})

const emit = defineEmits<SplitButtonEmits>()

const open = ref(false)
const slots = useSlots()

watch(open, (v) => emit('menuOpenChange', v))

const hasMenu = computed(() => !!slots.menu)

const normalizedSize = computed(() => {
  const size = props.size
  if (size === 'lg' || size === 'large')
    return 'lg'
  if (size === 'sm' || size === 'small' || size === 'mini')
    return 'sm'
  return 'md'
})

const classList = computed(() => {
  return [
    `variant-${props.variant}`,
    `tx-size-${normalizedSize.value}`,
    {
      'is-disabled': props.disabled,
      'is-loading': props.loading,
      'has-menu': hasMenu.value,
    },
  ]
})

const interactiveDisabled = computed(() => props.disabled || props.loading)
const menuDisabled = computed(() => interactiveDisabled.value || props.menuDisabled)

function handlePrimaryClick(event: MouseEvent) {
  if (interactiveDisabled.value)
    return
  emit('click', event)
}

function closeMenu() {
  open.value = false
}
</script>

<template>
  <div
    class="tx-split-button"
    :class="classList"
    :aria-disabled="interactiveDisabled || undefined"
    :aria-busy="loading || undefined"
  >
    <button
      class="tx-split-button__primary"
      :disabled="interactiveDisabled"
      type="button"
      @click="handlePrimaryClick"
    >
      <span class="tx-split-button__inner">
        <span class="tx-split-button__spinner-slot" :class="{ 'is-visible': loading }">
          <Spinner class="tx-split-button__spinner" :visible="loading" :size="16" />
        </span>
        <i v-if="icon && !loading" class="tx-split-button__icon" :class="icon" />
        <span class="tx-split-button__label">
          <slot />
        </span>
      </span>
    </button>

    <template v-if="hasMenu">
      <TxPopover
        v-model="open"
        :disabled="menuDisabled"
        :placement="menuPlacement"
        :offset="menuOffset"
        :width="menuWidth"
      >
        <template #reference>
          <button
            class="tx-split-button__menu"
            :disabled="menuDisabled"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="open || undefined"
          >
            <slot name="menu-icon">
              <i class="tx-split-button__menu-icon" :class="menuIcon" />
            </slot>
          </button>
        </template>

        <slot name="menu" :close="closeMenu" />
      </TxPopover>
    </template>
  </div>
</template>
