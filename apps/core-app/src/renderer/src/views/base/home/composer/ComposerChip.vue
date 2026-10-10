<script lang="ts" name="ComposerChip" setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  animateElement,
  COMPOSER_MOTION,
  EASE_IN,
  EASE_OUT_STRONG,
  prefersReducedMotion
} from './composer-motion'
import { useComposerPress } from './useComposerPress'

/**
 * The toolbar's chip: the permission, mode and model pills are all this. One material — no fill,
 * no ring and no tint at rest; a neutral surface under the pointer or while its menu is open, which
 * changes at once, as every colour here does.
 *
 * A value change morphs (2026-10-08, overriding `home-composer` › 换档不做变形动画 — switching modes
 * back and forth had no motion at all): the old icon and label fade out where they stood while the
 * new ones fade in, and the chip's width tweens between the two. Script-driven on WAAPI, like the
 * press, and skipped under reduced motion, where the new value lands in the same frame.
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

/** The value's own parts: the icon and the text. The trailing chevron is not part of the value. */
const FACE = ':scope > .ComposerChip-Icon, :scope > .ComposerChip-Text'

let morphs: Animation[] = []
let ghost: HTMLElement | null = null
/** Bumped by every change, so a morph whose DOM update was overtaken by a newer one stands down. */
let morphGeneration = 0

function stopMorph(): void {
  for (const animation of morphs) animation.cancel()
  morphs = []
  ghost?.remove()
  ghost = null
}

/**
 * The value on screen, as a detached copy placed where it stood. Each copied element keeps the ink
 * it was drawn in — a change to 「完全允许」 recolours the chip at once, and the leaving words must
 * not take the alarm hue on their way out. Inline styles, since a node made here carries no scope id.
 */
function copyFace(root: HTMLElement): HTMLElement | null {
  const parts = Array.from(root.querySelectorAll<HTMLElement>(FACE))
  if (!parts.length) return null
  const copy = document.createElement('span')
  copy.className = 'ComposerChip-Ghost'
  copy.setAttribute('aria-hidden', 'true')
  Object.assign(copy.style, {
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: `${parts[0]!.offsetLeft}px`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: getComputedStyle(root).columnGap || '6px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none'
  })
  for (const part of parts) {
    const clone = part.cloneNode(true) as HTMLElement
    const originals = [part, ...part.querySelectorAll<HTMLElement>('*')]
    const clones = [clone, ...clone.querySelectorAll<HTMLElement>('*')]
    originals.forEach((original, index) => {
      const ink = getComputedStyle(original).color
      if (ink && clones[index]) clones[index]!.style.color = ink
    })
    copy.append(clone)
  }
  return copy
}

/**
 * Before the new value renders: the width on screen — a morph caught halfway included, which is why
 * it is read before that morph is stopped — and a copy of the face that is about to leave. After it:
 * the copy fades out where the old value stood, the new face fades in, and the width tweens.
 */
watch(
  () => [props.label, props.suffix, props.icon],
  async () => {
    const root = rootRef.value
    if (!root || prefersReducedMotion()) {
      morphGeneration++
      stopMorph()
      return
    }
    const generation = ++morphGeneration
    const fromWidth = root.offsetWidth
    const leaving = copyFace(root)
    stopMorph()
    await nextTick()
    if (generation !== morphGeneration || rootRef.value !== root || !root.isConnected) return

    const { chip } = COMPOSER_MOTION
    const toWidth = root.offsetWidth
    if (Math.abs(toWidth - fromWidth) >= 1) {
      const resize = animateElement(
        root,
        [{ width: `${fromWidth}px` }, { width: `${toWidth}px` }],
        { duration: chip.widthMs, easing: EASE_OUT_STRONG }
      )
      if (resize) morphs.push(resize)
    }
    if (leaving) {
      root.append(leaving)
      ghost = leaving
      const out = animateElement(leaving, [{ opacity: 1 }, { opacity: 0 }], {
        duration: chip.fadeOutMs,
        easing: EASE_IN,
        fill: 'forwards'
      })
      if (out) {
        morphs.push(out)
        out.onfinish = () => {
          if (ghost === leaving) ghost = null
          leaving.remove()
        }
      } else {
        // No WAAPI to play it: nothing would ever take the copy away.
        leaving.remove()
        ghost = null
      }
    }
    for (const part of root.querySelectorAll<HTMLElement>(FACE)) {
      const arrive = animateElement(part, [{ opacity: 0 }, { opacity: 1 }], {
        duration: chip.fadeInMs,
        delay: chip.fadeInDelayMs,
        easing: EASE_OUT_STRONG,
        fill: 'backwards'
      })
      if (arrive) morphs.push(arrive)
    }
  },
  { flush: 'pre' }
)

onBeforeUnmount(stopMorph)

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
