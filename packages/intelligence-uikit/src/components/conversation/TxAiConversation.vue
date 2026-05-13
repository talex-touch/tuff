<script setup lang="ts">
import type { TxAiConversationProps } from '../../types'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const showBackToBottom = ref(false)
const isFollowing = ref(true)
let resizeObserver: ResizeObserver | undefined

function hiddenBottom(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - (el.scrollTop + el.clientHeight))
}

function syncScrollState() {
  const el = viewportRef.value
  if (!el)
    return
  const bottomGap = hiddenBottom(el)
  isFollowing.value = bottomGap <= props.followGap
  showBackToBottom.value = !isFollowing.value
}

function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  const el = viewportRef.value
  if (!el)
    return

  if (typeof el.scrollTo === 'function') {
    el.scrollTo({ top: el.scrollHeight, behavior })
    return
  }

  el.scrollTop = el.scrollHeight
}

async function scheduleScrollToBottom(behavior: ScrollBehavior = 'auto') {
  await nextTick()
  scrollToBottom(behavior)

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      scrollToBottom(behavior)
      syncScrollState()
    })
    return
  }

  syncScrollState()
}

watch(
  () => props.messages,
  async () => {
    const el = viewportRef.value
    const shouldFollow = isFollowing.value || !el || hiddenBottom(el) <= props.followGap
    await nextTick()
    syncScrollState()
    if (props.autoFollow && shouldFollow)
      await scheduleScrollToBottom('auto')
  },
  { deep: true },
)

onMounted(async () => {
  await nextTick()
  syncScrollState()
  if (props.autoFollow)
    await scheduleScrollToBottom('auto')

  if (typeof ResizeObserver === 'undefined' || !listRef.value)
    return

  resizeObserver = new ResizeObserver(() => {
    if (props.autoFollow && isFollowing.value)
      void scheduleScrollToBottom('auto')
  })
  resizeObserver.observe(listRef.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

defineExpose({
  scrollToBottom,
  syncScrollState,
})
</script>

<template>
  <section class="tx-ai-conversation">
    <div
      ref="viewportRef"
      class="tx-ai-conversation__viewport"
      @scroll="syncScrollState"
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
      <slot name="floating" :scroll-to-bottom="scrollToBottom" :show-back-to-bottom="showBackToBottom">
        <button
          v-if="showBackToBottom"
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
