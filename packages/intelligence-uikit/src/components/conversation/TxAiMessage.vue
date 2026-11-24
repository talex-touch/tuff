<script setup lang="ts">
import type { AiAttachmentFile, AiMessagePart, AiReasoningPart, AiTextPart, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { FormFieldValue } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { TxAiMessageProps, TxAiTurnFooterProps } from '../../types'
import { TxAttachmentTray } from '@talex-touch/tuffex/attachment-tray'
import { TxMessageActions } from '@talex-touch/tuffex/message-actions'
import { TxVoiceClip } from '@talex-touch/tuffex/voice-clip'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { toMessageSegments } from '../../utils/chain-steps'
import { isAiAwaitingFirstToken, normalizeComposerAttachments } from '../../utils/composer-state'
import TxAiRichBlock from '../content/TxAiRichBlock.vue'
import TxAiMarkdown from '../content/TxAiMarkdown.vue'
import TxAiThinking from '../foundation/TxAiThinking.vue'
import TxAiAssistantTurn from './TxAiAssistantTurn.vue'
import TxAiErrorBlock from './TxAiErrorBlock.vue'
import TxAiTurnFooter from './TxAiTurnFooter.vue'

defineOptions({
  name: 'TxAiMessage',
})

const props = withDefaults(defineProps<TxAiMessageProps>(), {
  markdown: true,
  reveal: true,
  showAvatar: false,
  showActions: true,
  copyable: true,
  regenerable: false,
  speakable: false,
  speakState: 'idle',
  showFooter: true,
  latest: false,
  variant: 'hybrid',
  motion: 'fade',
  openui: true,
  showToolPayload: false,
  labels: () => ({}),
})

const emit = defineEmits<{
  (e: 'imageClick', payload: { url: string, name?: string, messageId: string }): void
  (e: 'attachmentOpen', payload: AiAttachmentFile): void
  (e: 'action', payload: { action: string, messageId: string }): void
  (e: 'copy', text: string, messageId: string): void
  (e: 'regenerate', messageId: string): void
  (e: 'speak', messageId: string): void
  (e: 'branch', messageId: string): void
  (e: 'retry', messageId: string): void
  (e: 'errorAction', messageId: string): void
  (e: 'toolPayload', part: AiToolCallPart): void
  (e: 'formSubmit', part: AiToolCallPart, values: Record<string, FormFieldValue>): void
  (e: 'formChange', part: AiToolCallPart, values: Record<string, FormFieldValue>): void
  (e: 'openuiAction', payload: unknown): void
}>()

const isGenerating = computed(() =>
  props.message.status === 'waiting' || props.message.status === 'streaming',
)

const isAwaitingFirst = computed(() => isAiAwaitingFirstToken({
  status: props.message.status,
  content: props.message.content,
  parts: props.message.parts,
  segments: props.message.segments,
}))

const normalizedAttachments = computed(() =>
  normalizeComposerAttachments(props.message.attachments),
)

const resolvedSegments = computed(() => {
  if (props.message.segments?.length)
    return props.message.segments
  if (!props.message.parts?.length)
    return []

  const aiParts: AiMessagePart[] = []
  for (const part of props.message.parts) {
    if (part.type === 'reasoning' && 'text' in part && typeof part.text === 'string') {
      aiParts.push(part as AiReasoningPart)
    }
    else if (part.type === 'tool-call' && 'id' in part && 'name' in part) {
      aiParts.push(part as AiToolCallPart)
    }
    else if (part.type === 'text' && 'text' in part && typeof part.text === 'string') {
      aiParts.push(part as AiTextPart)
    }
  }
  if (!aiParts.length)
    return []
  return toMessageSegments(aiParts, isGenerating.value)
})

const FOOTER_REVEAL_MS = 4500
const fallbackFooterRevealed = ref(false)
let fallbackFooterTimer: ReturnType<typeof setTimeout> | undefined

function clearFallbackFooterTimer() {
  if (fallbackFooterTimer !== undefined) {
    clearTimeout(fallbackFooterTimer)
    fallbackFooterTimer = undefined
  }
}

watch(
  [() => props.message.id, () => props.message.role, isGenerating, () => props.latest],
  ([nextId, role, generating, latest], [prevId, prevRole, wasGenerating]) => {
    if (nextId !== prevId || role !== 'assistant' || latest) {
      clearFallbackFooterTimer()
      fallbackFooterRevealed.value = false
      return
    }
    if (generating) {
      clearFallbackFooterTimer()
      fallbackFooterRevealed.value = false
      return
    }
    if (wasGenerating && prevRole === 'assistant') {
      fallbackFooterRevealed.value = true
      clearFallbackFooterTimer()
      fallbackFooterTimer = setTimeout(() => {
        fallbackFooterRevealed.value = false
        fallbackFooterTimer = undefined
      }, FOOTER_REVEAL_MS)
    }
  },
)

onBeforeUnmount(clearFallbackFooterTimer)

const resolvedFooter = computed<TxAiTurnFooterProps | undefined>(() => {
  if (!props.showFooter)
    return undefined
  if (props.message.footer)
    return props.message.footer
  if (props.message.role !== 'assistant' || isGenerating.value)
    return undefined
  if (!props.message.content && !props.message.meta)
    return undefined
  return {
    content: props.message.content,
    regenerable: props.regenerable,
    speakState: props.speakState,
    resting: !props.latest && !fallbackFooterRevealed.value,
    motion: props.motion,
    metrics: props.message.meta as TxAiTurnFooterProps['metrics'] | undefined,
  }
})

function handleCopy(text?: string) {
  const payload = text ?? props.message.content ?? ''
  emit('copy', payload, props.message.id)
  emit('action', { action: 'copy', messageId: props.message.id })
}

function handleRegenerate() {
  emit('regenerate', props.message.id)
  emit('action', { action: 'regenerate', messageId: props.message.id })
}

function handleSpeak() {
  emit('speak', props.message.id)
  emit('action', { action: 'speak', messageId: props.message.id })
}

function handleBranch() {
  emit('branch', props.message.id)
  emit('action', { action: 'branch', messageId: props.message.id })
}
</script>

<template>
  <article
    class="tx-ai-message"
    :class="[
      `tx-ai-message--${message.role}`,
      `tx-ai-message--${message.status || 'idle'}`,
      `tx-ai-message--variant-${variant}`,
    ]"
    :data-message-id="message.id"
  >
    <div v-if="showAvatar || $slots.avatar" class="tx-ai-message__avatar">
      <slot name="avatar" :message="message">
        <img
          v-if="message.avatarUrl"
          class="tx-ai-message__avatar-img"
          :src="message.avatarUrl"
          alt=""
        >
        <span v-else class="tx-ai-message__avatar-fallback">
          {{ message.role === 'user' ? 'U' : 'AI' }}
        </span>
      </slot>
    </div>

    <div class="tx-ai-message__body">
      <header v-if="$slots.header" class="tx-ai-message__header">
        <slot name="header" :message="message" />
      </header>

      <template v-if="message.role === 'user'">
        <div class="tx-ai-message__user-stack">
          <TxVoiceClip
            v-if="message.voiceClip"
            class="tx-ai-message__voice"
            :src="message.voiceClip.src"
            :duration-ms="message.voiceClip.durationMs"
            :peaks="message.voiceClip.peaks"
            :play-label="labels?.voicePlay"
            :pause-label="labels?.voicePause"
            :seek-label="labels?.voiceSeek"
            :unavailable-label="message.voiceClip.unavailableLabel || labels?.voiceUnavailable"
          />

          <TxAttachmentTray
            v-if="normalizedAttachments.length"
            class="tx-ai-message__attachments"
            :attachments="normalizedAttachments"
            :removable="false"
            @open="emit('attachmentOpen', $event)"
          />

          <div
            v-if="message.content || $slots.content"
            class="tx-ai-message__user-bubble"
          >
            <slot name="content" :message="message">
              <TxAiMarkdown
                v-if="markdown"
                :content="message.content || ''"
                :reveal="false"
              />
              <div v-else class="tx-ai-message__plain">
                {{ message.content }}
              </div>
            </slot>
          </div>

          <div
            v-if="showActions && copyable && message.content"
            class="tx-ai-message__user-actions"
          >
            <slot name="actions" :message="message">
              <TxMessageActions
                :appear="false"
                :copy-text="message.content"
                :copy-label="labels?.copy"
                :copied-label="labels?.copied"
                :label="labels?.actions"
                @copy="handleCopy($event)"
              />
            </slot>
          </div>
        </div>
      </template>

      <template v-else-if="message.role === 'system'">
        <div class="tx-ai-message__system-pill" role="note">
          <slot name="content" :message="message">
            {{ message.content }}
          </slot>
        </div>
      </template>

      <template v-else>
        <div class="tx-ai-message__assistant-content">
          <slot name="content" :message="message">
            <TxAiAssistantTurn
              v-if="resolvedSegments.length"
              :segments="resolvedSegments"
              :streaming="isGenerating"
              :waiting="Boolean(message.waiting || isAwaitingFirst)"
              :thinking-verb="message.thinkingVerb"
              :thinking-label="message.thinkingLabel"
              :compacting="message.compacting"
              :compacting-label="message.compactingLabel"
              :footer="resolvedFooter"
              :error="message.error"
              :motion="motion"
              :openui="openui"
              :openui-labels="openuiLabels"
              :resolve-openui-image="resolveOpenuiImage"
              :widget-sandbox="widgetSandbox"
              :has-tool-face="hasToolFace"
              :submitted-forms="submittedForms"
              :form-drafts="formDrafts"
              :show-tool-payload="showToolPayload"
              :payload-label="labels?.payload"
              @copy="handleCopy"
              @regenerate="handleRegenerate"
              @speak="handleSpeak"
              @branch="handleBranch"
              @retry="emit('retry', message.id)"
              @error-action="emit('errorAction', message.id)"
              @payload="emit('toolPayload', $event)"
              @form-submit="(part, values) => emit('formSubmit', part, values)"
              @form-change="(part, values) => emit('formChange', part, values)"
              @openui-action="emit('openuiAction', $event)"
            >
              <template v-if="$slots.tool" #tool="slotProps">
                <slot name="tool" v-bind="slotProps" />
              </template>
            </TxAiAssistantTurn>

            <template v-else>
              <TxAttachmentTray
                v-if="normalizedAttachments.length"
                class="tx-ai-message__attachments"
                :attachments="normalizedAttachments"
                :removable="false"
                @open="emit('attachmentOpen', $event)"
              />

              <div v-if="message.blocks?.length" class="tx-ai-message__blocks">
                <TxAiRichBlock
                  v-for="(block, index) in message.blocks"
                  :key="block.id || index"
                  :block="block"
                  :labels="labels"
                />
              </div>

              <TxAiThinking
                v-else-if="isAwaitingFirst"
                :text="message.thinkingLabel || labels?.generating || 'Generating...'"
                variant="dots"
              />

              <TxAiMarkdown
                v-else-if="markdown"
                :content="message.content || ''"
                :streaming="isGenerating"
                :reveal="reveal"
              />

              <div v-else class="tx-ai-message__plain">
                {{ message.content }}
              </div>

              <TxAiErrorBlock
                v-if="message.error"
                v-bind="message.error"
                @retry="emit('retry', message.id)"
                @action="emit('errorAction', message.id)"
              />
            </template>
          </slot>
        </div>

        <slot
          v-if="$slots.footer || (!resolvedSegments.length && resolvedFooter)"
          name="footer"
          :message="message"
        >
          <TxAiTurnFooter
            v-if="!resolvedSegments.length && resolvedFooter"
            v-bind="resolvedFooter"
            @copy="handleCopy"
            @regenerate="handleRegenerate"
            @speak="handleSpeak"
            @branch="handleBranch"
          />
        </slot>
      </template>
    </div>
  </article>
</template>
