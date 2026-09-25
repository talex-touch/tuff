<script lang="ts" name="MetaHintBadge" setup>
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { computed } from 'vue'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { mainWindowCommandChordLabel } from '~/modules/shortcuts/main-window-command-catalog'
import { mainWindowHintsVisible } from '~/modules/shortcuts/main-window-shortcuts'

/**
 * The key that runs a control, drawn while the command key is held.
 *
 * Placed *inside* the control it belongs to, so the hint sits where the user is already looking —
 * a shortcut sheet at the other end of the window teaches a key and nothing about what it does.
 *
 * The badge takes a placement rather than coordinates: its host is a positioned element of some
 * size, and the four cases that exist (a row's trailing edge, a square button's outside edge, a
 * control on the window's bottom edge, a button in a drag-region bar) are a naming problem, not a
 * layout one. Callers `position: relative` their anchor; `inline` needs no host at all.
 */
const props = withDefaults(
  defineProps<{
    /** Command id from the catalog — the chord is read there, never written at the call site. */
    command: string
    placement?: 'inline' | 'trailing' | 'below' | 'above'
  }>(),
  { placement: 'inline' }
)

const { isMac } = useRendererPlatform()

const chord = computed(() => mainWindowCommandChordLabel(props.command, isMac.value))
</script>

<template>
  <Transition name="meta-hint">
    <!-- Decorative: the control's own label already says what it does, and this only restates the
         key. Announcing it again would make every control in the window read twice. -->
    <span
      v-if="mainWindowHintsVisible && chord"
      class="MetaHintBadge"
      :class="`MetaHintBadge--${placement}`"
      aria-hidden="true"
    >
      <TxKbd class="MetaHintBadge-Key">{{ chord }}</TxKbd>
    </span>
  </Transition>
</template>

<style lang="scss" scoped>
.MetaHintBadge {
  display: inline-flex;
  // The hint floats over whatever is beneath it; it must never eat a click meant for the control.
  pointer-events: none;
  z-index: 3;
}

.MetaHintBadge--trailing {
  position: absolute;
  top: 50%;
  right: 6px;
  translate: 0 -50%;
}

/** Outside the anchor's trailing edge, above it — for a control on the window's bottom edge. */
.MetaHintBadge--above {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  translate: -50% 0;
}

.MetaHintBadge--below {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  translate: -50% 0;
}

/**
 * The chip is a resting chip, not a second interactive surface: it keeps TxKbd's own look and only
 * fades, so holding and releasing the key reads as the hint appearing rather than the layout moving.
 */
.MetaHintBadge-Key {
  box-shadow: 0 2px 8px var(--shell-shadow);
}

.meta-hint-enter-active {
  transition: opacity 120ms ease-out;
}

.meta-hint-leave-active {
  transition: opacity 90ms ease-in;
}

.meta-hint-enter-from,
.meta-hint-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .meta-hint-enter-active,
  .meta-hint-leave-active {
    transition: none;
  }
}
</style>
