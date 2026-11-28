<script lang="ts" name="HomeMessageRow" setup>
import { TxAiAssistantTurn, formatTokenCount } from '@talex-touch/intelligence-uikit'
import type { TxAiSpeakState } from '@talex-touch/intelligence-uikit'
import type { CodeRunPayload, StreamMarkdownCodePreview } from '@talex-touch/tuffex/stream-markdown'
import { TxAttachmentTray } from '@talex-touch/tuffex/attachment-tray'
import { TxContextChunk, type ContextChunk } from '@talex-touch/tuffex/context-cards'
import { TxMessageActions } from '@talex-touch/tuffex/message-actions'
import { TxVoiceClip } from '@talex-touch/tuffex/voice-clip'
import { computed, inject, unref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWidgetSandbox } from '~/modules/widget-sandbox/use-widget-sandbox'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { describeTurnReasoning, shortTurnReasoning } from '~/modules/conversation/turn-info-rows'
import { isAwaitingFirstToken } from './composer/send-state'
import { homeMessageContextKey } from './composables/home-message-context'
import { useTurnError } from './composables/useTurnError'
import { parseQuotedUserMessage } from './user-message-quote'

/**
 * One message of the thread: the user's bubble with its recording and attachments, or the
 * assistant's turn - reasoning, prose and tool calls in streamed order, then its error or footer.
 *
 * The root keeps the page's DOM contract (`.HomePage-Message`, `[data-message-id]`,
 * `.HomePage-UserBubble`): the send choreography finds the landing bubble and clones the row by
 * those, so they are the stage's names rather than this component's.
 */
const props = defineProps<{
  message: ConversationMessage
  /** Arrived this render: held invisible until its spring takes over. */
  entering: boolean
  /** The last message of the thread. */
  latest: boolean
  /** A turn of the thread is streaming. */
  streaming: boolean
  /** The provider is squeezing its context mid-turn. */
  compacting: boolean
  /** The settled footer has timed out and takes no room until hovered. */
  resting: boolean
  branchable: boolean
  branching: boolean
  speakState: TxAiSpeakState
  showMetrics: boolean
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'regenerate'): void
  (event: 'speak'): void
  (event: 'branch'): void
  (event: 'code-preview', preview: StreamMarkdownCodePreview): void
  (event: 'code-run', payload: CodeRunPayload): void
}>()

const { t, locale } = useI18n()

const {
  segmentsOf,
  submittedForms,
  formDrafts,
  submitForm,
  handleOpenUIAction,
  showToolPayload,
  payloadFor,
  toolCallLabels,
  markdownLabels,
  codePartProps,
  chartProps,
  formProps,
  widgetProps,
  footerLabels,
  attachPreviewProps,
  attachOpenLabel,
  thinkingVerb,
  thinkingLabel
} = inject(homeMessageContextKey)!

const codePreviewLabels = computed(() => ({
  ...unref(markdownLabels),
  inlineCodePreview: false,
  runnableCode: true,
  onCodePreview: (preview: StreamMarkdownCodePreview) => emit('code-preview', preview),
  onCodeRun: (payload: CodeRunPayload) => emit('code-run', payload)
}))

const { errorDisplay, activateErrorAction } = useTurnError()
const turnFooterMetrics = computed(() => {
  const meta = props.message.meta
  if (!meta) return undefined
  const reasoning = shortTurnReasoning(meta, t) ?? undefined
  const reasoningTitle = describeTurnReasoning(meta, t) ?? undefined
  return {
    ...meta,
    ...(reasoning ? { reasoning } : {}),
    ...(reasoningTitle ? { reasoningTitle } : {})
  }
})
const turnFooter = computed(() =>
  props.message.status === 'complete'
    ? {
        content: props.message.content,
        metrics: turnFooterMetrics.value,
        resting: props.resting,
        regenerable: props.latest && !props.streaming,
        speakState: props.speakState,
        branchable: props.branchable,
        branching: props.branching,
        showMetrics: props.showMetrics,
        labels: {
          ...footerLabels.value,
          cache: t('home.workspace.activity.cache', {
            tokens: formatTokenCount(props.message.meta?.cacheReadTokens ?? 0)
          }),
          cacheTitle: t('home.workspace.activity.cacheTitle', {
            tokens: props.message.meta?.cacheReadTokens ?? 0
          })
        }
      }
    : undefined
)

const parsedUserQuote = computed(() =>
  props.message.role === 'user' ? parseQuotedUserMessage(props.message.content) : null
)

