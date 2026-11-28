<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  markdown: string
  locale?: string
}>(), {
  locale: 'zh',
})

const zh = computed(() => props.locale.startsWith('zh'))
const content = ref(props.markdown)
const streaming = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.markdown,
  (next) => {
    clearTimeout(timer)
    streaming.value = false
    content.value = next
  },
)

function replay() {
  clearTimeout(timer)
  const source = props.markdown
  if (!source)
    return
  content.value = ''
  streaming.value = true
  let index = 0
  const tick = () => {
    index = Math.min(source.length, index + 8 + Math.floor(Math.random() * 8))
    content.value = source.slice(0, index)
    if (index >= source.length) {
      streaming.value = false
      return
    }
    timer = setTimeout(tick, 36 + Math.random() * 28)
  }
  timer = setTimeout(tick, 24)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="docs-gallery__stream-card docs-gallery__stream-markdown">
    <div class="docs-gallery__stream-head">
      <span class="docs-gallery__stream-status" :class="{ 'is-live': streaming }">
        <TxStreamCaret v-if="streaming" state="streaming" />
        <span v-else class="docs-gallery__stream-dot" aria-hidden="true" />
        <span>{{ streaming ? (zh ? '分块渲染中' : 'Streaming blocks') : (zh ? '含 TxCodeBlock 围栏' : 'Markdown + TxCodeBlock') }}</span>
      </span>
      <button type="button" class="docs-gallery__stream-btn" @click="replay">
        <span class="i-carbon-reset" aria-hidden="true" />
        <span>{{ zh ? '重播' : 'Replay' }}</span>
      </button>
    </div>
    <div class="docs-gallery__stream-md-body">
      <TxStreamMarkdown
        :content="content"
        :streaming="streaming"
        :locale="locale"
        paced
        :word-ms="26"
        :copy-code-text="zh ? '复制' : 'Copy'"
        :copied-code-text="zh ? '已复制' : 'Copied'"
      />
    </div>
  </div>
</template>

<style scoped>
.docs-gallery__stream-card {
  --_pad: 10px;
  --_inner-r: 12px;

  display: flex;
  flex-direction: column;
  width: 100%;
  border-radius: calc(var(--_pad) + var(--_inner-r));
  background: var(--tx-bg-color, #fff);
  box-shadow: inset 0 0 0 1px var(--docs-gallery-line);
  overflow: hidden;
}

.docs-gallery__stream-markdown {
  max-width: 30rem;
}

.docs-gallery__stream-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: var(--_pad) var(--_pad) var(--_pad) 14px;
  border-bottom: 1px solid var(--docs-gallery-line);
  background: color-mix(in srgb, var(--docs-inline-code-bg) 56%, transparent);
}

.docs-gallery__stream-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--docs-muted);
}

.docs-gallery__stream-status.is-live {
  color: var(--tx-color-primary);
}

.docs-gallery__stream-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--tx-color-success);
}

.docs-gallery__stream-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--docs-gallery-line);
  border-radius: var(--_inner-r);
  background: var(--tx-bg-color, transparent);
  color: var(--docs-muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.16s ease, border-color 0.16s ease;
}

.docs-gallery__stream-btn:hover {
  border-color: color-mix(in srgb, var(--docs-accent) 45%, transparent);
  color: var(--docs-accent);
}

.docs-gallery__stream-md-body {
  min-height: 11.5rem;
  padding: 12px var(--_pad) var(--_pad);
}

.docs-gallery__stream-markdown :deep(.tx-stream-md) {
  font-size: 13px;
  line-height: 1.55;
}

.docs-gallery__stream-markdown :deep(.markdown-body) {
  background: transparent;
  font-size: 13px;
  line-height: 1.55;
}

.docs-gallery__stream-markdown :deep(.markdown-body h3) {
  margin: 0 0 6px;
  padding: 0 4px;
  font-size: 14px;
}

.docs-gallery__stream-markdown :deep(.markdown-body p) {
  margin: 0 0 8px;
  padding: 0 4px;
}

/* The gallery stage zeroes list padding for its own specimens, which pushes a
   Markdown list's bullets outside the box; the answer's lists keep theirs. */
.docs-gallery__stream-markdown :deep(.markdown-body ul),
.docs-gallery__stream-markdown :deep(.markdown-body ol) {
  margin: 0 0 10px;
  padding-left: 1.65em;
  padding-right: 4px;
}

.docs-gallery__stream-markdown :deep(.tx-code-block) {
  margin: 0;
}
</style>
