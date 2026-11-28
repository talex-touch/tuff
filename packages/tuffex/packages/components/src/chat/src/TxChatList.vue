<script setup lang="ts">
import type { TxConversationStreamInstance } from '../../conversation-stream'
import type { ChatListProps, ChatMessageModel } from './types'
import { computed, ref } from 'vue'
import TxConversationStream from '../../conversation-stream/src/TxConversationStream.vue'
import TxStagger from '../../stagger/src/TxStagger.vue'
import TxChatMessage from './TxChatMessage.vue'

defineOptions({
  name: 'TxChatList',
})

const props = withDefaults(defineProps<ChatListProps>(), {
  markdown: true,
  stagger: true,
  mode: 'list',
  itemKey: 'id',
  estimatedItemHeight: 96,
  overscan: 4,
  hasMoreInitial: undefined,
  streaming: false,
  messageVariant: 'bubble',
  showAvatar: undefined,
  streamMarkdown: true,
  actions: undefined,
  copyable: false,
  regenerable: false,
  speakable: false,
})

const emit = defineEmits<{
  (e: 'imageClick', payload: { url: string, name?: string, messageId: string }): void
  (e: 'copy', payload: { text: string, messageId: string }): void
  (e: 'regenerate', messageId: string): void
  (e: 'speak', messageId: string): void
  (e: 'retry', messageId: string): void
  (e: 'at-bottom-change', atBottom: boolean): void
  (e: 'following-change', following: boolean): void
  (e: 'active-index-change', index: number): void
  (e: 'load-error', error: unknown): void
}>()

const rootRef = ref<HTMLElement | null>(null)
const streamRef = ref<TxConversationStreamInstance | null>(null)

const list = computed(() => props.messages ?? [])

function toCssLength(value?: number | string): string | undefined {
  if (value === undefined || value === null || value === '')
    return undefined
  return typeof value === 'number' ? `${value}px` : value
}

const listStyle = computed(() => {
  const vars: Record<string, string> = {}
  const gap = toCssLength(props.itemGap)
  if (gap)
    vars['--tx-chat-list-gap'] = gap
  return vars
})

const resolvedStreamGap = computed(() => props.itemGap ?? 10)

function isItemStreaming(message: ChatMessageModel, index: number): boolean {
  if (message.status === 'streaming')
    return true
  return Boolean(props.streaming && index === list.value.length - 1 && message.role === 'assistant')
}

function speakStateFor(message: ChatMessageModel) {
  return props.speakStateOf?.(message) ?? 'idle'
}

function resolveItemKey(message: ChatMessageModel, index: number): string | number {
  if (typeof props.itemKey === 'function')
    return props.itemKey(message, index)
  const raw = (message as unknown as Record<string, unknown> | null | undefined)?.[props.itemKey]
  return typeof raw === 'string' || typeof raw === 'number' ? raw : message.id ?? index
}

function scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
  if (props.mode === 'stream') {
    streamRef.value?.scrollToBottom(behavior)
    return
  }
  const el = rootRef.value
  if (!el)
    return
  if (typeof el.scrollTo === 'function')
    el.scrollTo({ top: el.scrollHeight, behavior })
  else
    el.scrollTop = el.scrollHeight
}

function scrollToIndex(index: number): void {
  if (props.mode === 'stream') {
    streamRef.value?.scrollToIndex(index)
    return
  }
  const el = rootRef.value
  const children = el?.querySelectorAll('.tx-chat-list__item:not(.tx-stagger-leave-active)')
  if (!children?.length)
    return
  const clamped = Math.max(0, Math.min(children.length - 1, index))
  const target = children[clamped]
  if (target && typeof (target as HTMLElement).scrollIntoView === 'function')
    (target as HTMLElement).scrollIntoView({ block: 'start' })
}

async function tweenToBottom(duration?: number): Promise<boolean> {
  if (props.mode === 'stream' && streamRef.value)
    return streamRef.value.tweenToBottom(duration)
  scrollToBottom('smooth')
  return true
}

