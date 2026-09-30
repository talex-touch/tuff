<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useGalleryLoop } from './use-gallery-loop'

const props = defineProps<{
  markdown: string
}>()

// The resting state is the finished answer, which is also all a reader who
// asks for reduced motion sees.
const content = ref(props.markdown)
const streaming = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

// Uneven bursts, as a model sends them; the component reveals what arrives,
// block by block, with the caret riding the write head.
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

useGalleryLoop(play, 7500, 600)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="docs-gallery__stream-markdown">
    <TxStreamMarkdown :content="content" :streaming="streaming" />
  </div>
</template>

<style scoped>
.docs-gallery__stream-markdown {
  width: 100%;
  max-width: 17rem;
  /* The finished answer's height, held so the cell never jumps while it streams. */
  min-height: 10.5rem;
}

/* The gallery stage zeroes list padding for its own specimens, which pushes a
   Markdown list's bullets outside the box; the answer's lists keep theirs. */
.docs-gallery__stream-markdown :deep(.markdown-body ul),
.docs-gallery__stream-markdown :deep(.markdown-body ol) {
  padding-left: 1.4em;
}
</style>
