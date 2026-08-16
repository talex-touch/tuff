<script setup lang="ts">
// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.
import type { CellLinkEmits, CellLinkProps } from './types'
import { computed } from 'vue'

defineOptions({ name: 'TxCellLink' })

const props = withDefaults(defineProps<CellLinkProps>(), {
  external: false,
  muted: false,
  underline: 'hover',
})

const emit = defineEmits<CellLinkEmits>()

defineSlots<{
  /** Replaces the link text. */
  default?: () => any
}>()

const text = computed(() => props.label ?? props.href)

function onClick(event: MouseEvent): void {
  event.preventDefault()
  emit('open', { href: props.href, event })
}
</script>

<template>
  <a
    class="tx-bui-cell-link"
    :class="[
      `is-underline-${underline}`,
      { 'is-muted': muted, 'is-external': external },
    ]"
    :href="href"
    :aria-label="ariaLabel"
    @click="onClick"
  >
    <span class="tx-bui-cell-link__text">
      <slot>{{ text }}</slot>
    </span>
    <span v-if="external" class="tx-bui-cell-link__arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 17 17 7M9 7h8v8" />
      </svg>
    </span>
  </a>
</template>

<style lang="scss">
.tx-bui-cell-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  max-width: 100%;
  font-size: 12.5px;
  color: var(--tx-bui-accent-ink, #0170dd);
  text-decoration-line: none;
  text-underline-offset: 3px;
  transition:
    color 0.12s ease-out,
    text-decoration-color 0.12s ease-out;

  &.is-muted {
    color: var(--tx-bui-ink, #1f2124);
    font-weight: 500;
  }

  // The permanent underline is tinted down to 35% so a dense column of links
  // does not read as a block of rules.
  &.is-underline-always {
    text-decoration-line: underline;
    text-decoration-color: color-mix(in oklab, currentColor 35%, transparent);
  }

  &:hover,
  &:focus-visible {
    text-decoration-line: underline;
    text-decoration-color: currentColor;
  }

  &:hover {
    color: var(--tx-bui-ink, #1f2124);
  }

  &.is-muted:hover {
    color: var(--tx-bui-accent-ink, #0170dd);
  }

  &:focus-visible {
    outline: 2px solid var(--tx-bui-accent, #0285ff);
    outline-offset: 2px;
    border-radius: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.tx-bui-cell-link__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-bui-cell-link__arrow {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--tx-bui-ink-3, #9a9da3);
}

.tx-bui-cell-link:hover .tx-bui-cell-link__arrow,
.tx-bui-cell-link:focus-visible .tx-bui-cell-link__arrow {
  color: inherit;
}
</style>
