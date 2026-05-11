<script setup lang="ts">
import type { TxAiCodeBlockProps } from '../../types'
import { computed, ref } from 'vue'

defineOptions({
  name: 'TxAiCodeBlock',
})

const props = withDefaults(defineProps<TxAiCodeBlockProps>(), {
  language: '',
  title: '',
  copyable: true,
})

const copied = ref(false)
const label = computed(() => props.title || props.language || 'code')

async function copyCode() {
  if (!props.copyable || typeof navigator === 'undefined' || !navigator.clipboard)
    return

  await navigator.clipboard.writeText(props.code)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1200)
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
          @click="copyCode"
        >
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
      </slot>
    </figcaption>
    <pre class="tx-ai-code-block__pre"><code :class="language ? `language-${language}` : undefined">{{ code }}</code></pre>
  </figure>
</template>
