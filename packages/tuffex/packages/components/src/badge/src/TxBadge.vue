<script setup lang="ts">
import type { BadgeProps } from './types'
import { computed, ref, useSlots, watch } from 'vue'
import TxTextMorph from '../../text-morph/src/TxTextMorph.vue'

defineOptions({
  name: 'TxBadge',
})

const props = withDefaults(defineProps<BadgeProps>(), {
  variant: 'default',
  value: 0,
  open: true,
})

const customStyle = computed(() => {
  if (props.color) {
    return {
      '--tx-badge-bg': props.color,
      '--tx-badge-text': '#ffffff',
      '--tx-badge-dot': props.color,
    }
  }
  return {}
})

/*
  Numeric values roll through the text-morph engine — digits slide by place value,
  so 8 -> 9 moves one column and 9 -> 10 grows the number rather than swapping it.
  Strings render as plain text.

  This used to be `@number-flow/vue` plus a ResizeObserver that measured
  `.tx-badge__number` and wrote the result back as an inline width, with a
  separate `width 180ms` transition to smooth it. All three are gone: the engine
  animates its own container on the same curve as the digits, so the pill follows
  it for free and the measurement round-trip has nothing left to do.
*/
const slots = useSlots()
const numericValue = computed(() => (typeof props.value === 'number' ? props.value : null))
const isNumeric = computed(() => numericValue.value !== null && !slots.default)

// The slide-in entrance only plays on real open/close toggles — never on
// first mount — so always-open badges stay visually unchanged.
const hasToggled = ref(false)
watch(
  () => props.open,
  () => {
    hasToggled.value = true
  },
)
</script>

<template>
  <span
    class="tx-badge" :class="[
      `tx-badge--${variant}`,
      {
        'tx-badge--numeric': isNumeric && !dot,
        'tx-badge--dot': dot,
        'is-open': open && hasToggled,
        'is-closed': !open,
      },
    ]"
    :style="customStyle"
  >
    <span v-if="dot" class="tx-badge__dot" />
    <slot v-else>
      <TxTextMorph
        v-if="numericValue !== null"
        class="tx-badge__number"
        :text="numericValue"
        :duration-ms="260"
      />
      <template v-else>
        {{ value }}
      </template>
    </slot>
  </span>
</template>

<style scoped>
.tx-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  border-radius: 9999px;
  white-space: nowrap;
  background: var(--tx-badge-bg, #f3f4f6);
  color: var(--tx-badge-text, #374151);
  border: 1px solid var(--tx-badge-border, transparent);
  transform: scale(1);
  transform-origin: center;
  opacity: 1;
  filter: blur(0);
  transition:
    transform var(--tx-badge-pop-dur, 500ms) var(--tx-badge-pop-ease, cubic-bezier(0.34, 1.36, 0.64, 1)),
    opacity var(--tx-badge-fade-dur, 400ms) var(--tx-badge-pop-ease, cubic-bezier(0.34, 1.36, 0.64, 1)),
    filter var(--tx-badge-pop-dur, 500ms) var(--tx-badge-pop-ease, cubic-bezier(0.34, 1.36, 0.64, 1));
}

/* Status variants ride the semantic tokens with the family recipe
   (12% bg / 32% border, same as TxStatusBadge) so they hold up in dark mode. */
.tx-badge--default {
  --tx-badge-bg: var(--tx-fill-color-light, #f3f4f6);
  --tx-badge-text: var(--tx-text-color-secondary, #374151);
  --tx-badge-border: transparent;
}

.tx-badge--primary {
  --tx-badge-bg: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
  --tx-badge-text: var(--tx-color-primary, #409eff);
  --tx-badge-border: color-mix(in srgb, var(--tx-color-primary, #409eff) 32%, transparent);
}

.tx-badge--success {
  --tx-badge-bg: color-mix(in srgb, var(--tx-color-success, #67c23a) 12%, transparent);
  --tx-badge-text: var(--tx-color-success, #67c23a);
  --tx-badge-border: color-mix(in srgb, var(--tx-color-success, #67c23a) 32%, transparent);
}

.tx-badge--warning {
  --tx-badge-bg: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 12%, transparent);
  --tx-badge-text: var(--tx-color-warning, #e6a23c);
  --tx-badge-border: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 32%, transparent);
}

.tx-badge--error {
  --tx-badge-bg: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 12%, transparent);
  --tx-badge-text: var(--tx-color-danger, #f56c6c);
  --tx-badge-border: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 32%, transparent);
}

/* The engine animates the number's own container on the morph curve, so the pill
   only has to keep its shape while that happens — no width transition of its own,
   and no `box-sizing: content-box`, both of which existed for the measured inline
   width this no longer writes. */
.tx-badge--numeric {
  overflow: clip;
}

/* `.tx-badge__number` is now the morph root and carries no rules of its own on
   purpose. The old `display: block; min-width: max-content` pair propped up the
   measured-width scheme, and `min-width: max-content` in particular would pin the
   root to its content and stop the engine ever animating the width down. */

.tx-badge--dot {
  width: 8px;
  height: 8px;
  padding: 0;
  min-width: 8px;
  border-radius: 50%;
}

.tx-badge__dot {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--tx-badge-dot, currentColor);
}

/* Notification-badge motion (Transitions.dev vocabulary): the entrance slides
   from the anchor offset while the pill pops from scale(0)+blur; closing pops
   out faster. The closed badge keeps its layout box. */
.tx-badge.is-open {
  animation: tx-badge-slide-in var(--tx-badge-slide-dur, 260ms) var(--tx-badge-slide-ease, cubic-bezier(0.22, 1, 0.36, 1));
}

.tx-badge.is-closed {
  transform: scale(0);
  opacity: 0;
  filter: blur(var(--tx-badge-blur, 2px));
  transition:
    transform var(--tx-badge-pop-close-dur, 180ms) var(--tx-badge-close-ease, cubic-bezier(0.4, 0, 0.2, 1)),
    opacity var(--tx-badge-fade-close-dur, 180ms) var(--tx-badge-close-ease, cubic-bezier(0.4, 0, 0.2, 1)),
    filter var(--tx-badge-pop-close-dur, 180ms) var(--tx-badge-close-ease, cubic-bezier(0.4, 0, 0.2, 1));
}

@keyframes tx-badge-slide-in {
  from {
    translate: var(--tx-badge-offset-x, -8.2px) var(--tx-badge-offset-y, 12.4px);
  }

  to {
    translate: 0 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-badge {
    animation: none;
    transition: none;
  }
}
</style>
