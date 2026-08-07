<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
}

let nextId = 100

function makeOlder(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `old-${nextId--}`,
    role: index % 2 === 0 ? 'user' : 'assistant',
    text: `Earlier message ${nextId + 1}`,
  }))
}

const items = ref<Message[]>([
  { id: 'm1', role: 'user', text: 'How does the scroller decide to stick?' },
  { id: 'm2', role: 'assistant', text: 'It follows new content only while you are already at the bottom.' },
])

const streaming = ref(false)
const remainingPages = ref(2)
let timer: ReturnType<typeof setInterval> | undefined

// The consumer prepends; the component never owns the array.
async function loadOlder() {
  await new Promise(resolve => setTimeout(resolve, 400))
  if (remainingPages.value <= 0)
    return { hasMore: false }

  remainingPages.value--
  items.value = [...makeOlder(6), ...items.value]
  return { hasMore: remainingPages.value > 0 }
}

function stop() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

function appendStreaming() {
  stop()
  streaming.value = true
  const id = `m-${Date.now()}`
  items.value = [...items.value, { id, role: 'assistant', text: '' }]

  const full = 'Scroll up and this stops chasing you, which is the point.'
  let index = 0
  timer = setInterval(() => {
    index += 2
    const last = items.value[items.value.length - 1]
    if (last)
      last.text = full.slice(0, index)
    if (index >= full.length) {
      stop()
      streaming.value = false
    }
  }, 40)
}

onBeforeUnmount(stop)
</script>

<template>
  <div class="flex flex-col gap-3">
    <button
      type="button"
      class="self-start rounded-lg border border-[var(--tx-border-color)] px-3 py-1 text-sm"
      @click="appendStreaming"
    >
      Stream a reply
    </button>

    <div class="h-72 rounded-xl border border-[var(--tx-border-color)]">
      <TxConversationStream
        :items="items"
        :item-key="(item: Message) => item.id"
        :load-older="loadOlder"
        :streaming="streaming"
        :has-more-initial="true"
      >
        <template #item="{ item }">
          <div class="px-3 py-2 text-sm">
            <span class="text-[var(--tx-text-color-secondary)]">{{ item.role }}:</span>
            {{ item.text }}
          </div>
        </template>
        <template #top-done>
          <p class="px-3 py-2 text-xs text-[var(--tx-text-color-secondary)]">
            No older messages.
          </p>
        </template>
      </TxConversationStream>
    </div>
  </div>
</template>