const userQuoteChunk = computed<ContextChunk | null>(() => {
  const parsed = parsedUserQuote.value
  if (!parsed) return null
  const isZh = String(locale?.value ?? '')
    .toLowerCase()
    .startsWith('zh')
  return {
    id: `user-quote-${props.message.id}`,
    title: t('home.quote'),
    body: parsed.quoteText,
    chars: isZh ? `${parsed.charCount} 字` : `${parsed.charCount} chars`,
    ...(parsed.sourceName
      ? {
          source: {
            name: parsed.sourcePath || parsed.sourceName,
            ...(parsed.badge ? { badge: parsed.badge, tone: 'neutral' as const } : {})
          }
        }
      : {})
  }
})

function copyReply(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => {})
}
</script>

<template>
  <div
    class="HomePage-Message"
    :class="[message.role, { 'HomePage-Message--enter': entering }]"
    :data-message-id="message.id"
    :aria-busy="message.status === 'streaming'"
  >
    <template v-if="message.role === 'user'">
      <!-- A voice message: its recording, then its transcript as the bubble. -->
      <TxVoiceClip
        v-if="message.voice"
        class="HomePage-MsgVoice"
        :src="message.voice.url"
        :duration-ms="message.voice.durationMs"
        :play-label="t('home.voiceClip.play')"
        :pause-label="t('home.voiceClip.pause')"
        :seek-label="t('home.voiceClip.seek')"
        :unavailable-label="t('home.voiceClip.unavailable')"
      />
      <TxAttachmentTray
        v-if="message.attachments?.length"
        class="HomePage-MsgAttachments"
        :attachments="message.attachments"
        :preview-title="t('home.attachPreview')"
        :previous-label="t('home.attachPrevious')"
        :next-label="t('home.attachNext')"
        :previous-text="t('home.attachPreviousText')"
        :next-text="t('home.attachNextText')"
        :close-label="t('common.close')"
        :zoom-in-label="t('home.attachViewer.zoomIn')"
        :zoom-out-label="t('home.attachViewer.zoomOut')"
        :reset-label="t('home.attachViewer.reset')"
        :failed-text="t('home.attachViewer.failed')"
        :open-label-formatter="attachOpenLabel"
        :preview-props="attachPreviewProps"
      />
      <div class="HomePage-UserBubble" :class="{ 'is-quoted': Boolean(userQuoteChunk) }">
        <template v-if="userQuoteChunk && parsedUserQuote">
          <TxContextChunk
            class="HomePage-UserQuoteChunk"
            :chunk="userQuoteChunk"
            :appear="false"
            :chip-delay="0"
            data-testid="home-user-quote-chunk"
          />
          <div v-if="parsedUserQuote.prompt" class="HomePage-UserBubblePrompt">
            {{ parsedUserQuote.prompt }}
          </div>
        </template>
        <template v-else>{{ message.content }}</template>
      </div>
      <div class="HomePage-MsgActionsSlot">
        <div class="HomePage-MsgActionsSlotInner">
          <TxMessageActions
            class="HomePage-MsgActions"
            :appear="false"
            :copy-text="message.content"
            :copy-label="t('home.copy')"
            :copied-label="t('home.copied')"
          />
        </div>
      </div>
    </template>

    <template v-else>
      <!-- The host supplies domain data, localized labels and effect handlers only. -->
      <TxAiAssistantTurn
        :segments="segmentsOf(message)"
        :streaming="message.status === 'streaming'"
        :element-props="{
          class: 'HomePage-Reply',
          locale,
          reveal: 'blur',
          wordMs: 26,
          drainMs: 420,
          copyLabel: t('home.copy'),
          copiedLabel: t('home.copied'),
          runnable: true,
          onCodeRun: (payload: CodeRunPayload) => emit('code-run', payload),
          markdownProps: { ...codePreviewLabels, reveal: 'blur' },
          ...codePartProps
        }"
        :tool-call-props="{ class: 'HomePage-Tool', ...toolCallLabels }"
        :chart-props="chartProps"
        :form-props="formProps"
        :widget-props="widgetProps"
        :widget-sandbox="useWidgetSandbox"
        :submitted-forms="submittedForms"
        :form-drafts="formDrafts"
        :show-tool-payload="showToolPayload"
        :payload-label="t('home.toolPayload')"
        :waiting="isAwaitingFirstToken(message)"
        :thinking-verb="thinkingVerb"
        :thinking-label="thinkingLabel"
        :compacting="compacting"
        :compacting-label="t('home.compacting')"
        :steer-label="t('home.workspace.queue.steerInjected')"
        :footer="turnFooter"
        :error="message.status === 'failed' ? errorDisplay(message.error, latest) : undefined"
        @form-submit="submitForm"
        @openui-action="handleOpenUIAction"
        @form-change="(part, values) => formDrafts.set(part.id, values)"
        @payload="payloadFor = $event"
        @copy="copyReply"
        @regenerate="emit('regenerate')"
        @speak="emit('speak')"
        @branch="emit('branch')"
        @retry="emit('retry')"
        @error-action="activateErrorAction(message.error)"
      />
    </template>
  </div>
