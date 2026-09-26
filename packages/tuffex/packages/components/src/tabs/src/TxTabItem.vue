<script setup lang="ts">
import type { TabItemProps } from './types'
import { computed } from 'vue'

defineOptions({
  name: 'TxTabItem',
})

const props = withDefaults(defineProps<TabItemProps>(), {
  iconClass: '',
  disabled: false,
  activation: false,
  active: false,
})

const emit = defineEmits<{
  (e: 'click'): void
}>()

const active = computed(() => !!props.active)

function handleClick() {
  if (!props.disabled) {
    emit('click')
  }
}
</script>

<template>
  <button
    type="button"
    class="tx-tab-item fake-background"
    role="tab"
    :aria-selected="active"
    :class="{ 'is-active': active, 'is-disabled': disabled }"
    :disabled="disabled"
    :tabindex="active ? 0 : -1"
    @click="handleClick"
  >
    <span v-if="iconClass || $slots.icon" class="tx-tab-item__icon">
      <slot name="icon">
        <i :class="iconClass" aria-hidden="true" />
      </slot>
    </span>
    <span class="tx-tab-item__name">
      <slot name="name">
        {{ name }}
      </slot>
    </span>
  </button>
</template>

<style lang="scss" scoped>
.tx-tab-item {
  appearance: none;
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;

  margin: 6px 8px;
  padding: 8px 10px;

  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
  user-select: none;
  box-sizing: border-box;

  --fake-color: transparent;
  --fake-radius: 10px;

  &:hover {
    --fake-color: var(--tx-fill-color-light, #f5f7fa);
  }
}

.tx-tab-item.is-active {
  --fake-color: var(--tx-fill-color, #f0f2f5);
}

.tx-tab-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
  --fake-color: transparent;
}

// A flex box, not a bare inline span: an icon-font or utility glyph class sets
// its size as width/height, which an inline `<i>` ignores — the icon measured
// 0×0 and left only the row's gap in front of the label.
//
// Ink is switched through variables on the item, not by stronger selectors on
// the children, so a host restyling `.tx-tab-item__name` with one class of its
// own (LingPan sets `color: inherit` on a hard-dark panel) still wins.
.tx-tab-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  color: var(--tx-tab-item-icon-ink, var(--tx-text-color-secondary, #909399));
}

// Resting ink for 13px text is `regular`; the active tab steps up to `primary`.
// Colour only, never weight: a bolder label is wider and shifts its neighbours.
.tx-tab-item__name {
  font-size: 13px;
  line-height: 1.2;
  color: var(--tx-tab-item-ink, var(--tx-text-color-regular, #606266));
}

.tx-tab-item.is-active {
  --tx-tab-item-ink: var(--tx-text-color-primary, #303133);
  --tx-tab-item-icon-ink: var(--tx-text-color-primary, #303133);
}
</style>
