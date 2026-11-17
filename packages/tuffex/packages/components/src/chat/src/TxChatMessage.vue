<script setup lang="ts">
import type { AiAttachment } from '../../ai-elements/src/types'
import type TxStreamMarkdownComponent from '../../stream-markdown/src/TxStreamMarkdown.vue'
import type TxVoiceClipComponent from '../../voice-clip/src/TxVoiceClip.vue'
import type {
  ChatMessageActionsMode,
  ChatMessageAttachment,
  ChatMessageAttachmentImage,
  ChatMessageEmits,
  ChatMessageProps,
} from './types'
import { computed, onMounted, ref, useSlots, watch } from 'vue'
import { useLazyComponent } from '../../../../utils/use-lazy-component'
import TxAttachmentTray from '../../attachment-tray/src/TxAttachmentTray.vue'
import TxMarkdownView from '../../markdown-view/src/TxMarkdownView.vue'
import TxMessageActions from '../../message-actions/src/TxMessageActions.vue'

defineOptions({
  name: 'TxChatMessage',
})

const props = withDefaults(defineProps<ChatMessageProps>(), {
  markdown: true,
  attachmentLabel: 'Open image attachment',
  variant: 'bubble',
  showAvatar: undefined,
  streaming: undefined,
  streamMarkdown: true,
  actions: undefined,
  copyable: false,
  regenerable: false,
  speakable: false,
  speakState: 'idle',
  copyLabel: 'Copy',
  copiedLabel: 'Copied',
  regenerateLabel: 'Regenerate',
  speakLabel: 'Read aloud',
  stopSpeakLabel: 'Stop reading',
  retryLabel: 'Retry',
})

const emit = defineEmits<ChatMessageEmits>()
const slots = useSlots()

const isMounted = ref(false)

const isStreaming = computed(() => props.streaming ?? props.message.status === 'streaming')
const isPending = computed(() => props.message.status === 'pending')
const isError = computed(() => props.message.status === 'error' || Boolean(props.message.error))

const shouldShowAvatar = computed(() => {
  if (props.showAvatar !== undefined)
    return props.showAvatar
  if (props.variant === 'bubble')
    return true
  return Boolean(props.message.avatarUrl || slots.avatar)
})

const roleClass = computed(() => `tx-chat-message--${props.message.role}`)

const { component: streamMarkdownComp, load: loadStreamMarkdown } = useLazyComponent<typeof TxStreamMarkdownComponent>(
  () => import('../../stream-markdown').then(module => module.TxStreamMarkdown),
  () => {},
)
const { component: voiceClipComp, load: loadVoiceClip } = useLazyComponent<typeof TxVoiceClipComponent>(
  () => import('../../voice-clip').then(module => module.TxVoiceClip),
  () => {},
)

watch(
  () => Boolean(props.markdown && props.streamMarkdown && isStreaming.value),
  (active) => {
    if (active)
      loadStreamMarkdown()
  },
  { immediate: true },
)

watch(
  () => Boolean(props.message.voice?.src),
  (hasVoice) => {
    if (hasVoice)
      loadVoiceClip()
  },
  { immediate: true },
)

const isLegacyImageAttachment = (item: ChatMessageAttachment): item is ChatMessageAttachmentImage =>
  'type' in item && item.type === 'image'

const legacyImageAttachments = computed(() =>
  (props.message.attachments ?? []).filter(isLegacyImageAttachment),
)

const trayAttachments = computed<AiAttachment[]>(() =>
  (props.message.attachments ?? []).filter((item): item is AiAttachment => 'kind' in item),
)

const effectiveActionsMode = computed<ChatMessageActionsMode>(() => {
  if (props.actions)
    return props.actions
  if (slots.actions || props.copyable || props.regenerable || props.speakable)
    return 'hover'
  return 'none'
})

const showActionRow = computed(() =>
  effectiveActionsMode.value !== 'none'
  && !isStreaming.value
  && (Boolean(slots.actions) || props.copyable || props.regenerable || props.speakable),
)

const createdText = computed(() => {
  if (!isMounted.value)
    return ''
  if (!props.message.createdAt)
    return ''
  const d = new Date(props.message.createdAt)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
})

