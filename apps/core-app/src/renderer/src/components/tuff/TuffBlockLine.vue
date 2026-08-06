<script lang="ts" name="TuffBlockLine" setup>
// Legacy CoreApp business wrapper: keep the existing API while TuffEx group-block migration completes.
const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    link?: boolean
  }>(),
  {
    title: '',
    description: '',
    link: false
  }
)

const emits = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

function handleClick(event: MouseEvent) {
  if (!props.link) return
  emits('click', event)
}
</script>

<template>
  <div class="TBlockLine-Container" :class="{ link: props.link }" @click="handleClick">
    <span class="TBlockLine-Title">
      {{ title }}
    </span>
    <div v-if="!props.link" class="TBlockLine-Description">
      <slot name="description">
        {{ description }}
      </slot>
    </div>
    <div v-else class="TBlockLine-LinkSlot">
      <slot name="description" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.TBlockLine-Container {
  display: flex;
  gap: 12px;
  align-items: center;
  /*
   * Left inset was 50px to clear the group's icon column. There is no icon column in v2, so the
   * title now starts on the same 16px as every other row in the card.
   */
  padding: 8px 16px;
  min-height: 28px;
  transition: background-color 0.15s ease;

  .TBlockLine-Title {
    width: 120px;
    flex-shrink: 0;
    font-size: var(--shell-fs-body);
    font-weight: 500;
    color: var(--shell-text-secondary);
    transition: color 0.2s ease;
  }

  .TBlockLine-Description {
    flex: 1;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-body);
    line-height: 1.5;
    white-space: pre-line;
  }

  .TBlockLine-LinkSlot {
    font-size: var(--shell-fs-body);
    font-weight: 500;
    color: var(--shell-primary);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: color 0.2s ease;
  }

  &.link {
    cursor: pointer;

    .TBlockLine-Title {
      width: auto;
      min-width: 120px;
      color: var(--shell-text-primary);
      text-decoration-color: var(--shell-text-primary);
    }

    .TBlockLine-LinkSlot {
      text-decoration-color: var(--shell-primary);
    }

    /* `background-color`, not the shorthand: it would drop the card-drawn row hairline. */
    &:hover {
      text-decoration: underline;
      background-color: var(--shell-surface);
    }
  }
}
</style>