</template>

<!-- Global on purpose: the page's send-lift ghost is typeset as this same bubble, so the landing
     swap to the real row is invisible. The class is namespaced; nothing else claims it. -->
<style lang="scss">
.HomePage-UserBubble {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: var(--shell-radius-lg);
  background: var(--shell-surface-2);
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-md);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;

  &.is-quoted {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: min(320px, 100%);
    padding: 10px 11px 11px;
    white-space: normal;
  }
}

.HomePage-UserQuoteChunk {
  --tx-bui-surface: color-mix(in srgb, var(--shell-bg) 72%, var(--shell-surface));
  --tx-bui-inset: color-mix(in srgb, var(--shell-surface-2) 86%, var(--shell-bg));
  --tx-bui-hover: var(--shell-surface-2);
  --tx-bui-line: color-mix(in srgb, var(--shell-border) 88%, transparent);
  --tx-bui-ink: var(--shell-text-primary);
  --tx-bui-ink-2: var(--shell-text-secondary);
  --tx-bui-ink-3: var(--shell-text-muted);
  --tx-bui-radius-card: 10px;
  --tx-bui-shadow-card: 0 0 0 1px color-mix(in srgb, var(--shell-border) 92%, transparent);
  --tx-bui-shadow-btn: 0 0 0 1px color-mix(in srgb, var(--shell-border) 92%, transparent);
  width: 100%;

  .tx-bui-context-chunk__bar {
    padding: 7px 11px;
  }

  .tx-bui-context-chunk__body {
    margin: 8px 11px 9px;
    padding: 0;
    white-space: pre-line;
    display: -webkit-box;
    -webkit-line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .tx-bui-context-chunk__footer {
    padding: 0 11px 10px;
  }
}

.HomePage-UserBubblePrompt {
  padding: 0 3px;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-md);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

<style lang="scss" scoped>
.HomePage-Message {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* All arrival physics deform from the bottom edge — where hits land and
     where bubbles rise from. The motion itself runs on WAAPI springs. */
  transform-origin: 50% 100%;

  /* Holds a freshly appended row invisible for the frame between render and
     its spring taking over; the animation's own opacity replaces this. */
  &.HomePage-Message--enter {
    opacity: 0;
  }

  &.user {
    align-items: flex-end;
  }

  &.assistant {
    align-items: flex-start;
  }
}

/**
 * The stand-in that flies from the composer to the landing row. It is a message,
 * so it obeys the message rule: one layer under the composer, which means the
 * bubble rises out from behind the box instead of sliding across its face.
 */
.HomePage-FlightClone {
  z-index: var(--home-z-flight);
}

.HomePage-MsgAttachments {
  max-width: 78%;
}

.HomePage-MsgVoice {
  max-width: 78%;
}

:deep(.HomePage-Tool),
:deep(.HomePage-Chain) {
  width: 100%;
}

/**
 * No fill on replies: in v2 the raised look comes from strokes, and body copy is not a
 * raised surface. The class now sits on TxStreamMarkdown — no `pre-wrap` here, markdown
 * owns its own whitespace; colour and size align the markdown body with the shell.
 */
:deep(.HomePage-Reply) {
  width: 100%;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-md);
  word-break: break-word;
}

.HomePage-MsgActions {
  margin-top: 0;
  padding-top: 16px;
}

// Same treatment for the user bubble's own copy button.
.HomePage-MsgActionsSlot {
  display: grid;
  grid-template-rows: 0fr;
  /* Cancels the 10px row gap while folded; the inner padding restores it when open. */
  margin-top: -10px;
  opacity: 0;
  pointer-events: none;
  transition:
    grid-template-rows 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease;

  &.is-open,
  &:focus-within {
    grid-template-rows: 1fr;
    opacity: 1;
    pointer-events: auto;
  }
}

.HomePage-Message:hover .HomePage-MsgActionsSlot {
  grid-template-rows: 1fr;
  opacity: 1;
  pointer-events: auto;
}

.HomePage-MsgActionsSlotInner {
  min-height: 0;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  /* The watcher never marks rows under reduced motion; this guards a marked
     row against ever being stranded invisible if it does slip through. */
  .HomePage-Message.HomePage-Message--enter {
    opacity: 1;
  }
}
</style>
