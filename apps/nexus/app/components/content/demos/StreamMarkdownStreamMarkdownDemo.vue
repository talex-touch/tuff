<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const SOURCE = `## Result

Sorting dominates at **O(n log n)**, so the reduce is not the bottleneck.

\`\`\`ts
export function total(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}
\`\`\`

- Guard the empty case
- Keep the iterative form
`

const content = ref(SOURCE)
const streaming = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

// Replaying shows the deferred tail fence: the code block waits for its
// closing fence instead of flashing in half-written.
function replay() {
  stop()
  streaming.value = true
  content.value = ''

  let index = 0
  timer = setInterval(() => {
    index += 4
    content.value = SOURCE.slice(0, index)
    if (index >= SOURCE.length) {
      stop()
      streaming.value = false
    }
  }, 30)
}

onBeforeUnmount(stop)
</script>

<template>
  <div class="flex flex-col gap-4">
    <button
      type="button"
      class="self-start rounded-lg border border-[var(--tx-border-color)] px-3 py-1 text-sm"
      @click="replay"
    >
      Replay stream
    </button>

    <TxStreamMarkdown :content="content" :streaming="streaming" />
  </div>
</template>
