<script setup lang="ts">
import type { DropdownSubmenuProps } from './types'
import { nextTick, ref } from 'vue'
import TxIcon from '../../icon/src/TxIcon.vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import TxDropdownItem from './TxDropdownItem.vue'

defineOptions({ name: 'TxDropdownSubmenu' })

const props = withDefaults(defineProps<DropdownSubmenuProps>(), {
  disabled: false,
  placement: 'right-start',
  offset: 4,
  width: 0,
  minWidth: 160,
  maxHeight: 420,
  unlimitedHeight: false,
  animation: () => ({}),

  panelVariant: 'solid',
  panelBackground: 'refraction',
  panelShadow: 'soft',
  panelRadius: 14,
  panelPadding: 6,
})

/**
 * Deliberately no chain bookkeeping here: the anchor-delay service already
 * links this popover to the menu it renders inside (component-tree
 * provide/inject), so hover travel between the panels, outside-click
 * exemption, and cascading close all come from the family plumbing.
 * Nested items inject the ROOT menu's `txDropdownMenu` context straight
 * through this component, so selecting one closes the whole chain.
 */
const open = ref(false)
const triggerRef = ref<InstanceType<typeof TxDropdownItem> | null>(null)
const panelRef = ref<HTMLElement | null>(null)

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'

function ownItems(): HTMLElement[] {
  if (!panelRef.value)
    return []
  return Array.from(panelRef.value.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR))
    .filter(item => item.closest('[role="menu"]') === panelRef.value)
    .filter(item => item.getAttribute('aria-disabled') !== 'true')
}

async function openAndFocus() {
  if (props.disabled)
    return
  open.value = true
  await nextTick()
  ownItems()[0]?.focus()
}

function triggerEl(): HTMLElement | null {
  return (triggerRef.value?.$el as HTMLElement | null) ?? null
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (props.disabled)
    return
  if (event.key !== 'ArrowRight' && event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  event.stopPropagation()
  void openAndFocus()
}

function onPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    open.value = false
    triggerEl()?.focus()
    return
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
    return

  const items = ownItems()
  if (items.length === 0)
    return

  event.preventDefault()
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const activeIndex = active ? items.indexOf(active) : -1

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
</script>

<template>
  <TxPopover
    v-model="open"
    class="tx-dropdown-submenu"
    trigger="hover"
    :disabled="disabled"
    :placement="placement"
    :offset="offset"
    :animation="animation"
    :width="width"
    :min-width="minWidth"
    :max-width="360"
    :max-height="maxHeight"
    :unlimited-height="unlimitedHeight"
    :match-reference-width="false"
    reference-full-width
    :show-arrow="false"
    :panel-variant="panelVariant"
    :panel-background="panelBackground"
    :panel-shadow="panelShadow"
    :panel-radius="panelRadius"
    :panel-padding="panelPadding"
    :panel-card="panelCard"
  >
    <template #reference>
      <TxDropdownItem
        ref="triggerRef"
        class="tx-dropdown-submenu__trigger"
        :disabled="disabled"
        :close-on-select="false"
        aria-haspopup="menu"
        :aria-expanded="open ? 'true' : 'false'"
        @select="openAndFocus"
        @keydown="onTriggerKeydown"
      >
        <slot />
        <template #right>
          <span class="tx-dropdown-submenu__right">
            <slot name="right" />
            <TxIcon name="chevron-down" class="tx-dropdown-submenu__arrow" aria-hidden="true" />
          </span>
        </template>
      </TxDropdownItem>
    </template>

    <div
      ref="panelRef"
      class="tx-dropdown-submenu__panel"
      role="menu"
      @keydown="onPanelKeydown"
    >
      <slot name="menu" />
    </div>
  </TxPopover>
</template>

<style lang="scss" scoped>
.tx-dropdown-submenu__trigger {
  flex: 1 1 auto;
  min-width: 0;
}

.tx-dropdown-submenu__right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tx-dropdown-submenu__arrow {
  transform: rotate(-90deg);
  opacity: 0.7;
}

.tx-dropdown-submenu__panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px;
}
</style>
