<script setup lang="ts">
import type { TxAiConversationProps } from '../../types'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useStickToBottom } from '@talex-touch/tuffex/conversation-stream'
import TxAiMessage from './TxAiMessage.vue'

defineOptions({
  name: 'TxAiConversation',
})

const props = withDefaults(defineProps<TxAiConversationProps>(), {
  markdown: true,
  autoFollow: true,
  followGap: 64,
  generating: false,
})

const emit = defineEmits<{
  (e: 'stop'): void
  (e: 'imageClick', payload: { url: string, name?: string, messageId: string }): void
}>()

const viewportRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | undefined

// The follow is tuffex's critically-damped spring, not a scroll per delta: a stream
// grows the list every few tens of milliseconds, and a fresh `scrollTo` each time reads
// as glide-stop-glide. The spring re-reads the live bottom every frame and carries its
// velocity through, so token growth is one continuous slide. It also owns the
// "user scrolled away" policy, which is why following stops on an upward wheel but not
// on the component's own programmatic scrolls.
const { atBottom, handleScroll, handleWheel, scrollToBottom: stickToBottom, followIfSticking }
  = useStickToBottom(viewportRef, { threshold: props.followGap })

function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  stickToBottom(behavior)
}

watch(
  () => props.messages,
  async () => {
    await nextTick()
    if (props.autoFollow)
      followIfSticking(120)
  },
  { deep: true },
)

onMounted(async () => {
  await nextTick()
  if (props.autoFollow)
    stickToBottom('auto')

  if (typeof ResizeObserver === 'undefined' || !listRef.value)
    return

  // Content also grows without a message change: an image decoding, a code block
  // highlighting, a thought block expanding.
  resizeObserver = new ResizeObserver(() => {
    if (props.autoFollow)
      followIfSticking(120)
  })
  resizeObserver.observe(listRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

defineExpose({
  scrollToBottom,
  /** Re-measures whether the viewport counts as pinned to the bottom. */
  syncScrollState: handleScroll,
})
</script>

<template>
  <section class="tx-ai-conversation">
    <div
      ref="viewportRef"
      class="tx-ai-conversation__viewport"
      @scroll="handleScroll"
      @wheel.passive="handleWheel"
    >
      <div ref="listRef" class="tx-ai-conversation__list">
        <slot name="before" />
        <TxAiMessage
          v-for="message in messages"
          :key="message.id"
          :message="message"
          :markdown="markdown"
          @image-click="emit('imageClick', $event)"
        />
        <slot name="after" />
      </div>
    </div>

    <div class="tx-ai-conversation__floating">
      <slot name="floating" :scroll-to-bottom="scrollToBottom" :show-back-to-bottom="!atBottom">
        <button
          v-if="!atBottom"
          type="button"
          class="tx-ai-conversation__back"
          @click="scrollToBottom()"
        >
          Back to bottom
        </button>
        <button
          v-if="generating"
          type="button"
          class="tx-ai-conversation__stop"
          @click="emit('stop')"
        >
          Stop generating
        </button>
      </slot>
    </div>
  </section>
</template>
