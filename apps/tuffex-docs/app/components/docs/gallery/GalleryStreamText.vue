<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  text: string
  locale?: string
}>(), {
  locale: 'zh',
})

const zh = computed(() => props.locale.startsWith('zh'))
const content = ref(props.text)
const streaming = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.text,
  (next) => {
    clearTimeout(timer)
    streaming.value = false
    content.value = next
  },
)

function replay() {
  clearTimeout(timer)
  const source = props.text
  if (!source)
    return
  let index = Math.min(source.length, 4)
  content.value = source.slice(0, index)
  streaming.value = true
  const tick = () => {
    index = Math.min(source.length, index + 3 + Math.floor(Math.random() * 4))
    content.value = source.slice(0, index)
    if (index >= source.length) {
      streaming.value = false
      return
    }
    timer = setTimeout(tick, 32 + Math.random() * 38)
  }
  timer = setTimeout(tick, 50)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="docs-gallery__stream-card docs-gallery__stream-text-card">
    <div class="docs-gallery__stream-head">
      <span class="docs-gallery__stream-status" :class="{ 'is-live': streaming }">
        <TxStreamCaret state="streaming" />
        <span>{{ streaming ? (zh ? '逐词流出' : 'Streaming') : (zh ? '含流式光标' : 'With caret') }}</span>
      </span>
      <button type="button" class="docs-gallery__stream-btn" @click="replay">
        <span class="i-carbon-reset" aria-hidden="true" />
        <span>{{ zh ? '重播' : 'Replay' }}</span>
      </button>
    </div>
    <p class="docs-gallery__stream-text">
      <TxStreamText :content="content" :streaming="streaming" :locale="locale" />
    </p>
  </div>
</template>

<style scoped>
.docs-gallery__stream-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 21rem;
  border-radius: 14px;
  background: var(--tx-bg-color, #fff);
  box-shadow: inset 0 0 0 1px var(--docs-gallery-line);
  overflow: hidden;
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

.docs-gallery__stream-text {
  min-height: 4.8em;
  margin: 0;
  padding: 12px 13px 13px;
  font-size: 13px;
  line-height: 1.68;
  color: var(--tx-text-color-primary);
}
</style>
