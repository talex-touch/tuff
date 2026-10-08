<script setup lang="ts">
import type { InsightsMenuItem } from './types'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { ref } from 'vue'

/**
 * The ⋯ menu at the end of an insights header: the actions a page keeps out of its title row.
 *
 * Plain buttons in a popover: a short list of actions needs no menu widget. Attributes given to
 * this component (`class`, `data-testid`, …) land on that list, the way `TxPopover` forwards its
 * own to the floating panel rather than to the trigger.
 */
defineOptions({ name: 'InsightsMenu', inheritAttrs: false })

defineProps<{
  items: readonly InsightsMenuItem[]
  /** The ⋯ trigger's accessible name. Required: the kit carries no copy of its own. */
  label: string
  /** The trigger's `data-testid`. */
  triggerTestId?: string
}>()

const emit = defineEmits<{
  /** An enabled item was chosen; the menu has already closed. */
  select: [key: string]
}>()

const open = ref(false)

/**
 * A menu item closes the menu, then acts. Leaving it open over a dialog is its own bug.
 *
 * A disabled item cannot be clicked in a browser at all; the guard is for anything that
 * dispatches the event regardless.
 */
function choose(item: InsightsMenuItem): void {
  if (item.disabled) return
  open.value = false
  emit('select', item.key)
}
</script>

<template>
  <TxPopover v-model="open" placement="bottom-end" :offset="6" :min-width="176">
    <template #reference>
      <TxButton :aria-label="label" :data-testid="triggerTestId">
        <span class="i-ri-more-fill" aria-hidden="true" />
      </TxButton>
    </template>
    <div class="InsightsMenu" v-bind="$attrs">
      <template v-for="item in items" :key="item.key">
        <div v-if="item.separatorBefore" class="InsightsMenu-Rule" role="separator" />
        <button
          type="button"
          :class="{ 'is-danger': item.danger }"
          :disabled="item.disabled"
          :data-testid="item.testId"
          @click="choose(item)"
        >
          <span :class="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
      </template>
    </div>
  </TxPopover>
</template>

<style scoped lang="scss">
/* The menu behind the dots. Plain buttons: a list of three needs no widget. */
.InsightsMenu {
  display: flex;
  flex-direction: column;
  gap: 2px;

  button {
    display: flex;
    align-items: center;
    padding: var(--shell-space-2) var(--shell-space-3);
    border: none;
    border-radius: var(--shell-radius-md);
    background: transparent;
    color: var(--shell-text-primary);
    font-family: inherit;
    font-size: var(--shell-fs-body);
    gap: var(--shell-space-3);
    cursor: pointer;
    text-align: left;

    &:hover:not(:disabled) {
      background: var(--shell-surface);
    }

    &:disabled {
      color: var(--shell-text-muted);
      cursor: not-allowed;
    }

    &.is-danger {
      color: var(--shell-danger);
    }
  }
}

/* The one irreversible item is fenced off from the two that are not. */
.InsightsMenu-Rule {
  height: 1px;
  margin: var(--shell-space-1) 0;
  background: var(--shell-border);
}
</style>
