<script setup lang="ts">
import type { AiAttachmentFile, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { MikoLabels } from '@talex-touch/tuffex/miko'
import type { FormFieldValue } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { TxAiConversationProps, TxAiConversationSuggestion, TxAiMessageModel } from '../../types'
import { TxConversationStream } from '@talex-touch/tuffex/conversation-stream'
import { TxGradualBlur } from '@talex-touch/tuffex/gradual-blur'
import { TxMiko } from '@talex-touch/tuffex/miko'
import { computed, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'
import { buildMessageRailTurns } from '../../utils/message-rail'
import TxAiMessage from './TxAiMessage.vue'
import TxAiMessageRail from './TxAiMessageRail.vue'
import TxAiSuggestion from './TxAiSuggestion.vue'

defineOptions({
  name: 'TxAiConversation',
})

const props = withDefaults(defineProps<TxAiConversationProps>(), {
  markdown: true,
  autoFollow: true,
  followGap: 64,
  generating: false,
  estimatedItemHeight: 160,
  overscan: 3,
  hasMoreInitial: false,
  blurMasks: true,
  showEmptyState: true,
  showRail: true,
  composerClearance: undefined,
  variant: 'hybrid',
  showAvatar: false,
  showActions: true,
  showFooter: true,
  openui: true,
  suggestions: () => [],
  labels: () => ({}),
})

const emit = defineEmits<{
  stop: []
  atBottomChange: [atBottom: boolean]
  loadError: [error: unknown]
  suggestionSelect: [text: string]
  imageClick: [payload: { url: string, name?: string, messageId: string }]
  attachmentOpen: [payload: AiAttachmentFile]
  action: [payload: { action: string, messageId: string }]
  copy: [text: string, messageId: string]
  regenerate: [messageId: string]
  speak: [messageId: string]
  branch: [messageId: string]
  retry: [messageId: string]
  errorAction: [messageId: string]
  toolPayload: [part: AiToolCallPart]
  formSubmit: [part: AiToolCallPart, values: Record<string, FormFieldValue>]
  formChange: [part: AiToolCallPart, values: Record<string, FormFieldValue>]
  openuiAction: [payload: unknown]
}>()

const slots = useSlots()

type StreamEntry =
  | { __kind: 'before', id: '__tx-ai-before__' }
  | { __kind: 'after', id: '__tx-ai-after__' }
  | { __kind: 'message', id: string, message: TxAiMessageModel, messageIndex: number }

const streamRef = ref<TxConversationStreamInstance | null>(null)
const composerDockRef = ref<HTMLElement | null>(null)
const atBottom = ref(true)
const activeMessageIndex = ref(-1)
const measuredComposerHeight = ref(0)

let dockObserver: ResizeObserver | null = null

function updateDockHeight() {
  const el = composerDockRef.value
  if (!el) {
    measuredComposerHeight.value = 0
    return
  }
  const rect = el.getBoundingClientRect()
  measuredComposerHeight.value = Math.ceil(rect.height || 0)
}

onMounted(() => {
  updateDockHeight()
  if (typeof ResizeObserver !== 'undefined' && composerDockRef.value) {
    dockObserver = new ResizeObserver(updateDockHeight)
    dockObserver.observe(composerDockRef.value)
  }
})

onBeforeUnmount(() => {
  dockObserver?.disconnect()
  dockObserver = null
})

watch(() => Boolean(slots.composer), () => {
  if (typeof ResizeObserver === 'undefined')
    return
  dockObserver?.disconnect()
  if (composerDockRef.value) {
    dockObserver = new ResizeObserver(updateDockHeight)
    dockObserver.observe(composerDockRef.value)
  }
  updateDockHeight()
})

const hasBeforeSlot = computed(() => Boolean(slots.before))
const hasAfterSlot = computed(() => Boolean(slots.after))

const streamEntries = computed<StreamEntry[]>(() => {
  if (!props.messages.length && !hasBeforeSlot.value && !hasAfterSlot.value)
    return []
  const entries: StreamEntry[] = []
  if (hasBeforeSlot.value)
    entries.push({ __kind: 'before', id: '__tx-ai-before__' })
  props.messages.forEach((message, index) => {
    entries.push({
      __kind: 'message',
      id: message.id || `msg-${index}`,
      message,
      messageIndex: index,
    })
  })
  if (hasAfterSlot.value)
    entries.push({ __kind: 'after', id: '__tx-ai-after__' })
  return entries
})

function resolveEntryKey(entry: StreamEntry, index: number): string | number {
  if (entry.__kind === 'message') {
    if (typeof props.itemKey === 'function')
      return props.itemKey(entry.message, entry.messageIndex)
    if (typeof props.itemKey === 'string') {
      const value = (entry.message as unknown as Record<string, unknown>)[props.itemKey]
      if (typeof value === 'string' || typeof value === 'number')
        return value
    }
    return entry.id
  }
  return entry.id || index
}

const resolvedLabels = computed(() => ({
  backToBottom: 'Back to bottom',
  stopGenerating: 'Stop generating',
  loadingOlder: 'Loading earlier messages…',
  loadOlderFailed: 'Failed to load earlier messages',
  retry: 'Retry',
  beginning: 'Beginning of conversation',
  emptyTitle: props.emptyTitle || 'How can I help today?',
  emptySubtitle: props.emptySubtitle || 'Ask a question, attach context, or pick a starter below.',
  railTitle: 'Conversation outline',
  railTurnPrefix: '#',
  railImageTag: '[Image]',
  railCodeTag: '[Code]',
  generating: 'Generating...',
  ...props.labels,
}))

const MIKO_ENGLISH_LABELS: Partial<MikoLabels> = {
  idle: 'Ready',
  working: 'Working',
  thinking: 'Thinking',
  success: 'Done',
  alert: 'Attention needed',
  error: 'Error',
  sleeping: 'Idle',
}

const railTurns = computed(() =>
  buildMessageRailTurns(props.messages, {
    imageTag: resolvedLabels.value.railImageTag,
    codeTag: resolvedLabels.value.railCodeTag,
  }),
)

const normalizedSuggestions = computed<TxAiConversationSuggestion[]>(() =>
  props.suggestions.map((item, index) => (
    typeof item === 'string'
      ? { key: `suggestion-${index}`, text: item }
      : { key: item.key ?? `suggestion-${index}`, ...item }
  )),
)

const clearanceCss = computed(() => {
  if (props.composerClearance !== undefined) {
    return typeof props.composerClearance === 'number'
      ? `${props.composerClearance}px`
      : props.composerClearance
  }
  return measuredComposerHeight.value > 0 ? `${measuredComposerHeight.value + 16}px` : '24px'
})

const containerVars = computed(() => ({
  '--tx-ai-composer-clearance': clearanceCss.value,
  '--tx-conversation-stream-pad-bottom': clearanceCss.value,
  '--tx-conversation-stream-pill-bottom': `calc(${clearanceCss.value} + 16px)`,
}))

function scrollToBottom(behavior: ScrollBehavior = 'auto') {
  streamRef.value?.scrollToBottom(behavior)
}

function scrollToIndex(messageIndex: number) {
  const offset = hasBeforeSlot.value ? 1 : 0
  activeMessageIndex.value = messageIndex
  streamRef.value?.scrollToIndex(messageIndex + offset)
}

function tweenToBottom(duration?: number): Promise<boolean> {
  if (!streamRef.value)
    return Promise.resolve(false)
  return streamRef.value.tweenToBottom(duration)
}

function syncScrollState() {
  atBottom.value = streamRef.value?.atBottom ?? true
}

function handleAtBottomChange(next: boolean) {
  atBottom.value = next
  emit('atBottomChange', next)
}

function handleRailNavigate(messageIndex: number) {
  scrollToIndex(messageIndex)
}

const tailKey = computed(() => {
  const last = props.messages.at(-1)
  if (!last)
    return undefined
  if (typeof props.itemKey === 'function')
    return props.itemKey(last, props.messages.length - 1)
  if (typeof props.itemKey === 'string') {
    const value = (last as unknown as Record<string, unknown>)[props.itemKey]
    if (typeof value === 'string' || typeof value === 'number')
      return value
  }
  return last.id
})

watch(tailKey, (nextKey, prevKey) => {
  if (props.autoFollow && nextKey !== undefined && nextKey !== prevKey && atBottom.value) {
    streamRef.value?.scrollToBottom('auto')
  }
})

defineExpose({
  scrollToBottom,
  scrollToIndex,
  tweenToBottom,
  syncScrollState,
  atBottom,
})
</script>

<template>
  <section
    class="tx-ai-conversation"
    :class="{ 'is-empty': messages.length === 0, 'is-generating': generating }"
    :style="containerVars"
  >
    <TxGradualBlur
      v-if="blurMasks && messages.length > 0"
      class="tx-ai-conversation__blur tx-ai-conversation__blur--top"
      position="top"
      height="28px"
      :strength="1.35"
    />

    <TxConversationStream
      ref="streamRef"
      class="tx-ai-conversation__list"
      :items="streamEntries"
      :item-key="resolveEntryKey"
      :estimated-item-height="estimatedItemHeight"
      :overscan="overscan"
      :load-older="loadOlder"
      :has-more-initial="hasMoreInitial"
      :streaming="generating"
      @at-bottom-change="handleAtBottomChange"
      @load-error="emit('loadError', $event)"
    >
      <template #item="{ item }">
        <div v-if="item.__kind === 'before'" class="tx-ai-conversation__slot-before">
          <slot name="before" />
        </div>
        <div v-else-if="item.__kind === 'after'" class="tx-ai-conversation__slot-after">
          <slot name="after" />
        </div>
        <TxAiMessage
          v-else
          :message="item.message"
          :markdown="markdown"
          :variant="variant"
          :show-avatar="showAvatar"
          :show-actions="showActions"
          :show-footer="showFooter"
          :openui="openui"
          :openui-labels="openuiLabels"
          :resolve-openui-image="resolveOpenuiImage"
          :widget-sandbox="widgetSandbox"
          :has-tool-face="hasToolFace"
          :submitted-forms="submittedForms"
          :form-drafts="formDrafts"
          :labels="{ generating: resolvedLabels.generating }"
          @image-click="emit('imageClick', $event)"
          @attachment-open="emit('attachmentOpen', $event)"
          @action="emit('action', $event)"
          @copy="(text, id) => emit('copy', text, id)"
          @regenerate="emit('regenerate', $event)"
          @speak="emit('speak', $event)"
          @branch="emit('branch', $event)"
          @retry="emit('retry', $event)"
          @error-action="emit('errorAction', $event)"
          @tool-payload="emit('toolPayload', $event)"
          @form-submit="(part, vals) => emit('formSubmit', part, vals)"
          @form-change="(part, vals) => emit('formChange', part, vals)"
          @openui-action="emit('openuiAction', $event)"
        >
          <template v-if="$slots.tool" #tool="slotProps">
            <slot name="tool" v-bind="slotProps" />
          </template>
        </TxAiMessage>
      </template>

      <template #empty>
        <slot name="empty">
          <div v-if="showEmptyState" class="tx-ai-conversation__empty">
            <div class="tx-ai-conversation__empty-avatar">
              <TxMiko
                :state="generating ? 'thinking' : 'idle'"
                size="md"
                :interactive="true"
                :labels="MIKO_ENGLISH_LABELS"
              />
            </div>
            <h2 class="tx-ai-conversation__empty-title">
              {{ resolvedLabels.emptyTitle }}
            </h2>
            <p class="tx-ai-conversation__empty-subtitle">
              {{ resolvedLabels.emptySubtitle }}
            </p>
            <div v-if="normalizedSuggestions.length" class="tx-ai-conversation__suggestions">
              <TxAiSuggestion
                v-for="item in normalizedSuggestions"
                :key="item.key"
                :text="item.text"
                :description="item.description"
                :icon="item.icon"
                :tone="item.tone"
                :variant="item.description ? 'card' : 'chip'"
                @select="emit('suggestionSelect', $event)"
              />
            </div>
          </div>
        </slot>
      </template>

      <template #top-loading>
        <slot name="top-loading">
          <span class="tx-ai-conversation__top-note">{{ resolvedLabels.loadingOlder }}</span>
        </slot>
      </template>

      <template #top-error="{ retry }">
        <slot name="top-error" :retry="retry">
          <button type="button" class="tx-ai-conversation__top-retry" @click="retry()">
            {{ resolvedLabels.loadOlderFailed }} · {{ resolvedLabels.retry }}
          </button>
        </slot>
      </template>

      <template #top-done>
        <slot name="top-done">
          <span class="tx-ai-conversation__top-note is-done">{{ resolvedLabels.beginning }}</span>
        </slot>
      </template>

      <template #scroll-to-bottom="{ streaming }">
        <slot name="scroll-to-bottom" :streaming="streaming" :scroll-to-bottom="scrollToBottom">
          <span class="tx-ai-conversation__pill-inner" :class="{ 'is-streaming': streaming }">
            <span aria-hidden="true">↓</span>
            <span>{{ resolvedLabels.backToBottom }}</span>
          </span>
        </slot>
      </template>
    </TxConversationStream>

    <div
      v-if="showRail && railTurns.length > 0"
      class="tx-ai-conversation__rail"
    >
      <slot name="rail" :turns="railTurns" :active-index="activeMessageIndex" :navigate="handleRailNavigate">
        <TxAiMessageRail
          :messages="messages"
          :turns="railTurns"
          :active-index="activeMessageIndex"
          :aria-label="resolvedLabels.railTitle"
          :turn-prefix="resolvedLabels.railTurnPrefix"
          :image-tag="resolvedLabels.railImageTag"
          :code-tag="resolvedLabels.railCodeTag"
          @navigate="handleRailNavigate"
        />
      </slot>
    </div>

    <div class="tx-ai-conversation__floating">
      <slot name="floating" :scroll-to-bottom="scrollToBottom" :show-back-to-bottom="!atBottom">
        <button
          v-if="generating"
          type="button"
          class="tx-ai-conversation__stop"
          @click="emit('stop')"
        >
          {{ resolvedLabels.stopGenerating }}
        </button>
      </slot>
    </div>

    <TxGradualBlur
      v-if="blurMasks && messages.length > 0"
      class="tx-ai-conversation__blur tx-ai-conversation__blur--bottom"
      position="bottom"
      height="32px"
      :strength="1.35"
    />

    <div v-if="$slots.composer" ref="composerDockRef" class="tx-ai-conversation__composer-dock">
      <slot name="composer" />
    </div>
  </section>
</template>
