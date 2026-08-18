<script setup lang="ts">
import type { BadgeProps } from './types'
import NumberFlow from '@number-flow/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'

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

// Numeric values animate through NumberFlow; strings render as plain text.
const slots = useSlots()
const numericValue = computed(() => (typeof props.value === 'number' ? props.value : null))
const isNumeric = computed(() => numericValue.value !== null && !slots.default)
const numericContentRef = ref<HTMLElement | null>(null)
const numericWidth = ref<number | undefined>()
let numericWidthObserver: ResizeObserver | null = null

const numericStyle = computed(() => numericWidth.value === undefined
  ? {}
  : { width: `${numericWidth.value}px` })

function measureNumericWidth() {
  const width = numericContentRef.value?.getBoundingClientRect().width
  if (width)
    numericWidth.value = width
}

function observeNumericWidth() {
  if (!isNumeric.value || !numericContentRef.value || typeof ResizeObserver === 'undefined')
    return

  numericWidthObserver = new ResizeObserver(entries => {
    const width = entries[0]?.contentRect.width
    if (width)
      numericWidth.value = width
  })
  numericWidthObserver.observe(numericContentRef.value)
  measureNumericWidth()
}

watch(numericValue, async () => {
  await nextTick()
  measureNumericWidth()
})

onMounted(observeNumericWidth)
onBeforeUnmount(() => numericWidthObserver?.disconnect())

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
    :style="[customStyle, numericStyle]"
  >
    <span v-if="dot" class="tx-badge__dot" />
    <slot v-else>
      <span v-if="numericValue !== null" ref="numericContentRef" class="tx-badge__number">
        <NumberFlow :value="numericValue" />
      </span>
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

.tx-badge--default {
  --tx-badge-bg: #f3f4f6;
  --tx-badge-text: #374151;
  --tx-badge-border: transparent;
}

.tx-badge--primary {
  --tx-badge-bg: #dbeafe;
  --tx-badge-text: #1d4ed8;
  --tx-badge-border: #3b82f6;
}

.tx-badge--success {
  --tx-badge-bg: #d1fae5;
  --tx-badge-text: #065f46;
  --tx-badge-border: #22c55e;
}

.tx-badge--warning {
  --tx-badge-bg: #fed7aa;
  --tx-badge-text: #92400e;
  --tx-badge-border: #f59e0b;
}

.tx-badge--error {
  --tx-badge-bg: #fee2e2;
  --tx-badge-text: #991b1b;
  --tx-badge-border: #ef4444;
}

.tx-badge--numeric {
  box-sizing: content-box;
  overflow: clip;
  transition:
    width 180ms cubic-bezier(0.22, 1, 0.36, 1),
    transform var(--tx-badge-pop-dur, 500ms) var(--tx-badge-pop-ease, cubic-bezier(0.34, 1.36, 0.64, 1)),
    opacity var(--tx-badge-fade-dur, 400ms) var(--tx-badge-pop-ease, cubic-bezier(0.34, 1.36, 0.64, 1)),
    filter var(--tx-badge-pop-dur, 500ms) var(--tx-badge-pop-ease, cubic-bezier(0.34, 1.36, 0.64, 1));
}

.tx-badge__number {
  display: block;
  min-width: max-content;
}

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
