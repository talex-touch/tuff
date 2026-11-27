<script setup lang="ts">
import { computed } from 'vue'

/**
 * Zero-CDN Lightweight CodeRenderer:
 * - Renders build-time `codeHtml` directly when provided, or clean monospace
 *   `<pre><code>` otherwise.
 * - ZERO `window.hljs` polling, ZERO jsDelivr script/stylesheet injection!
 */

const props = withDefaults(defineProps<{
  code?: string
  codeHtml?: string
  lang?: string
  maxHeight?: number
}>(), {
  code: '',
  codeHtml: '',
  lang: 'typescript',
  maxHeight: 240,
})

const resolvedLang = computed(() => props.lang.trim().toLowerCase() || 'plaintext')
const hasHtml = computed(() => Boolean(props.codeHtml?.trim()))
</script>

<template>
  <div class="doc-code-renderer not-prose">
    <div
      v-if="hasHtml"
      class="doc-code-renderer__shiki"
      :style="{ maxHeight: `${props.maxHeight}px` }"
      v-html="props.codeHtml"
    />
    <pre
      v-else
      class="doc-code-renderer__pre"
      :style="{ maxHeight: `${props.maxHeight}px` }"
    ><code class="doc-code-renderer__code" :class="`language-${resolvedLang}`" v-text="props.code" /></pre>
  </div>
</template>

<style scoped>
.doc-code-renderer {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--docs-code-border);
  background: var(--docs-code-bg);
  overflow: hidden;
}

.doc-code-renderer__pre,
.doc-code-renderer__shiki :deep(pre) {
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  background: transparent !important;
  color: var(--docs-ink);
  font-family: var(--docs-mono-font);
  font-size: 12px;
  line-height: 1.55;
}

.doc-code-renderer__shiki {
  overflow: auto;
}

.doc-code-renderer__code {
  display: block;
  white-space: pre;
  font-family: var(--docs-mono-font);
}
</style>
