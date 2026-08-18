<script setup lang="ts">
import type { ContextMenuContext, ContextMenuSubmenuProps } from './types'
import { computed, inject, nextTick, ref } from 'vue'
import TxIcon from '../../icon/src/TxIcon.vue'
import TxPopover from '../../popover/src/TxPopover.vue'
import TxContextMenuItem from './TxContextMenuItem.vue'
import TxContextMenuPanel from './TxContextMenuPanel.vue'
import { TX_CONTEXT_MENU_INJECTION_KEY } from './types'

defineOptions({ name: 'TxContextMenuSubmenu' })

const props = withDefaults(defineProps<ContextMenuSubmenuProps>(), {
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
  panelShadow: 'medium',
  panelRadius: 14,
  panelPadding: 6,
})

/**
 * The nested panel re-provides the ROOT menu's context, so selecting an item
 * in it closes the whole chain, exactly like a top-level item. Hover travel,
 * outside-click exemption, and cascading close come from the anchor-delay
 * chain the popover joins automatically.
 */
const rootCtx = inject<ContextMenuContext | null>(TX_CONTEXT_MENU_INJECTION_KEY, null)

const open = ref(false)
const triggerRef = ref<InstanceType<typeof TxContextMenuItem> | null>(null)
const panelRef = ref<InstanceType<typeof TxContextMenuPanel> | null>(null)

const rootCloseOnSelect = computed(() => rootCtx?.closeOnSelect ?? true)

function closeRoot() {
  rootCtx?.close?.()
}

async function openAndFocus() {
  if (props.disabled)
    return
  open.value = true
  await nextTick()
  panelRef.value?.focusFirstItem()
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
  if (event.key !== 'ArrowLeft')
    return
  event.preventDefault()
  open.value = false
  triggerEl()?.focus()
}
</script>

<template>
  <TxPopover
    v-model="open"
    class="tx-context-menu-submenu"
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
      <TxContextMenuItem
        ref="triggerRef"
        class="tx-context-menu-submenu__trigger"
        :disabled="disabled"
        :close-on-select="false"
        aria-haspopup="menu"
        :aria-expanded="open ? 'true' : 'false'"
        @select="openAndFocus"
        @keydown="onTriggerKeydown"
      >
        <slot />
        <template #right>
          <span class="tx-context-menu-submenu__right">
            <slot name="right" />
            <TxIcon name="chevron-down" class="tx-context-menu-submenu__arrow" aria-hidden="true" />
          </span>
        </template>
      </TxContextMenuItem>
    </template>

    <div class="tx-context-menu-submenu__body" @keydown="onPanelKeydown">
      <TxContextMenuPanel
        ref="panelRef"
        :close="closeRoot"
        :close-on-select="rootCloseOnSelect"
        :outside-guard="true"
      >
        <slot name="menu" />
      </TxContextMenuPanel>
    </div>
  </TxPopover>
</template>

<style lang="scss" scoped>
.tx-context-menu-submenu__trigger {
  flex: 1 1 auto;
  min-width: 0;
}

.tx-context-menu-submenu__right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tx-context-menu-submenu__arrow {
  transform: rotate(-90deg);
  opacity: 0.68;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-context-menu-submenu__body {
  display: flex;
  width: 100%;
}
</style>
