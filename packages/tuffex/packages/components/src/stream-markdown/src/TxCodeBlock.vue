<script setup lang="ts">
import { ref, watch } from 'vue'
import TxCopyButton from '../../copy-button/src/TxCopyButton.vue'
import { highlightToHtml } from './shiki-runtime'

defineOptions({ name: 'TxCodeBlock' })

const props = withDefaults(
  defineProps<{
    lang?: string
    code?: string
    /** False only for the still-growing tail fence of a live stream. */
    closed?: boolean
    streaming?: boolean
    theme?: 'light' | 'dark'
  }>(),
  {
    lang: '',
    code: '',
    closed: true,
    streaming: false,
    theme: 'light',
  },
)

/**
 * Shiki output for the current (code, theme); null renders the escaped
 * plain-text fallback. Highlighting is a pure async enhancement: the plain
 * rendering is always correct, colour arrives when it arrives.
 */
const highlighted = ref<string | null>(null)
let requestToken = 0

watch(
  [() => props.code, () => props.closed, () => props.theme, () => props.lang],
  () => {
    // Streaming tail stays plain — re-tokenizing a growing fence every delta
    // buys nothing and burns the frame budget.
    if (!props.closed || !props.lang) {
      requestToken += 1
      highlighted.value = null
      return
    }

    const token = ++requestToken
    void highlightToHtml(props.code, props.lang, props.theme).then((html) => {
      // A newer request (or a reopen) superseded this one while it was in flight.
      if (token === requestToken)
        highlighted.value = html
    })
  },
  { immediate: true },
)
</script>

<template>
  <div class="tx-code-block" :class="theme" :data-lang="lang || undefined">
    <div class="tx-code-block__header">
      <span class="tx-code-block__lang">{{ lang || 'text' }}</span>
      <TxCopyButton :text="code" size="sm" class="tx-code-block__copy" />
    </div>

    <!-- Shiki output is generated markup with the code text already escaped —
         nothing user-controlled lands here unescaped. -->
    <div v-if="highlighted" class="tx-code-block__body" v-html="highlighted" />
    <pre v-else class="tx-code-block__body tx-code-block__plain"><code>{{ code }}</code></pre>
  </div>
</template>

<style lang="scss">
.tx-code-block {
  margin: 16px 0;
  border: 1px solid var(--tx-border-color-light, #e4e7ed);
  border-radius: 8px;
  background: var(--tx-fill-color-darker, #f6f8fa);
  overflow: hidden;

  .tx-code-block__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 4px 14px;
    border-bottom: 1px solid var(--tx-border-color-light, #e4e7ed);
  }

  .tx-code-block__lang {
    color: var(--tx-text-color-secondary, #6b7280);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  // Beats the `.markdown-body pre` typography rules on specificity, so the
  // host document's code styling never double-frames the block.
  .tx-code-block__body,
  .tx-code-block__body pre,
  pre.tx-code-block__plain {
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
  }

  .tx-code-block__body pre,
  pre.tx-code-block__plain {
    padding: 14px 16px;
    overflow-x: auto;

    code {
      display: block;
      padding: 0;
      border-radius: 0;
      background: transparent;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre;
    }
  }

  &.dark {
    border-color: var(--tx-border-color, #414243);
    background: var(--tx-fill-color-darker, #1a1a1a);

    .tx-code-block__header {
      border-bottom-color: var(--tx-border-color, #414243);
    }
  }
}
</style>
