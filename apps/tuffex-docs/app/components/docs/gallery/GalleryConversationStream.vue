<script setup lang="ts">
import type { TxConversationStreamInstance } from '@tuffex-components/conversation-stream'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

interface StreamTurn {
  id: string
  index: number
  role: 'user' | 'assistant'
  content: string
}

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => (zh.value
  ? {
      pinned: '自动吸底',
      detached: '浏览历史',
      streamBtn: '流式回复',
      streamingBtn: '输出中…',
      topBtn: '顶部',
      jumpLatest: '回到底部',
      jumpNew: '新回复到达',
      loadingOlder: '加载更早消息…',
      noMore: '已到对话起点',
      railAria: '快速定位消息',
      turnLabel: (n: number) => `第 ${n} 条`,
      olderPrefix: (n: number) => `历史记录 #${n}：前插更早消息时保持当前阅读位置不跳动。`,
      streamReplies: [
        '正在流式输出：停在底部时自动跟随，往上滚动浏览历史时立即脱离吸底，不再抢滚动条。',
        '新回复已追加：虚拟滚动仅挂载视口附近行，长对话也能保持 60fps 顺滑。',
      ],
      initialTurns: [
        { role: 'user' as const, content: '长对话里怎么避免一次性渲染上千条 DOM？' },
        { role: 'assistant' as const, content: 'TxConversationStream 用位置缓存 + 虚拟窗口，仅挂载视口附近消息。' },
        { role: 'user' as const, content: '那新消息还在流式吐字时会抖动吗？' },
        { role: 'assistant' as const, content: '最新一条固定在 live 区，流式增高时不迁移节点、不断行闪烁。' },
        { role: 'user' as const, content: '如果我往上翻看历史记录呢？' },
        { role: 'assistant' as const, content: '一旦离开底部即刻停止自动拉回，并浮出底部「回到底部」胶囊。' },
        { role: 'user' as const, content: '向上滚到顶能自动加载更早消息吗？' },
        { role: 'assistant' as const, content: '可以，触发 loadOlder 前插历史后会自动锚定视口位置，不会跳回顶部。' },
        { role: 'user' as const, content: '右侧小竖条也是插槽吗？' },
        { role: 'assistant' as const, content: '是的，#rail 暴露 activeIndex 与 scrollToIndex，可点击直达任意楼层。' },
      ],
    }
  : {
      pinned: 'Following',
      detached: 'Browsing',
      streamBtn: 'Stream',
      streamingBtn: 'Streaming…',
      topBtn: 'Top',
      jumpLatest: 'Latest',
      jumpNew: 'New reply',
      loadingOlder: 'Loading history…',
      noMore: 'Start of thread',
      railAria: 'Jump to message',
      turnLabel: (n: number) => `Turn ${n}`,
      olderPrefix: (n: number) => `Earlier turn #${n}: prepending history keeps your scroll anchor steady.`,
      streamReplies: [
        'Streaming reply: sticks smoothly while at bottom, and yields immediately when you scroll up.',
        'Appended turn: virtualized window mounts only visible rows so long transcripts stay fluid.',
      ],
      initialTurns: [
        { role: 'user' as const, content: 'How do long threads avoid mounting thousands of rows?' },
        { role: 'assistant' as const, content: 'TxConversationStream virtualizes with a measured position cache.' },
        { role: 'user' as const, content: 'Does a streaming reply flicker while growing?' },
        { role: 'assistant' as const, content: 'The newest turn stays in a dedicated live zone without migrating nodes.' },
        { role: 'user' as const, content: 'What happens if I scroll up to read earlier messages?' },
        { role: 'assistant' as const, content: 'Auto-follow pauses immediately and reveals the frosted jump pill.' },
        { role: 'user' as const, content: 'Can scrolling to the top fetch older history?' },
        { role: 'assistant' as const, content: 'Yes — loadOlder prepends turns while preserving your viewport anchor.' },
        { role: 'user' as const, content: 'Is the right-hand tick bar customizable?' },
        { role: 'assistant' as const, content: 'Yes, the #rail slot exposes activeIndex and scrollToIndex for quick jumps.' },
      ],
    }))

