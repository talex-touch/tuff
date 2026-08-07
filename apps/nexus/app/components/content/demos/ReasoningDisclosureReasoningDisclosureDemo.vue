<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const FULL_TEXT = [
  'Confirm the input bounds first.',
  'The list can be empty, so guard the reduce.',
  'Sorting is O(n log n) and dominates here.',
  'Pick the iterative form to keep the stack flat.',
].join('\n')

const streaming = ref(false)
const text = ref('')
const durationMs = ref<number | undefined>(undefined)
let timer: ReturnType<typeof setInterval> | undefined

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

function replay() {
  stop()
  streaming.value = true
  text.value = ''
  durationMs.value = undefined

  let index = 0
  timer = setInterval(() => {
    index += 3
    text.value = FULL_TEXT.slice(0, index)
    if (index >= FULL_TEXT.length) {
      stop()
      streaming.value = false
      durationMs.value = 4200
    }
  }, 40)
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
      Replay
    </button>

    <TxReasoningDisclosure
      :text="text || FULL_TEXT"
      :streaming="streaming"
      :duration-ms="durationMs"
      default-open
    />
  </div>
</template>