onMounted(() => {
  isMounted.value = true
})

function onImageClick(url: string, name?: string): void {
  emit('imageClick', { url, name, messageId: props.message.id })
}
</script>

<template>
  <article
    class="tx-chat-message"
    :class="[
      roleClass,
      `is-variant-${variant}`,
      {
        'is-streaming': isStreaming,
        'is-pending': isPending,
        'is-error': isError,
        'is-actions-always': effectiveActionsMode === 'always',
      },
    ]"
  >
    <div class="tx-chat-message__meta">
      <div v-if="shouldShowAvatar" class="tx-chat-message__avatar">
        <slot name="avatar" :message="message">
          <img v-if="message.avatarUrl" :src="message.avatarUrl" alt="">
          <div v-else class="tx-chat-message__avatar-fallback" aria-hidden="true" />
        </slot>
      </div>

      <div class="tx-chat-message__body">
        <div v-if="slots.voice || message.voice?.src" class="tx-chat-message__voice">
          <slot name="voice" :message="message">
            <component
              :is="voiceClipComp"
              v-if="voiceClipComp && message.voice?.src"
              :src="message.voice.src"
              :duration-ms="message.voice.durationMs"
              :peaks="message.voice.peaks"
            />
          </slot>
        </div>

        <div class="tx-chat-message__bubble">
          <header v-if="slots.header || createdText" class="tx-chat-message__header">
            <slot name="header" :message="message">
              <span v-if="createdText" class="tx-chat-message__time">{{ createdText }}</span>
            </slot>
          </header>

          <div class="tx-chat-message__content">
            <slot name="content" :message="message">
              <component
                :is="streamMarkdownComp"
                v-if="markdown && streamMarkdown && isStreaming && streamMarkdownComp"
                :content="message.content"
                :streaming="isStreaming"
              />
              <TxMarkdownView v-else-if="markdown" :content="message.content" />
              <div v-else class="tx-chat-message__plain">
                {{ message.content }}
              </div>
            </slot>
          </div>

          <div v-if="slots.status || message.metrics || (isPending && !message.content)" class="tx-chat-message__status">
            <slot name="status" :message="message">
              <span v-if="isPending && !message.content" class="tx-chat-message__typing" aria-hidden="true">
                <i /><i /><i />
              </span>
              <span v-if="message.metrics" class="tx-chat-message__metrics">{{ message.metrics }}</span>
            </slot>
          </div>

          <div v-if="isError || slots.error" class="tx-chat-message__error" role="alert">
            <slot name="error" :message="message" :retry="() => emit('retry', message.id)">
              <span v-if="message.error" class="tx-chat-message__error-text">{{ message.error }}</span>
              <button
                type="button"
                class="tx-chat-message__retry"
                @click="emit('retry', message.id)"
              >
                {{ retryLabel }}
              </button>
            </slot>
          </div>

          <div
            v-if="slots.attachments || legacyImageAttachments.length || trayAttachments.length"
            class="tx-chat-message__attachments"
          >
            <slot name="attachments" :message="message" :attachments="message.attachments ?? []">
              <TxAttachmentTray
                v-if="trayAttachments.length"
                :attachments="trayAttachments"
              />
              <button
                v-for="(a, idx) in legacyImageAttachments"
                :key="idx"
                type="button"
                class="tx-chat-message__thumb"
                :aria-label="a.name || attachmentLabel"
                @click="onImageClick(a.url, a.name)"
              >
                <!-- The button carries the accessible name; keep the image decorative
                     so an omitted `name` never leaves the button unlabeled. -->
                <img :src="a.url" alt="" loading="lazy">
              </button>
            </slot>
          </div>

          <div v-if="slots.footer" class="tx-chat-message__footer">
            <slot name="footer" :message="message" />
          </div>
        </div>

        <div v-if="showActionRow" class="tx-chat-message__actions-wrap">
          <div class="tx-chat-message__actions-inner">
            <slot name="actions" :message="message">
              <TxMessageActions
                :copy-text="copyable ? message.content : undefined"
                :regenerable="regenerable"
                :speakable="speakable"
                :speak-state="speakState"
                :appear="false"
                :copy-label="copyLabel"
                :copied-label="copiedLabel"
                :regenerate-label="regenerateLabel"
                :speak-label="speakLabel"
                :stop-speak-label="stopSpeakLabel"
                @copy="emit('copy', { text: $event, messageId: message.id })"
                @regenerate="emit('regenerate', message.id)"
                @speak="emit('speak', message.id)"
              />
            </slot>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.tx-chat-message {
  width: 100%;
}

