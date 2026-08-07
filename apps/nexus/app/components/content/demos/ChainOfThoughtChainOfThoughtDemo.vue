<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

interface Step {
  id: string
  kind: 'thinking' | 'tool'
  title: string
  body?: string
  status: 'active' | 'done' | 'error'
}

const TAIL = 'Sorting dominates at O(n log n), so the reduce is not the bottleneck.'

function seed(): Step[] {
  return [
    { id: '1', kind: 'thinking', title: 'Break the request down', body: 'Confirm the input bounds first.', status: 'done' },
    { id: '2', kind: 'tool', title: 'read_file(src/main.ts)', status: 'done' },
    { id: '3', kind: 'thinking', title: 'Work out the implementation', body: '', status: 'active' },
  ]
}

const steps = ref<Step[]>(seed())
const streaming = ref(false)
let timer: ReturnType<typeof setInterval> | undefined

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

function replay() {
  stop()
  steps.value = seed()
  streaming.value = true

  let index = 0
  timer = setInterval(() => {
    index += 3
    const last = steps.value[steps.value.length - 1]
    if (last)
      last.body = TAIL.slice(0, index)

    if (index >= TAIL.length) {
      stop()
      streaming.value = false
      // Move the step out of `active`, or the spinner outlives the stream.
      if (last)
        last.status = 'done'
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

    <TxChainOfThought :steps="steps" :streaming="streaming" />
  </div>
</template>
