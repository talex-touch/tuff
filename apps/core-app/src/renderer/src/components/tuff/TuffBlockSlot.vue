<script lang="ts" name="TuffBlockSlot" setup>
// Legacy CoreApp business wrapper: keep the existing API while delegating primitives to TuffEx.
import type { IconValue } from './tuff-icon-utils'

/**
 * Artboard `C2/Row`: a flat 12/16 row inside the group card, with no leading icon.
 *
 * The icon props stay declared so existing call sites compile, but no longer render anything.
 * The `#icon` slot is still honoured — callers put content there rather than decoration (the
 * account row's avatar, for one), and that is not the artboard's icon column.
 */
const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    /** No-op since v2: the artboard rows carry no icon. Use `#icon` for content. */
    defaultIcon?: IconValue
    /** No-op since v2. */
    activeIcon?: IconValue
    /** No-op since v2. */
    iconSize?: number
    disabled?: boolean
    active?: boolean
  }>(),
  {
    title: '',
    description: '',
    iconSize: 20,
    disabled: false,
    active: false
  }
)

const emits = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

function handleClick(event: MouseEvent) {
  if (props.disabled) return
  emits('click', event)
}
</script>

<template>
  <div class="TBlockSlot-Container TBlockSelection" :class="{ disabled }" @click="handleClick">
    <div class="TBlockSlot-Content TBlockSelection-Content">
      <slot name="icon" :active="active" />
      <div class="TBlockSlot-Label TBlockSelection-Label">
        <template v-if="$slots.label">
          <slot name="label" />
          <div v-if="$slots.tags" class="TBlockSlot-Tags TBlockSlot-Tags--after">
            <slot name="tags" />
          </div>
        </template>
        <template v-else>
          <div class="TBlockSlot-TitleRow">
            <h5>
              {{ title }}
            </h5>
            <div v-if="$slots.tags" class="TBlockSlot-Tags">
              <slot name="tags" />
            </div>
          </div>
          <p>{{ description }}</p>
        </template>
      </div>
    </div>
    <div class="TBlockSlot-Slot TBlockSelection-Func">
      <slot :active="active" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TBlockSlot-Container {
  &.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .TBlockSlot-Slot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-left: auto;
    flex-shrink: 0;
    gap: 6px;
  }

  .TBlockSlot-Content {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    gap: 12px;
    width: auto;
    min-width: 0;
    height: 100%;

    box-sizing: border-box;

    cursor: pointer;

    /*
     * Only a caller-supplied `#icon` lands here now that the icon props draw nothing, and it
     * is usually an icon font that sizes itself off the inherited font-size.
     */
    > *:not(.TBlockSlot-Label) {
      font-size: 20px;
    }

    > .TBlockSlot-Label {
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1;
      min-width: 0;

      > h5 {
        margin: 0;

        color: var(--shell-text-primary);
        font-size: 13.5px;
        font-weight: 400;
      }

      > p {
        margin: 0;

        color: var(--shell-text-secondary);
        font-size: var(--shell-fs-sm);
        font-weight: 400;
        line-height: 1.5;
      }
    }

    .TBlockSlot-TitleRow {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      width: 100%;
    }

    .TBlockSlot-Tags {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      flex: 0 0 auto;
      max-width: 100%;
      align-self: flex-start;
      height: auto;
    }

    .TBlockSlot-Tags--after {
      margin-top: 4px;
    }
  }

  position: relative;
  /*
   * Artboard `C2/Row`. No fixed height any more: the card behind the row supplies the surface,
   * so a row with tags or a wrapped description grows instead of overflowing its 56px box.
   */
  padding: 12px 16px;
  display: flex;
  gap: 16px;
  justify-content: flex-start;
  align-items: center;

  width: 100%;

  user-select: none;
  box-sizing: border-box;
  transition: background-color 0.15s ease;

  /*
   * `background-color`, not the `background` shorthand: the group card paints the row hairline
   * as this element's `background-image`, and the shorthand would drop it on hover.
   */
  &:hover {
    background-color: var(--shell-surface);
  }
}
</style>