.tx-chat-message__meta {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tx-chat-message__avatar {
  width: 28px;
  height: 28px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--tx-fill-color-light, #f5f7fa);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.tx-chat-message__avatar-fallback {
  width: 100%;
  height: 100%;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tx-color-primary, #409eff) 30%, transparent),
    color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 75%, transparent)
  );
}

.tx-chat-message__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tx-chat-message__voice {
  display: flex;
}

.tx-chat-message__bubble {
  min-width: 0;
  border-radius: 14px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  padding: 10px 12px;
}

.tx-chat-message__header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 6px;
}

.tx-chat-message__time,
.tx-chat-message__metrics {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
}

.tx-chat-message__plain {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
  color: var(--tx-text-color-primary, #111827);
}

.tx-chat-message__status {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tx-chat-message__typing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;

  i {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: var(--tx-text-color-secondary, #6b7280);
    animation: tx-chat-msg-pulse 1.2s ease-in-out infinite;
  }

  i:nth-child(2) {
    animation-delay: 0.16s;
  }

  i:nth-child(3) {
    animation-delay: 0.32s;
  }
}

.tx-chat-message__error {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 8%, transparent);
  color: var(--tx-color-danger, #f56c6c);
  font-size: 12px;
}

.tx-chat-message__retry {
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--tx-color-danger, #f56c6c) 35%, transparent);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--tx-color-danger, #f56c6c);
    outline-offset: 2px;
  }
}

.tx-chat-message__attachments {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tx-chat-message__thumb {
  width: 92px;
  height: 64px;
  border-radius: 12px;
  border: 1px solid var(--tx-border-color-lighter, #e5e7eb);
  background: var(--tx-fill-color-blank, #fff);
  padding: 0;
  overflow: hidden;
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
  }
}

.tx-chat-message__footer {
  margin-top: 6px;
}

.tx-chat-message__actions-wrap {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.16s ease;
}

.tx-chat-message__actions-inner {
  overflow: hidden;
  display: flex;
  align-items: center;
}

.tx-chat-message:hover .tx-chat-message__actions-wrap,
.tx-chat-message:focus-within .tx-chat-message__actions-wrap,
.tx-chat-message.is-actions-always .tx-chat-message__actions-wrap {
  grid-template-rows: 1fr;
  opacity: 1;
}

.tx-chat-message--user .tx-chat-message__meta {
  flex-direction: row-reverse;
}

.tx-chat-message--user .tx-chat-message__bubble {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 7%, var(--tx-fill-color-blank, #fff));
  border-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 35%, transparent);
}

.tx-chat-message--user.is-variant-hybrid {
  .tx-chat-message__body {
    align-items: flex-end;
  }

  .tx-chat-message__bubble {
    max-width: min(78%, 560px);
    padding: 9px 14px;
    background: var(--tx-fill-color-light, #f5f7fa);
    border-color: var(--tx-border-color-lighter, #e5e7eb);
  }

  .tx-chat-message__voice {
    justify-content: flex-end;
  }

  .tx-chat-message__actions-inner {
    justify-content: flex-end;
  }
}

.tx-chat-message--assistant.is-variant-hybrid .tx-chat-message__bubble,
.tx-chat-message.is-variant-clean .tx-chat-message__bubble {
  border-color: transparent;
  background: transparent;
  padding: 2px 0;
}

.tx-chat-message--system .tx-chat-message__bubble {
  background: color-mix(in srgb, var(--tx-fill-color, #f0f2f5) 55%, transparent);
}

@keyframes tx-chat-msg-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tx-chat-message__typing i {
    animation: none;
  }
  .tx-chat-message__actions-wrap {
    transition: none;
  }
}
</style>
