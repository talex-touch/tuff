<script setup lang="ts">
import type { MarkdownViewProps } from './types'
import { marked } from 'marked'
import { computed, onMounted, ref } from 'vue'

defineOptions({
  name: 'TxMarkdownView',
})

const props = withDefaults(defineProps<MarkdownViewProps>(), {
  sanitize: true,
})

marked.setOptions({
  gfm: true,
  breaks: true,
})

const sanitizer = ref<null | ((html: string) => string)>(null)

onMounted(async () => {
  if (!props.sanitize)
    return

  try {
    const mod = await import('dompurify')
    const dp = mod.default
    sanitizer.value = (html: string) => dp.sanitize(html)
  }
  catch {
    sanitizer.value = null
  }
})

const rawHtml = computed(() => {
  return marked.parse(props.content ?? '') as string
})

const safeHtml = computed(() => {
  if (!props.sanitize)
    return rawHtml.value
  return sanitizer.value ? sanitizer.value(rawHtml.value) : rawHtml.value
})
</script>

<template>
  <div class="tx-markdown-view" v-html="safeHtml" />
</template>

<style scoped lang="scss">
.tx-markdown-view {
  color: var(--tx-text-color-primary, #111827);
  font-size: 13px;
  line-height: 1.65;
}

.tx-markdown-view :deep(p) {
  margin: 0.5em 0;
}

.tx-markdown-view :deep(a) {
  color: var(--tx-color-primary, #409eff);
  text-decoration: none;
}

.tx-markdown-view :deep(a:hover) {
  text-decoration: underline;
}

.tx-markdown-view :deep(pre) {
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 70%, transparent);
  overflow: auto;
}

.tx-markdown-view :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
}

.tx-markdown-view :deep(:not(pre) > code) {
  padding: 2px 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 85%, transparent);
}

.tx-markdown-view :deep(blockquote) {
  margin: 0.75em 0;
  padding: 8px 12px;
  border-left: 3px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 65%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 55%, transparent);
}

.tx-markdown-view :deep(ul),
.tx-markdown-view :deep(ol) {
  padding-left: 1.25em;
  margin: 0.5em 0;
}

.tx-markdown-view :deep(h1),
.tx-markdown-view :deep(h2),
.tx-markdown-view :deep(h3) {
  margin: 0.8em 0 0.4em;
  line-height: 1.25;
}
</style>