function buildInitial(): StreamTurn[] {
  return copy.value.initialTurns.map((turn, idx) => ({
    id: `t-${idx + 1}`,
    index: idx + 1,
    role: turn.role,
    content: turn.content,
  }))
}

const streamRef = ref<TxConversationStreamInstance | null>(null)
const items = ref<StreamTurn[]>(buildInitial())
const atBottom = ref(false)
const activeIndex = ref(4)
const streaming = ref(false)
const olderPagesLeft = ref(2)
let olderCounter = 0
let replyCounter = 0
let streamTimer: ReturnType<typeof setInterval> | null = null
let mountTimer: ReturnType<typeof setTimeout> | null = null

function stopStream(): void {
  if (streamTimer !== null) {
    clearInterval(streamTimer)
    streamTimer = null
  }
}

async function loadOlder() {
  await new Promise(resolve => setTimeout(resolve, 350))
  if (olderPagesLeft.value <= 0)
    return { hasMore: false }
  olderPagesLeft.value -= 1
  const batch: StreamTurn[] = Array.from({ length: 4 }, (_, i) => {
    olderCounter += 1
    return {
      id: `older-${olderCounter}`,
      index: -olderCounter,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: copy.value.olderPrefix(olderCounter),
    }
  }).reverse()
  items.value = [...batch, ...items.value]
  return { hasMore: olderPagesLeft.value > 0 }
}

function jumpToTop(): void {
  streamRef.value?.scrollToIndex(0)
}

function appendStreamingReply(): void {
  stopStream()
  streaming.value = true
  const full = copy.value.streamReplies[replyCounter % copy.value.streamReplies.length]!
  replyCounter += 1
  const id = `live-${Date.now()}-${replyCounter}`
  items.value = [
    ...items.value,
    { id, index: items.value.length + 1, role: 'assistant', content: '' },
  ]
  let cursor = 0
  streamTimer = setInterval(() => {
    cursor += 3
    const last = items.value[items.value.length - 1]
    if (last && last.id === id)
      last.content = full.slice(0, cursor)
    if (cursor >= full.length) {
      stopStream()
      streaming.value = false
    }
  }, 36)
}

onMounted(async () => {
  await nextTick()
  // Start slightly above the bottom so the signature frosted jump-to-bottom pill
  // and right-hand active rail position are immediately visible on first paint.
  mountTimer = setTimeout(() => {
    mountTimer = null
    streamRef.value?.scrollToIndex(3)
  }, 80)
})

onBeforeUnmount(() => {
  stopStream()
  if (mountTimer !== null) {
    clearTimeout(mountTimer)
    mountTimer = null
  }
})
</script>

<template>
  <div class="docs-gallery__block docs-gallery__doc gallery-cstream">
    <div class="docs-gallery__doc-bar gallery-cstream__bar">
      <span class="gallery-cstream__status">
        <span class="gallery-cstream__dot" :class="{ 'is-pinned': atBottom, 'is-streaming': streaming }" aria-hidden="true" />
        <span>{{ atBottom ? copy.pinned : copy.detached }}</span>
        <span class="gallery-cstream__counter">{{ Math.max(1, activeIndex + 1) }}/{{ items.length }}</span>
      </span>
      <span class="gallery-cstream__actions">
        <button type="button" class="gallery-cstream__btn" @click="jumpToTop">
          ↑ {{ copy.topBtn }}
        </button>
        <button
          type="button"
          class="gallery-cstream__btn is-primary"
          :disabled="streaming"
          @click="appendStreamingReply"
        >
          {{ streaming ? copy.streamingBtn : `+ ${copy.streamBtn}` }}
        </button>
      </span>
    </div>

    <div class="gallery-cstream__viewport">
      <TxConversationStream
        ref="streamRef"
        :items="items"
        :item-key="(item: StreamTurn) => item.id"
        :estimated-item-height="46"
        :load-older="loadOlder"
        :has-more-initial="true"
        :streaming="streaming"
        :top-padding="6"
        :bottom-clearance="12"
        :item-gap="6"
        :pill-bottom="10"
        :scroll-to-bottom-label="copy.jumpLatest"
        @at-bottom-change="atBottom = $event"
        @active-index-change="activeIndex = $event"
      >
        <template #item="{ item, index }">
          <div class="gallery-cstream__turn" :class="{ 'is-user': item.role === 'user' }">
            <span class="gallery-cstream__idx">{{ index + 1 }}</span>
            <p class="gallery-cstream__bubble">
              {{ item.content }}
            </p>
          </div>
        </template>

        <template #top-loading>
          <span class="gallery-cstream__top-note">{{ copy.loadingOlder }}</span>
        </template>

        <template #top-done>
          <span class="gallery-cstream__top-note">{{ copy.noMore }}</span>
        </template>

        <template #scroll-to-bottom="{ streaming: isLive }">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          <span>{{ isLive ? copy.jumpNew : copy.jumpLatest }}</span>
        </template>

        <template #rail="{ items: railItems, activeIndex: currentIdx, scrollToIndex }">
          <nav class="gallery-cstream__rail" :aria-label="copy.railAria">
            <button
              v-for="(turn, idx) in railItems"
              :key="turn.id"
              type="button"
              class="gallery-cstream__tick"
              :class="{ 'is-active': idx === currentIdx, 'is-user': turn.role === 'user' }"
              :aria-label="copy.turnLabel(idx + 1)"
              @click="scrollToIndex(idx)"
            />
          </nav>
        </template>
      </TxConversationStream>
    </div>
  </div>
