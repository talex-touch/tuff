<script lang="ts" name="HomePage" setup>
import { TxTypingIndicator } from '@talex-touch/tuffex/chat'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLogo from '~/components/icon/AppLogo.vue'
import {
  CONVERSATION_ERROR_EMPTY_RESPONSE,
  CONVERSATION_ERROR_PROVIDER_UNAVAILABLE
} from '~/modules/conversation/conversation-error-display'
import { useHomeConversation } from '~/modules/conversation/useHomeConversation'

/**
 * Home empty state from artboard `JVvAr`, plus the in-place conversation from task
 * `08-04-home-conversation` R1.
 *
 * The empty state and the message stream share one route and one composer node — swapping the
 * composer between two branches would drop input focus on the very first send. Conversation state
 * lives in memory only; persistence, `/home/c/:id` and the sidebar history land in R2/R3.
 */
const { t } = useI18n()

const MAX_INPUT_HEIGHT = 200
/** How close to the bottom still counts as "following along" for auto-scroll. */
const STICK_TO_BOTTOM_THRESHOLD = 80

const draft = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
const streamRef = ref<HTMLElement | null>(null)

const conversation = useHomeConversation()
const { isEmpty, isStreaming, messages } = conversation

/** Follow the stream only while the user is already at the bottom; never yank them back down. */
let stickToBottom = true

const canSend = computed(() => draft.value.trim().length > 0 && !isStreaming.value)

/**
 * Artboards `QiI0C` / `AHQQk` replaced the old 「工具」 button with two distinct affordances: a
 * standalone Auto Context toggle on the left, and a model + reasoning-effort pill next to send.
 * Enabling individual tools moved to 「设置 · 插件与工具」, so nothing here opens a tool list.
 *
 * Local state only — persistence and the model menu land with the conversation work.
 */
const autoContext = ref(true)

const quickPills = [
  { icon: 'i-ri-file-search-line', key: 'searchFiles' },
  { icon: 'i-ri-translate-2', key: 'translateClipboard' },
  { icon: 'i-ri-folder-line', key: 'tidyDownloads' },
  { icon: 'i-ri-terminal-box-line', key: 'runScript' }
] as const

