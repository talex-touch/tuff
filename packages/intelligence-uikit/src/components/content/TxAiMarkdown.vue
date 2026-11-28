<script setup lang="ts">
import type { TxAiMarkdownProps } from '../../types'
import { TxStreamMarkdown } from '@talex-touch/tuffex/stream-markdown'
import { ref, watch } from 'vue'
import TxAiReveal from '../foundation/TxAiReveal.vue'

defineOptions({
  name: 'TxAiMarkdown',
})

const props = withDefaults(defineProps<TxAiMarkdownProps>(), {
  sanitize: true,
  theme: 'auto',
  streaming: false,
  reveal: true,
})

// Keep pacing active after a live stream completes so trailing buffered words drain smoothly
// instead of snapping in all at once; already-complete historical turns stay unpaced.
const hasStreamed = ref(Boolean(props.streaming))
watch(
  () => props.streaming,
  (isStreaming) => {
    if (isStreaming) {
      hasStreamed.value = true
    }
  },
)

// `TxStreamMarkdown`, not `TxMarkdownView`: it re-lexes the content into blocks with
// stable ids, so a stream chunk patches only the growing tail instead of replacing the
// whole `v-html` body. `TxMarkdownView` re-ran every node on every chunk, which is what
// made a streamed message read as a stutter rather than a flow.
</script>

<template>
  <TxAiReveal v-if="reveal" class="tx-ai-markdown" :class="{ 'is-streaming': streaming }" motion="fade" :duration="180">
    <TxStreamMarkdown
      :content="content"
      :streaming="streaming"
      :paced="streaming || hasStreamed"
      :sanitize="sanitize"
      :theme="theme"
      reveal="blur"
    />
  </TxAiReveal>
  <TxStreamMarkdown
    v-else
    class="tx-ai-markdown"
    :class="{ 'is-streaming': streaming }"
    :content="content"
    :streaming="streaming"
    :paced="streaming || hasStreamed"
    :sanitize="sanitize"
    :theme="theme"
    reveal="blur"
  />
</template>
