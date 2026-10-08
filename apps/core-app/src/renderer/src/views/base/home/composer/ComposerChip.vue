<script lang="ts" name="ComposerChip" setup>
import { ref } from 'vue'
import { useComposerPress } from './useComposerPress'

/**
 * The toolbar's chip: the permission, mode and model pills are all this. One material — no fill,
 * no ring and no tint at rest; a neutral surface under the pointer or while its menu is open. A
 * value change lands in the same frame: no glyph blur, label crossfade, width tween or colour ease
 * (`home-composer` › 换档不做变形动画). Only the press keeps its feedback.
 *
 * `label` is the visible value; `suffix` rides after it in the lighter ink (the model pill's
 * reasoning level). An icon comes as a class (`icon`) or through the `icon` slot; `trailing` holds
 * a chevron. `danger` paints the icon and label in the alarm hue — the permission chip on
 * 「完全允许」 and the mode chip on a profile that can no longer run.
 */
const props = withDefaults(
  defineProps<{
    label: string
    suffix?: string
    danger?: boolean
    icon?: string
    disabled?: boolean
    /** Folds to a 32px icon key once the toolbar is narrower than 520px. */
    collapsible?: boolean
    /** Its menu is open: the chip keeps the hover surface. */
    open?: boolean
  }>(),
  {
    suffix: '',
    danger: false,
    icon: '',
    disabled: false,
    collapsible: false,
    open: false
  }
)

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
    type="button"
    class="ComposerChip"
    :class="{
      'is-danger': danger,
      'is-open': open,
      'has-icon': !!icon || !!$slots.icon,
      'has-trailing': !!$slots.trailing,
      'is-collapsible': collapsible
    }"
    :aria-disabled="disabled || undefined"
    @click="onClick"
  >
    <span v-if="icon || $slots.icon" class="ComposerChip-Icon" aria-hidden="true">
      <slot name="icon"><span :class="icon" /></slot>
    </span>
    <span class="ComposerChip-Text">
      <span class="ComposerChip-Label">{{ label }}</span>
      <span v-if="suffix" class="ComposerChip-Suffix">· {{ suffix }}</span>
    </span>
    <slot name="trailing" />
  </button>
</template>

<style lang="scss" scoped>
/*
 * Ink on the composer (WCAG 2): the label in the regular ink, the icon a glyph in the secondary
 * one; `danger` uses the shell's own danger token, which re-points under `html.contrast`. The
 * suffix mixes the secondary grey half-way to the regular ink — the plain secondary measured under
 * 4.5:1 for 13px text on the hover surface.
 */
.ComposerChip {
  --composer-chip-ink: var(--shell-text-regular);
  --composer-chip-glyph: var(--shell-text-secondary);

  display: inline-flex;
  flex: none;
  position: relative;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  max-width: 220px;
  height: 32px;
  margin: 0;
  padding: 0 11px;
  overflow: hidden;
  border: 0;
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--composer-chip-ink);
  font: inherit;
  font-size: var(--shell-fs-body);
  font-weight: 500;
  line-height: 18px;
  white-space: nowrap;
  cursor: pointer;
  appearance: none;

  // The glyph carries its own side bearings, so the icon side sits tighter.
  &.has-icon {
    padding-left: 9px;
  }

  &.has-trailing {
    padding-right: 8px;
  }

  // Immediate: a hover is a sub-100ms interaction and never eases.
  &:hover:not([aria-disabled='true']),
  &.is-open {
    background: var(--shell-surface-2);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 2px;
  }

  &[aria-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.5;
  }

  &.is-danger {
    --composer-chip-ink: var(--shell-danger);
    --composer-chip-glyph: var(--shell-danger);
  }
}

// A fixed square, so a glyph change never moves the label.
.ComposerChip-Icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  color: var(--composer-chip-glyph);
  font-size: 15px;
  line-height: 1;
}

.ComposerChip-Text {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.ComposerChip-Label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.ComposerChip-Suffix {
  flex: none;
  color: color-mix(in srgb, var(--shell-text-secondary) 50%, var(--shell-text-regular));
  font-weight: 400;
}

// The right panel or a narrow window reduces the composer itself, so the query is the toolbar's
// real width, not the viewport's. The label stays in the accessible name.
@container home-composer-tools (max-width: 520px) {
  .ComposerChip.is-collapsible {
    justify-content: center;
    width: 32px;
    padding-inline: 0;
  }

  .ComposerChip.is-collapsible .ComposerChip-Text {
    display: none;
  }
}
</style>
