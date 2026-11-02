<script lang="ts" name="HomeMessageRow" setup>
import type { AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import { TxAiAssistantTurn } from '@talex-touch/intelligence-uikit'
import { TxAttachmentTray } from '@talex-touch/tuffex/attachment-tray'
import { TxMessageActions } from '@talex-touch/tuffex/message-actions'
import { TxStreamElement } from '@talex-touch/tuffex/stream-element'
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'
import { TxThinkingOrb } from '@talex-touch/tuffex/thinking-orb'
import { TxVoiceClip } from '@talex-touch/tuffex/voice-clip'
import { inject } from 'vue'
import { useI18n } from 'vue-i18n'
import ToolChartCard from '~/components/intelligence/ToolChartCard.vue'
import ToolFormCard from '~/components/intelligence/ToolFormCard.vue'
import ToolWidgetCard from '~/components/intelligence/ToolWidgetCard.vue'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { isAwaitingFirstToken } from './composer/send-state'
import { homeMessageContextKey } from './composables/home-message-context'
import type { SpeakState } from './composables/useReadAloud'
import HomeTurnError from './HomeTurnError.vue'
import HomeTurnFooter from './HomeTurnFooter.vue'

/**
 * One message of the thread: the user's bubble with its recording and attachments, or the
 * assistant's turn - reasoning, prose and tool calls in streamed order, then its error or footer.
 *
 * The root keeps the page's DOM contract (`.HomePage-Message`, `[data-message-id]`,
 * `.HomePage-UserBubble`): the send choreography finds the landing bubble and clones the row by
 * those, so they are the stage's names rather than this component's.
 */
defineProps<{
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
  speakState: SpeakState
  showMetrics: boolean
}>()

const emit = defineEmits<{
  (event: 'retry'): void
  (event: 'regenerate'): void
  (event: 'speak'): void
  (event: 'branch'): void
}>()

const { t, locale } = useI18n()

const {
  segmentsOf,
  chartSpecOf,
  formSpecOf,
  widgetSpecOf,
  submittedForms,
  formDrafts,
  submitForm,
  showToolPayload,
  payloadFor,
  toolCallLabels,
  markdownLabels,
  codePartProps,
  attachPreviewProps,
  attachOpenLabel,
  thinkingVerb,
  thinkingLabel
} = inject(homeMessageContextKey)!

function openPayload(part: AiToolCallPart): void {
  payloadFor.value = part
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
      <div class="HomePage-UserBubble">
        {{ message.content }}
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
      <!-- Reasoning, prose and tool calls in the order they streamed. The kit
           keys each segment, so a streaming delta never resets what the reader
           opened. Tools with a face of their own (widget, form, chart) come
           through the `tool` slot; the machinery card stays for the rest. -->
      <TxAiAssistantTurn
        :segments="segmentsOf(message)"
        :streaming="message.status === 'streaming'"
        :element-props="{
          class: 'HomePage-Reply',
          locale,
          copyLabel: t('home.copy'),
          copiedLabel: t('home.copied'),
          markdownProps: markdownLabels,
          ...codePartProps
        }"
        :tool-call-props="{ class: 'HomePage-Tool', ...toolCallLabels }"
        :has-tool-face="(part) => !!(formSpecOf(part) || chartSpecOf(part) || widgetSpecOf(part))"
      >
        <template #tool="{ segment }">
          <div class="HomePage-WidgetBlock">
            <ToolWidgetCard
              v-if="widgetSpecOf(segment.part)"
              :source="widgetSpecOf(segment.part)!.source"
              :title="widgetSpecOf(segment.part)!.title"
              :fallback="segment.part.output"
            />
            <ToolFormCard
              v-else-if="formSpecOf(segment.part)"
              v-bind="codePartProps"
              :spec="formSpecOf(segment.part)!"
              :submitted="submittedForms.has(segment.part.id) || segment.part.submitted === true"
              :initial-values="formDrafts.get(segment.part.id)"
              :submit-label="t('home.formSubmit')"
              :reset-label="t('home.formReset')"
              :required-hint="t('home.formRequired')"
              :submitted-label="t('home.formDone')"
              :select-placeholder="t('home.formSelect')"
              @submit="submitForm(segment.part, $event)"
              @change="formDrafts.set(segment.part.id, $event)"
            />
            <ToolChartCard
              v-else
              :spec="chartSpecOf(segment.part)!"
              :animate="message.status === 'streaming'"
            />

            <!-- The raw call, for builders only: none outside dev builds. -->
            <button
              v-if="showToolPayload"
              class="HomePage-PayloadBtn"
              type="button"
              @click="openPayload(segment.part)"
            >
              <span class="i-ri-braces-line" />
              <span>{{ t('home.toolPayload') }}</span>
            </button>
          </div>
        </template>
      </TxAiAssistantTurn>

      <!-- A turn that never carried structured parts stays a
           plain string; the loop above has nothing to render
           for it. Guarded on `parts` rather than on segment
           count so a turn whose parts are all tool calls does
           not replay its text here as well. -->
      <TxStreamElement
        v-if="!message.parts && message.content"
        class="HomePage-Reply"
        :locale="locale"
        :copy-label="t('home.copy')"
        :copied-label="t('home.copied')"
        :markdown-props="markdownLabels"
        v-bind="codePartProps"
        :content="message.content"
        :streaming="message.status === 'streaming'"
      />

      <!-- Pre-first-token wait: a thinking orb, rolled fresh per response and
           tinted with its gradient ink, beside a verb that is fresh for this
           turn. The send key's `waiting` reads the same predicate, so the two
           cannot disagree. -->
      <div v-else-if="isAwaitingFirstToken(message)" class="HomePage-Thinking">
        <TxThinkingOrb :size="64" :display-size="28" variant="gradient" :label="thinkingVerb" />
        <span class="HomePage-ThinkingLabel">
          <TxTextMorph :text="thinkingLabel" :duration-ms="320" />
        </span>
      </div>

      <!-- The provider is squeezing its context mid-turn; a
           silent pause here read as a hang. -->
      <p
        v-if="message.status === 'streaming' && compacting"
        class="HomePage-Compacting"
        role="status"
      >
        <span class="i-ri-archive-2-line" aria-hidden="true" />
        <span>{{ t('home.compacting') }}</span>
      </p>

      <HomeTurnError
        v-if="message.status === 'failed'"
        :error="message.error"
        :retryable="latest"
        @retry="emit('retry')"
      />

      <!-- Surfaces out of a blur once the answer settles; the last
           reply keeps it on show, older ones reveal on hover. -->
      <HomeTurnFooter
        v-if="message.status === 'complete'"
        :message="message"
        :resting="resting"
        :regenerable="latest && !streaming"
        :speak-state="speakState"
        :branchable="branchable"
        :branching="branching"
        :show-metrics="showMetrics"
        @regenerate="emit('regenerate')"
        @speak="emit('speak')"
        @branch="emit('branch')"
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

/** A widget stands on its own: one quiet frame, no tool-log chrome around it. */
.HomePage-WidgetBlock {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 14px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-surface);
  box-sizing: border-box;
}

