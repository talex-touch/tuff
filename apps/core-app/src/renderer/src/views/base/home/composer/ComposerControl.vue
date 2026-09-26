<script lang="ts" name="ComposerControl" setup>
import { ref } from 'vue'
import { useComposerPress } from './useComposerPress'

/**
 * The toolbar's round key in its quiet material: no fill at rest, a surface under the pointer, the
 * shared press. 32px round, so on the composer's 8px inset its 16px radius is concentric with the
 * composer's 24px corner.
 *
 * Disabled is `aria-disabled` with the click swallowed, never the native attribute: a native
 * `disabled` button drops focus the moment it switches off.
 */
const props = withDefaults(defineProps<{ label: string; disabled?: boolean }>(), {
  disabled: false
})

const emit = defineEmits<{ (event: 'click', payload: MouseEvent): void }>()

const rootRef = ref<HTMLButtonElement | null>(null)
useComposerPress(rootRef, { disabled: () => props.disabled })

function onClick(event: MouseEvent): void {
  if (props.disabled) {
    event.preventDefault()
    return
  }
  emit('click', event)
}
</script>

<template>
  <button
    ref="rootRef"
    class="ComposerControl"
    type="button"
    :aria-label="label"
    :aria-disabled="disabled || undefined"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<style lang="scss" scoped>
/*
 * Ink: the secondary grey is a glyph here, and glyphs need 3:1 — 5.07 light / 8.33 dark on the
 * composer (research `current-toolbar.md` §11). The hover takes the ink to primary with the fill.
 */
.ComposerControl {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-secondary);
  font: inherit;
  // The icon classes size in `em`; the button is a flex box, so the glyph is a sized flex item.
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  appearance: none;

  // Immediate: a hover is a sub-100ms interaction and never eases.
  &:hover:not([aria-disabled='true']) {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.5;
  }
}
</style>