</template>

<style scoped>
.gallery-cstream {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid var(--docs-gallery-line);
  background: var(--tx-bg-color-overlay, var(--tx-bg-color));
}

.gallery-cstream__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--docs-gallery-line);
  background: color-mix(in srgb, var(--tx-fill-color-light) 65%, transparent);
  font-size: 11px;
}

.gallery-cstream__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--docs-ink);
  font-weight: 500;
}

.gallery-cstream__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 999px;
  background: var(--tx-color-warning);
}

.gallery-cstream__dot.is-pinned {
  background: var(--tx-color-success);
}

.gallery-cstream__dot.is-streaming {
  background: var(--tx-color-primary);
}

.gallery-cstream__counter {
  font-variant-numeric: tabular-nums;
  color: var(--docs-muted);
}

.gallery-cstream__actions {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
}

.gallery-cstream__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--docs-gallery-line);
  border-radius: 7px;
  background: var(--tx-bg-color-overlay, var(--tx-bg-color));
  color: var(--docs-ink);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.gallery-cstream__btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--docs-accent) 45%, var(--docs-gallery-line));
  color: var(--docs-accent);
}

.gallery-cstream__btn.is-primary {
  border-color: color-mix(in srgb, var(--docs-accent) 42%, transparent);
  background: color-mix(in srgb, var(--docs-accent) 12%, transparent);
  color: var(--docs-accent);
}

.gallery-cstream__btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.gallery-cstream__viewport {
  height: 176px;
  min-height: 0;
}

.gallery-cstream__turn {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 26px 2px 10px;
}

.gallery-cstream__turn.is-user {
  flex-direction: row-reverse;
  padding: 2px 26px 2px 18px;
}

.gallery-cstream__idx {
  flex: none;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: var(--docs-muted);
  opacity: 0.65;
}

.gallery-cstream__bubble {
  max-width: 86%;
  margin: 0;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--docs-gallery-line);
  color: var(--tx-text-color-primary);
  font-size: 11.5px;
  line-height: 1.45;
}

.gallery-cstream__turn.is-user .gallery-cstream__bubble {
  background: color-mix(in srgb, var(--tx-color-primary) 12%, var(--tx-fill-color-light));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-primary) 28%, transparent);
}

.gallery-cstream__top-note {
  font-size: 11px;
  color: var(--docs-muted);
}

.gallery-cstream__rail {
  position: absolute;
  top: 50%;
  right: 7px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  transform: translateY(-50%);
}

.gallery-cstream__tick {
  width: 6px;
  height: 3px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--docs-muted) 42%, transparent);
  cursor: pointer;
}

.gallery-cstream__tick.is-user {
  width: 9px;
}

.gallery-cstream__tick.is-active {
  width: 14px;
  background: var(--tx-color-primary);
}
</style>
