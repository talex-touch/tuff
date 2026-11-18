<script setup lang="ts">
import type { TxAiCodeBlockProps } from '../../types'
import { computed, onBeforeUnmount, ref } from 'vue'

defineOptions({
  name: 'TxAiCodeBlock',
})

const props = withDefaults(defineProps<TxAiCodeBlockProps>(), {
  language: '',
  title: '',
  copyable: true,
  copyLabel: 'Copy',
  copiedLabel: 'Copied',
})

const copied = ref(false)
let resetTimer: number | null = null
const label = computed(() => props.title || props.language || 'code')

function clearResetTimer() {
  if (resetTimer !== null) {
    window.clearTimeout(resetTimer)
    resetTimer = null
  }
}

onBeforeUnmount(clearResetTimer)

async function copyCode() {
  if (!props.copyable || typeof navigator === 'undefined' || !navigator.clipboard)
    return

  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    clearResetTimer()
    resetTimer = window.setTimeout(() => {
      copied.value = false
      resetTimer = null
    }, 1200)
  }
  catch {
    copied.value = false
  }
}
</script>

<template>
  <figure class="tx-ai-code-block">
    <figcaption class="tx-ai-code-block__header">
      <span class="tx-ai-code-block__label">{{ label }}</span>
      <slot name="actions" :copy="copyCode" :copied="copied">
        <button
          v-if="copyable"
          type="button"
          class="tx-ai-code-block__copy"
          :aria-label="copied ? copiedLabel : copyLabel"
          @click="copyCode"
        >
          {{ copied ? copiedLabel : copyLabel }}
        </button>
      </slot>
    </figcaption>
    <pre class="tx-ai-code-block__pre"><code :class="language ? `language-${language}` : undefined">{{ code }}</code></pre>
  </figure>
</template>
