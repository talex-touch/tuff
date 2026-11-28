<script setup lang="ts">
import type { AiSourceItem } from '@talex-touch/tuffex/ai-elements'
import { onBeforeUnmount, ref } from 'vue'
import { useGalleryLoop } from './use-gallery-loop'

const props = defineProps<{
  markdown: string
  sources: AiSourceItem[]
  locale: string
}>()

// The resting state is the finished answer, which is also all a reader who
// asks for reduced motion sees.
const content = ref(props.markdown)
const streaming = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

// Uneven bursts, as a model sends them; the element paces text, chip and list
// on one clock.
function play() {
  clearTimeout(timer)
  const source = props.markdown
  let index = 0
  content.value = ''
  streaming.value = true
  const tick = () => {
    index = Math.min(source.length, index + 2 + Math.floor(Math.random() * 5))
    content.value = source.slice(0, index)
    if (index >= source.length) {
      streaming.value = false
      return
    }
    timer = setTimeout(tick, 40 + Math.random() * 60)
  }
  timer = setTimeout(tick, 120)
}

useGalleryLoop(play, 7500, 700)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="docs-gallery__stream-element">
    <TxStreamElement :content="content" :streaming="streaming" :sources="sources" :locale="locale" />
  </div>
</template>

<style scoped>
.docs-gallery__stream-element {
  width: 100%;
  max-width: 17rem;
  /* The finished answer's height (the English one, the taller), held so the cell never jumps while it streams. */
  min-height: 6.75rem;
  font-size: 13px;
}

/* The gallery stage zeroes list padding for its own specimens; the answer's lists keep theirs. */
.docs-gallery__stream-element :deep(.tx-stream-element ul),
.docs-gallery__stream-element :deep(.tx-stream-element ol) {
  padding-left: 1.4em;
}
</style>