.HomePage-PayloadBtn {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  align-self: flex-start;
  padding: 2px 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-family: inherit;
  font-size: var(--shell-fs-caption);
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-secondary);
  }
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

// The orb and its verb read as one line of the answer's own type, so the wait
// looks like the start of a reply rather than a spinner bolted on beside it.
.HomePage-Thinking {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  margin: 4px 0;
  color: var(--shell-text-muted);
}

.HomePage-ThinkingLabel {
  display: inline-flex;
  align-items: center;
  font-size: var(--shell-fs-md);
  font-style: italic;
  line-height: 1.4;
  color: var(--shell-text-muted);
  user-select: none;
  white-space: nowrap;
}

.HomePage-Compacting {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin: 2px 0 0;
  color: var(--shell-text-muted);
  font-size: 12px;
  animation: home-compacting-pulse 1.6s ease-in-out infinite;
}

@keyframes home-compacting-pulse {
  0%,
  100% {
    opacity: 0.55;
  }

  50% {
    opacity: 1;
  }
}

.HomePage-MsgActions {
  margin-top: 0;
}

// Same treatment for the user bubble's own copy button.
.HomePage-MsgActionsSlot {
  display: grid;
  grid-template-rows: 0fr;
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
  padding-top: 6px;
}

@media (prefers-reduced-motion: reduce) {
  /* The watcher never marks rows under reduced motion; this guards a marked
     row against ever being stranded invisible if it does slip through. */
  .HomePage-Message.HomePage-Message--enter {
    opacity: 1;
  }

  .HomePage-Compacting {
    animation: none;
  }
}
</style>
