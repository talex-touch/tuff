<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

defineOptions({
  name: 'TxCopyButton',
})

const props = withDefaults(
  defineProps<{
    text?: string
    copyLabel?: string
    copiedLabel?: string
    disabled?: boolean
    timeout?: number
    size?: 'sm' | 'md'
  }>(),
  {
    text: '',
    copyLabel: 'Copy',
    copiedLabel: 'Copied',
    disabled: false,
    timeout: 1400,
    size: 'sm',
  },
)

const emit = defineEmits<{
  copy: [text: string]
  error: [error: unknown]
}>()

const copied = ref(false)
const copying = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | undefined

const buttonLabel = computed(() => copied.value ? props.copiedLabel : props.copyLabel)

function resetCopied() {
  if (resetTimer)
    clearTimeout(resetTimer)
  resetTimer = setTimeout(() => {
    copied.value = false
  }, props.timeout)
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok)
    throw new Error('Copy command failed')
}

async function handleCopy() {
  if (props.disabled || copying.value)
    return

  copying.value = true
  try {
    await writeClipboard(props.text)
    copied.value = true
    emit('copy', props.text)
    resetCopied()
  }
  catch (error) {
    emit('error', error)
  }
  finally {
    copying.value = false
  }
}

onBeforeUnmount(() => {
  if (resetTimer)
    clearTimeout(resetTimer)
})
</script>

<template>
  <button
    type="button"
    class="tx-copy-button"
    :class="[
      `tx-copy-button--${size}`,
      {
        'is-copied': copied,
        'is-copying': copying,
      },
    ]"
    :disabled="disabled || copying"
    :aria-label="buttonLabel"
    @click="handleCopy"
  >
    <span class="tx-copy-button__icon" aria-hidden="true">
      <svg v-if="copied" viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M9.55 17.5 4.8 12.75l1.4-1.4 3.35 3.35 8.25-8.25 1.4 1.4z" />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="16" height="16">
        <path fill="currentColor" d="M8 7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3v-2a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1z" />
        <path fill="currentColor" d="M5 8h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3m0 2a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1z" />
      </svg>
    </span>
    <span class="tx-copy-button__label">
      <slot :copied="copied" :copying="copying">{{ buttonLabel }}</slot>
    </span>
  </button>
</template>

<style scoped>
.tx-copy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 8px;
  background: var(--tx-bg-color, #ffffff);
  color: var(--tx-text-color-regular, #606266);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.tx-copy-button:hover:not(:disabled) {
  border-color: var(--tx-color-primary, #409eff);
  color: var(--tx-color-primary, #409eff);
  background: var(--tx-color-primary-light-9, #ecf5ff);
}

.tx-copy-button:active:not(:disabled) {
  transform: scale(0.98);
}

.tx-copy-button:focus-visible {
  outline: 2px solid var(--tx-color-primary-light-5, #a0cfff);
  outline-offset: 2px;
}

.tx-copy-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tx-copy-button--md {
  height: 34px;
  padding: 0 12px;
  font-size: 14px;
}

.tx-copy-button.is-copied {
  border-color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, transparent);
  color: var(--tx-color-success, #67c23a);
  background: color-mix(in srgb, var(--tx-color-success, #67c23a) 10%, transparent);
}

.tx-copy-button__icon,
.tx-copy-button__label {
  display: inline-flex;
  align-items: center;
}
</style>