defineExpose({
  scrollToBottom,
  scrollToIndex,
  tweenToBottom,
  atBottom: computed(() => (props.mode === 'stream' ? (streamRef.value?.atBottom ?? true) : true)),
  following: computed(() => (props.mode === 'stream' ? (streamRef.value?.following ?? true) : true)),
})
</script>

<template>
  <div
    ref="rootRef"
    class="tx-chat-list"
    :class="{ 'is-stream': mode === 'stream' }"
    :style="listStyle"
    role="log"
  >
    <TxConversationStream
      v-if="mode === 'stream'"
      ref="streamRef"
      :items="list"
      :item-key="itemKey"
      :estimated-item-height="estimatedItemHeight"
      :overscan="overscan"
      :load-older="loadOlder"
      :has-more-initial="hasMoreInitial"
      :streaming="streaming"
      :top-padding="topPadding"
      :bottom-clearance="bottomClearance"
      :item-gap="resolvedStreamGap"
      :pill-bottom="pillBottom"
      :scroll-to-bottom-label="scrollToBottomLabel"
      :empty-align="emptyAlign"
      @at-bottom-change="emit('at-bottom-change', $event)"
      @following-change="emit('following-change', $event)"
      @active-index-change="emit('active-index-change', $event)"
      @load-error="emit('load-error', $event)"
    >
      <template v-if="$slots.header" #header>
        <slot name="header" />
      </template>

      <template #empty>
        <slot name="empty">
          <div v-if="emptyText" class="tx-chat-list__empty">
            {{ emptyText }}
          </div>
        </slot>
      </template>

      <template v-if="$slots['top-loading']" #top-loading>
        <slot name="top-loading" />
      </template>

      <template v-if="$slots['top-error']" #top-error="slotProps">
        <slot name="top-error" v-bind="slotProps" />
      </template>

      <template v-if="$slots['top-done']" #top-done>
        <slot name="top-done" />
      </template>

      <template #item="{ item, index }">
        <slot v-if="$slots.item" name="item" :message="item" :item="item" :index="index" />
        <slot v-else-if="$slots.message" name="message" :message="item" :index="index" />
        <TxChatMessage
          v-else
          :message="item"
          :markdown="markdown"
          :attachment-label="attachmentLabel"
          :variant="messageVariant"
          :show-avatar="showAvatar"
          :streaming="isItemStreaming(item, index)"
          :stream-markdown="streamMarkdown"
          :actions="actions"
          :copyable="copyable"
          :regenerable="regenerable"
          :speakable="speakable"
          :speak-state="speakStateFor(item)"
          @image-click="emit('imageClick', $event)"
          @copy="emit('copy', $event)"
          @regenerate="emit('regenerate', $event)"
          @speak="emit('speak', $event)"
          @retry="emit('retry', $event)"
        >
          <template v-if="$slots['message-avatar']" #avatar="slotProps">
            <slot name="message-avatar" v-bind="slotProps" />
          </template>
          <template v-if="$slots['message-header']" #header="slotProps">
            <slot name="message-header" v-bind="slotProps" />
          </template>
          <template v-if="$slots['message-content']" #content="slotProps">
            <slot name="message-content" v-bind="slotProps" />
          </template>
          <template v-if="$slots['message-voice']" #voice="slotProps">
            <slot name="message-voice" v-bind="slotProps" />
          </template>
          <template v-if="$slots['message-attachments']" #attachments="slotProps">
            <slot name="message-attachments" v-bind="slotProps" />
          </template>
          <template v-if="$slots['message-status']" #status="slotProps">
            <slot name="message-status" v-bind="slotProps" />
          </template>
          <template v-if="$slots['message-error']" #error="slotProps">
            <slot name="message-error" v-bind="slotProps" />
          </template>
          <template v-if="$slots['message-actions']" #actions="slotProps">
            <slot name="message-actions" v-bind="slotProps" />
          </template>
          <template v-if="$slots['message-footer']" #footer="slotProps">
            <slot name="message-footer" v-bind="slotProps" />
          </template>
        </TxChatMessage>
      </template>

      <template v-if="$slots.footer" #footer>
        <slot name="footer" />
      </template>

      <template v-if="$slots['scroll-to-bottom']" #scroll-to-bottom="slotProps">
        <slot name="scroll-to-bottom" v-bind="slotProps" />
      </template>

      <template v-if="$slots.rail" #rail="slotProps">
        <slot name="rail" v-bind="slotProps" />
      </template>

      <template v-if="$slots.overlay" #overlay="slotProps">
        <slot name="overlay" v-bind="slotProps" />
      </template>
    </TxConversationStream>

    <template v-else>
      <slot name="header" />

      <div v-if="list.length === 0 && ($slots.empty || emptyText)" class="tx-chat-list__empty">
        <slot name="empty">
          {{ emptyText }}
        </slot>
      </div>

      <component
        :is="stagger ? TxStagger : 'div'"
        v-else
        :tag="stagger ? 'div' : undefined"
        class="tx-chat-list__inner"
      >
        <div
          v-for="(m, index) in list"
          :key="resolveItemKey(m, index)"
          class="tx-chat-list__item"
          :data-chat-index="index"
        >
          <slot v-if="$slots.item" name="item" :message="m" :item="m" :index="index" />
          <slot v-else-if="$slots.message" name="message" :message="m" :index="index" />
          <TxChatMessage
            v-else
            :message="m"
            :markdown="markdown"
            :attachment-label="attachmentLabel"
            :variant="messageVariant"
            :show-avatar="showAvatar"
            :streaming="isItemStreaming(m, index)"
            :stream-markdown="streamMarkdown"
            :actions="actions"
            :copyable="copyable"
            :regenerable="regenerable"
            :speakable="speakable"
            :speak-state="speakStateFor(m)"
            @image-click="emit('imageClick', $event)"
            @copy="emit('copy', $event)"
            @regenerate="emit('regenerate', $event)"
            @speak="emit('speak', $event)"
            @retry="emit('retry', $event)"
          >
            <template v-if="$slots['message-avatar']" #avatar="slotProps">
              <slot name="message-avatar" v-bind="slotProps" />
            </template>
            <template v-if="$slots['message-header']" #header="slotProps">
              <slot name="message-header" v-bind="slotProps" />
            </template>
            <template v-if="$slots['message-content']" #content="slotProps">
              <slot name="message-content" v-bind="slotProps" />
            </template>
            <template v-if="$slots['message-voice']" #voice="slotProps">
              <slot name="message-voice" v-bind="slotProps" />
            </template>
            <template v-if="$slots['message-attachments']" #attachments="slotProps">
              <slot name="message-attachments" v-bind="slotProps" />
            </template>
            <template v-if="$slots['message-status']" #status="slotProps">
              <slot name="message-status" v-bind="slotProps" />
            </template>
            <template v-if="$slots['message-error']" #error="slotProps">
              <slot name="message-error" v-bind="slotProps" />
            </template>
            <template v-if="$slots['message-actions']" #actions="slotProps">
              <slot name="message-actions" v-bind="slotProps" />
            </template>
            <template v-if="$slots['message-footer']" #footer="slotProps">
              <slot name="message-footer" v-bind="slotProps" />
            </template>
          </TxChatMessage>
        </div>
      </component>

      <slot name="footer" />
    </template>
  </div>
</template>

<style lang="scss">
.tx-chat-list {
  width: 100%;

  &.is-stream {
    height: 100%;
    min-height: 0;
  }
}

.tx-chat-list__inner {
  display: flex;
  flex-direction: column;
  gap: var(--tx-chat-list-gap, 10px);
}

.tx-chat-list__item {
  min-width: 0;
}

.tx-chat-list__empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--tx-text-color-secondary, #6b7280);
}
</style>
