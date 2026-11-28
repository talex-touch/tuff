<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useGalleryLoop } from './use-gallery-loop'

const props = defineProps<{
  text: string
}>()

// The resting state is the finished sentence, which is also all a reader who
// asks for reduced motion sees.
const content = ref(props.text)
const streaming = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

// Uneven bursts, as a model sends them; the component turns them into a steady
// word-by-word flow.
function play() {
  clearTimeout(timer)
  const source = props.text
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

useGalleryLoop(play, 6500, 500)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <p class="docs-gallery__stream-text">
    <TxStreamText :content="content" :streaming="streaming" />
  </p>
</template>

<style scoped>
.docs-gallery__stream-text {
  max-width: 17rem;
  min-height: 5.1em;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--tx-text-color-primary);
}
</style>
