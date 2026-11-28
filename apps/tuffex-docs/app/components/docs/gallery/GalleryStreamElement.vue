<script setup lang="ts">
import type { AiSourceItem } from '@talex-touch/tuffex/ai-elements'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  markdown: string
  sources: AiSourceItem[]
  locale: string
}>()

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
  // Start with an immediate first burst so the stage never flashes completely blank.
  let index = Math.min(source.length, 4)
  content.value = source.slice(0, index)
  streaming.value = true
  const tick = () => {
    index = Math.min(source.length, index + 3 + Math.floor(Math.random() * 5))
    content.value = source.slice(0, index)
    if (index >= source.length) {
      streaming.value = false
      return
    }
    timer = setTimeout(tick, 32 + Math.random() * 40)
  }
  timer = setTimeout(tick, 50)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="docs-gallery__stream-card docs-gallery__stream-element">
    <div class="docs-gallery__stream-head">
      <span class="docs-gallery__stream-status" :class="{ 'is-live': streaming }">
        <TxStreamCaret v-if="streaming" state="streaming" />
        <span v-else class="docs-gallery__stream-dot" aria-hidden="true" />
        <span>{{ streaming ? (zh ? '流式输出中' : 'Streaming') : (zh ? '已完成' : 'Settled') }}</span>
      </span>
      <button type="button" class="docs-gallery__stream-btn" @click="replay">
        <span class="i-carbon-reset" aria-hidden="true" />
        <span>{{ zh ? '重播' : 'Replay' }}</span>
      </button>
    </div>
    <div class="docs-gallery__stream-body">
      <TxStreamElement :content="content" :streaming="streaming" :sources="sources" :locale="locale" />
    </div>
  </div>
</template>

<style scoped>
.docs-gallery__stream-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  border-radius: 14px;
  background: var(--tx-bg-color, #fff);
  box-shadow: inset 0 0 0 1px var(--docs-gallery-line);
  overflow: hidden;
}

.docs-gallery__stream-element {
  max-width: 21rem;
  font-size: 13px;
}

.docs-gallery__stream-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 12px;
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
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--docs-gallery-line);
  border-radius: 7px;
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

.docs-gallery__stream-body {
  min-height: 6.4rem;
  padding: 11px 13px 12px;
}

/* The gallery stage zeroes list padding for its own specimens; the answer's lists keep theirs. */
.docs-gallery__stream-element :deep(.tx-stream-element) {
  font-size: 13px;
  line-height: 1.6;
}

.docs-gallery__stream-element :deep(.tx-stream-element ul),
.docs-gallery__stream-element :deep(.tx-stream-element ol) {
  padding-left: 1.4em;
}
</style>