/** Grows the composer with its content up to a cap, then scrolls — the usual chat affordance. */
function autoGrow(): void {
  const input = inputRef.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`
}

async function applyPill(key: string): Promise<void> {
  draft.value = t(`home.pill.${key}`)
  await nextTick()
  autoGrow()
  inputRef.value?.focus()
}

async function submit(): Promise<void> {
  if (!canSend.value) return

  const text = draft.value
  draft.value = ''
  await nextTick()
  autoGrow()
  stickToBottom = true

  await conversation.send(text)
}

function handleKeydown(event: KeyboardEvent): void {
  // `isComposing` keeps Enter from cutting an IME candidate selection short.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void submit()
}

function resolveErrorTitle(code: string | undefined): string {
  if (code === CONVERSATION_ERROR_PROVIDER_UNAVAILABLE) return t('home.error.noProvider')
  if (code === CONVERSATION_ERROR_EMPTY_RESPONSE) return t('home.error.empty')
  return t('home.error.generic')
}

function handleStreamScroll(): void {
  const element = streamRef.value
  if (!element) return
  stickToBottom =
    element.scrollHeight - element.scrollTop - element.clientHeight < STICK_TO_BOTTOM_THRESHOLD
}

watch(
  () => messages.value.map((message) => message.content.length).join(','),
  async () => {
    if (!stickToBottom) return
    await nextTick()
    const element = streamRef.value
    if (element) element.scrollTop = element.scrollHeight
  }
)
</script>

<template>
  <div class="HomePage" :class="{ conversing: !isEmpty }">
    <div class="HomePage-Center">
      <div v-if="isEmpty" class="HomePage-Head">
        <AppLogo class="HomePage-Mark" />
        <h1 class="HomePage-Greeting">
          {{ t('home.greeting') }}
        </h1>
      </div>

      <div v-else ref="streamRef" class="HomePage-Stream" role="log" @scroll="handleStreamScroll">
        <div class="HomePage-StreamInner">
          <div
            v-for="(message, index) in messages"
            :key="message.id"
            class="HomePage-Message"
            :class="message.role"
            :aria-busy="message.status === 'streaming'"
          >
            <div v-if="message.role === 'user'" class="HomePage-UserBubble">
              {{ message.content }}
            </div>

            <template v-else>
              <p v-if="message.content" class="HomePage-Reply">
                {{ message.content }}
              </p>

              <TxTypingIndicator
                v-else-if="message.status === 'streaming'"
                class="HomePage-Thinking"
                variant="dots"
                :show-text="false"
                :size="6"
                :gap="5"
                :aria-label="t('home.thinking')"
              />

              <div v-if="message.status === 'failed'" class="HomePage-Error" role="alert">
                <span class="i-ri-error-warning-line HomePage-ErrorIcon" />
                <div class="HomePage-ErrorBody">
                  <p class="HomePage-ErrorTitle">
                    {{ resolveErrorTitle(message.error?.code) }}
                  </p>
                  <p v-if="message.error?.detail" class="HomePage-ErrorDetail">
                    {{ message.error.detail }}
                  </p>
                </div>
                <button
                  v-if="index === messages.length - 1"
                  class="HomePage-RetryBtn"
                  type="button"
                  @click="conversation.retry()"
                >
                  {{ t('home.retry') }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="HomePage-ComposerGroup">
        <div class="HomePage-Composer">
          <textarea
            ref="inputRef"
            v-model="draft"
            class="HomePage-Input"
            rows="1"
            :aria-label="t('home.placeholder')"
            :placeholder="t('home.placeholder')"
            @input="autoGrow"
            @keydown="handleKeydown"
          />

          <div class="HomePage-ToolRow">
            <div class="HomePage-ToolLeft">
              <button class="HomePage-RoundBtn" type="button" :aria-label="t('home.attach')">
                <span class="i-ri-add-line" />
              </button>
              <button
                class="HomePage-PillBtn"
                :class="{ active: autoContext }"
                type="button"
                :aria-pressed="autoContext"
                :title="t('home.autoContextHint')"
                @click="autoContext = !autoContext"
              >
                <span class="i-ri-radar-line" />
                <span>{{ t('home.autoContext') }}</span>
              </button>
            </div>

            <div class="HomePage-ToolRight">
              <button class="HomePage-ModelPill" type="button" :aria-label="t('home.model')">
                <span class="HomePage-ModelName">{{ t('home.modelName') }}</span>
                <span class="HomePage-ModelEffort">{{ t('home.effortHigh') }}</span>
                <span class="i-ri-arrow-down-s-line" />
              </button>
              <button
                class="HomePage-RoundBtn borderless"
                type="button"
                :aria-label="t('home.voice')"
              >
                <span class="i-ri-mic-line" />
              </button>
              <button
                v-if="isStreaming"
                class="HomePage-SendBtn"
                type="button"
                :aria-label="t('home.stop')"
                @click="conversation.stop()"
              >
                <span class="i-ri-stop-fill" />
              </button>
              <button
                v-else
                class="HomePage-SendBtn"
                type="button"
                :disabled="!canSend"
                :aria-label="t('home.send')"
                @click="submit"
              >
                <span class="i-ri-arrow-up-line" />
              </button>
            </div>
          </div>
        </div>

        <div v-if="isEmpty" class="HomePage-Pills">
          <button
            v-for="pill in quickPills"
            :key="pill.key"
            class="HomePage-QuickPill"
            type="button"
            @click="applyPill(pill.key)"
          >
            <span :class="pill.icon" />
            <span>{{ t(`home.pill.${pill.key}`) }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomePage {
  width: 100%;
  height: 100%;
  overflow-y: auto;

  // The stream owns the scroll once a conversation exists, so the page itself must not scroll too.
  &.conversing {
    overflow: hidden;
  }
}

.HomePage-Center {
  display: flex;
  flex-direction: column;
  gap: 30px;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  // Artboard lifts the block above true centre rather than bottom-weighting it like Codex.
  padding-bottom: 52px;
  box-sizing: border-box;

  .HomePage.conversing & {
    gap: 16px;
    justify-content: flex-start;
    height: 100%;
    min-height: 0;
    padding-bottom: 20px;
  }
}

.HomePage-Head {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
}

.HomePage-Mark {
  width: 64px;
  height: 64px;
}

.HomePage-Greeting {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-display);
  font-weight: 600;
}

.HomePage-Stream {
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow-y: auto;
}

.HomePage-StreamInner {
  display: flex;
  flex-direction: column;
  gap: 20px;
  // Same column as the composer: the answer should read as coming out of the box it was typed in.
  width: 720px;
  max-width: calc(100vw - var(--shell-sidebar-width) - 64px);
  margin: 0 auto;
  padding: 28px 0 8px;
  box-sizing: border-box;
}

.HomePage-Message {
  display: flex;
  flex-direction: column;
  gap: 10px;

  &.user {
    align-items: flex-end;
  }

  &.assistant {
    align-items: flex-start;
  }
}

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

/* No fill on replies: in v2 the raised look comes from strokes, and body copy is not a raised surface. */
.HomePage-Reply {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-md);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/**
 * The shell runs its own token layer, so the indicator is recoloured through the one hook TuffEx
 * exposes for exactly that case rather than by restyling its internals.
 */
.HomePage-Thinking {
  --tx-typing-indicator-color: var(--shell-text-muted);

  height: 22px;
}

.HomePage-Error {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--shell-radius-lg);
  background: var(--shell-danger-soft);
  box-sizing: border-box;
}

.HomePage-ErrorIcon {
  flex: none;
  margin-top: 1px;
  color: var(--shell-danger);
}

.HomePage-ErrorBody {
  flex: 1;
  min-width: 0;
}

.HomePage-ErrorTitle {
  margin: 0;
  color: var(--shell-danger);
  font-size: var(--shell-fs-body);
  line-height: 1.5;
}

.HomePage-ErrorDetail {
  margin: 4px 0 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  word-break: break-word;
}

.HomePage-RetryBtn {
  flex: none;
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--shell-danger-border);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-danger);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background-color 0.15s ease;

  // The block itself is already `danger-soft`, so the hover has to go a step deeper to register.
  &:hover {
    background: color-mix(in srgb, var(--shell-danger) 12%, transparent);
  }
}

.HomePage-ComposerGroup {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
}

.HomePage-Composer {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 720px;
  max-width: calc(100vw - var(--shell-sidebar-width) - 64px);
  padding: 16px 16px 12px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-2xl);
  background: var(--shell-bg);
  box-shadow: 0 2px 14px var(--shell-shadow);
  box-sizing: border-box;
  transition: border-color 0.15s ease;

  &:focus-within {
    border-color: var(--shell-primary);
  }
}

.HomePage-Input {
  width: 100%;
  max-height: 200px;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font-family: inherit;
  font-size: var(--shell-fs-md);
  line-height: 1.5;
  resize: none;
  // The focus indicator is promoted to the whole composer via `:focus-within`, so it outlines
  // what reads as the field instead of drawing a second ring inside the card.
  outline: none;
}

textarea.HomePage-Input:focus-visible {
  outline: none;
  box-shadow: none;
}

.HomePage-Input::placeholder {
  color: var(--shell-text-muted);
}

.HomePage-ToolRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.HomePage-ToolLeft,
.HomePage-ToolRight {
  display: flex;
  gap: 8px;
  align-items: center;
}

.HomePage-RoundBtn,
.HomePage-PillBtn,
.HomePage-SendBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  border: 1px solid var(--shell-border-strong);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.HomePage-RoundBtn {
  width: 30px;

  &.borderless {
    border-color: transparent;
  }

  &:hover {
    background: var(--shell-surface);
  }
}

.HomePage-PillBtn {
  gap: 6px;
  padding: 0 12px;
  font-size: 12.5px;

  &:hover {
    background: var(--shell-surface);
  }

  /* Auto Context reads as on by default, so the enabled state carries the accent. */
  &.active {
    border-color: var(--shell-primary-border);
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
    font-weight: 500;
  }
}

/**
 * Sits next to send rather than on the left: the model and effort are properties of the message
 * about to be sent, not of the composer's input affordances.
 */
.HomePage-ModelPill {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 28px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface-2);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: var(--shell-border-strong);
  }

  .i-ri-arrow-down-s-line {
    color: var(--shell-text-muted);
  }
}

.HomePage-ModelName {
  color: var(--shell-text-secondary);
  font-weight: 500;
}

.HomePage-ModelEffort {
  color: var(--shell-text-muted);
}

.HomePage-SendBtn {
  width: 30px;
  border-color: transparent;
  background: var(--shell-primary);
  color: var(--shell-on-primary);

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  // Artboard `AHQQk`: an empty composer carries a neutral key, not a faded primary one — a
  // dimmed accent still reads as "the send button, but broken".
  &:disabled {
    background: var(--shell-surface-2);
    color: var(--shell-text-muted);
    cursor: not-allowed;
  }
}

.HomePage-Pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.HomePage-QuickPill {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  padding: 7px 12px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-text-regular);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: var(--shell-border-strong);
  }
}
</style>
