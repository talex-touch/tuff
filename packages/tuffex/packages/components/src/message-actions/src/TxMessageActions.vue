<script setup lang="ts">
import { ref } from 'vue'

defineOptions({ name: 'TxMessageActions' })

const props = withDefaults(
  defineProps<{
    /** Enables the built-in copy button and is what it writes. */
    copyText?: string
    /** Shows the regenerate button. */
    regenerable?: boolean
    /** Play the slow blur-fade entrance on mount. @default true */
    appear?: boolean
    copyLabel?: string
    copiedLabel?: string
    regenerateLabel?: string
  }>(),
  {
    regenerable: false,
    appear: true,
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    regenerateLabel: 'Regenerate',
  },
)

const emit = defineEmits<{
  copy: [text: string]
  regenerate: []
}>()

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copy(): Promise<void> {
  const text = props.copyText
  if (!text || copied.value)
    return
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    // Clipboard can be denied (permissions policy); the emit still lets the
    // host route the copy through its own channel.
  }
  emit('copy', text)
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1200)
}
</script>

<template>
  <div class="tx-message-actions" :class="{ 'has-appear': appear }" role="toolbar">
    <button
      v-if="copyText !== undefined"
      type="button"
      class="tx-message-actions__btn"
      :class="{ 'is-copied': copied }"
      :title="copied ? copiedLabel : copyLabel"
      :aria-label="copied ? copiedLabel : copyLabel"
      @click="copy"
    >
      <svg v-if="copied" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <path d="m4.5 12.5 5 5 10-11" />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V6a2 2 0 0 1 2-2h9" />
      </svg>
    </button>

    <button
      v-if="regenerable"
      type="button"
      class="tx-message-actions__btn"
      :title="regenerateLabel"
      :aria-label="regenerateLabel"
      @click="emit('regenerate')"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 11a8 8 0 1 0-2.3 6.3" />
        <path d="M20 5v6h-6" />
      </svg>
    </button>

    <slot />
  </div>
</template>

<style lang="scss">
.tx-message-actions {
  display: inline-flex;
  gap: 2px;
  align-items: center;

  // The bar surfaces slowly out of a blur once its message settles — asked
  // for by name; keep it languid, not snappy.
  &.has-appear {
    animation: tx-message-actions-appear 0.9s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .tx-message-actions__btn {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--tx-text-color-secondary, #6b7280);
    cursor: pointer;
    transition:
      background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
      color 0.15s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
      background: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 10%, transparent);
      color: var(--tx-text-color-primary, #111827);
    }

    &.is-copied {
      color: var(--tx-color-success, #67c23a);
    }
  }
}

@keyframes tx-message-actions-appear {
  from {
    opacity: 0;
    transform: translateY(4px);
    filter: blur(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-message-actions.has-appear {
    animation: none;
  }
}
</style>
