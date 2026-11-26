<script setup lang="ts">
import { computed } from 'vue'
import { highlightCodeToHtml } from '~/utils/highlight'

const props = withDefaults(defineProps<{
  code?: string
  lang?: string
  maxHeight?: number
}>(), {
  code: '',
  lang: 'typescript',
  maxHeight: 240,
})

const resolvedLang = computed(() => props.lang.trim().toLowerCase() || 'plaintext')
const renderedHtml = computed(() => highlightCodeToHtml(props.code, resolvedLang.value))
</script>

<template>
  <div class="doc-code-renderer">
    <TxCard
      variant="plain"
      shadow="none"
      :radius="10"
      :padding="0"
      class="doc-code-renderer__card"
    >
      <pre class="doc-code-renderer__pre" :style="{ maxHeight: `${props.maxHeight}px` }">
        <code
          class="doc-code-renderer__code hljs"
          :class="`language-${resolvedLang}`"
          data-highlighted="true"
          v-html="renderedHtml"
        />
      </pre>
    </TxCard>
  </div>
</template>

<style scoped>
.doc-code-renderer {
  --tuff-code-surface: var(--tx-fill-color-light, #f6f8fa);
  --tuff-code-border: var(--tx-border-color-lighter, #d1d5db);
  --tuff-code-ink: var(--tx-text-color-primary, #1f2328);
  --tuff-code-keyword: #d73a49;
  --tuff-code-title: #6f42c1;
  --tuff-code-attr: #005cc5;
  --tuff-code-string: #032f62;
  --tuff-code-builtin: #e36209;
  --tuff-code-comment: #6a737d;
  --tuff-code-tag: #22863a;

  width: 100%;
}

:global(.dark .doc-code-renderer),
:global([data-theme='dark'] .doc-code-renderer) {
  --tuff-code-surface: rgba(16, 14, 12, 0.96);
  --tuff-code-border: rgba(255, 255, 255, 0.1);
  --tuff-code-ink: rgba(255, 255, 255, 0.94);
  --tuff-code-keyword: #ff7b72;
  --tuff-code-title: #d2a8ff;
  --tuff-code-attr: #79c0ff;
  --tuff-code-string: #a5d6ff;
  --tuff-code-builtin: #ffa657;
  --tuff-code-comment: #8b949e;
  --tuff-code-tag: #7ee787;
}

.doc-code-renderer__pre {
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border-radius: 10px;
  background: var(--tuff-code-surface);
  color: var(--tuff-code-ink);
}

.doc-code-renderer__card {
  border: 1px solid var(--tuff-code-border);
}

.doc-code-renderer__code {
  display: block;
  min-width: 0;
  background: transparent !important;
  color: var(--tuff-code-ink);
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.52;
  white-space: pre;
}

.doc-code-renderer__code :deep(:is(.hljs-keyword, .hljs-doctag, .hljs-template-tag, .hljs-template-variable, .hljs-type, .hljs-variable.language_)) {
  color: var(--tuff-code-keyword);
}

.doc-code-renderer__code :deep(.hljs-title) {
  color: var(--tuff-code-title);
}

.doc-code-renderer__code :deep(:is(.hljs-attr, .hljs-attribute, .hljs-literal, .hljs-meta, .hljs-number, .hljs-operator, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id, .hljs-variable)) {
  color: var(--tuff-code-attr);
}

.doc-code-renderer__code :deep(:is(.hljs-string, .hljs-regexp)) {
  color: var(--tuff-code-string);
}

.doc-code-renderer__code :deep(:is(.hljs-built_in, .hljs-symbol)) {
  color: var(--tuff-code-builtin);
}

.doc-code-renderer__code :deep(:is(.hljs-comment, .hljs-code, .hljs-formula)) {
  color: var(--tuff-code-comment);
}

.doc-code-renderer__code :deep(:is(.hljs-name, .hljs-quote, .hljs-selector-pseudo, .hljs-selector-tag)) {
  color: var(--tuff-code-tag);
}
</style>
