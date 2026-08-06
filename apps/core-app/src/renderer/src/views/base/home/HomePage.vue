<script lang="ts" name="HomePage" setup>
import type { AiAttachment, AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { ToolChartSpec } from '~/components/intelligence/ToolChartCard.vue'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { TxAttachmentTray } from '@talex-touch/tuffex/attachment-tray'
import { TxChainOfThought } from '@talex-touch/tuffex/chain-of-thought'
import { TxTypingIndicator } from '@talex-touch/tuffex/chat'
import { TxConversationStream } from '@talex-touch/tuffex/conversation-stream'
import { TxStreamMarkdown } from '@talex-touch/tuffex/stream-markdown'
import { TxToolCallCard } from '@talex-touch/tuffex/tool-call-card'
import { TxToolConfirmation } from '@talex-touch/tuffex/tool-confirmation'
import { CHART_RESULT_PREFIX } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppLogo from '~/components/icon/AppLogo.vue'
import ToolChartCard from '~/components/intelligence/ToolChartCard.vue'
import { toChainSteps } from '~/modules/conversation/chain-steps'
import {
  CONVERSATION_ERROR_EMPTY_RESPONSE,
  CONVERSATION_ERROR_PROVIDER_UNAVAILABLE
} from '~/modules/conversation/conversation-error-display'
import { useAgentTools } from '~/modules/conversation/useAgentTools'
import {
  createConversationId,
  useConversationHistory
} from '~/modules/conversation/useConversationHistory'
import { useHomeConversation } from '~/modules/conversation/useHomeConversation'
import { useModelOptions } from '~/modules/conversation/useModelOptions'
import { hasWindow } from '@talex-touch/utils/env'
import { appSetting } from '~/modules/storage/app-storage'
import { createRendererLogger } from '~/utils/renderer-log'
import HomeModelMenu from './HomeModelMenu.vue'
import HomeSidePanel from './HomeSidePanel.vue'
import HomeTopBar from './HomeTopBar.vue'

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

const draft = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
/** Scroll behaviour (stick-to-bottom, follow, back-to-bottom pill) lives inside the stream now. */
const streamRef = ref<TxConversationStreamInstance | null>(null)
const composerRef = ref<HTMLElement | null>(null)
const composerHeight = ref(0)

const router = useRouter()
const route = useRoute()

const { selection: modelSelection, selectedModel } = useModelOptions()

const conversation = useHomeConversation({
  // A getter, not a snapshot: switching model mid-conversation must apply to the next send.
  routing: () => modelSelection.value
})
const { isEmpty, isStreaming, lastTurn, messages } = conversation

/** Only one menu at a time — the two pills are the same control shown in two places. */
const openMenu = ref<'top' | 'composer' | null>(null)
const panelOpen = ref(false)

function toggleMenu(which: 'top' | 'composer'): void {
  openMenu.value = openMenu.value === which ? null : which
}

/** The pill shows the pinned model when there is one, and the routing label when there is not. */
const modelLabel = computed(() => selectedModel.value ?? t('home.modelName'))

const canSend = computed(() => draft.value.trim().length > 0 && !isStreaming.value)

/**
 * Working title until R2 generates one: the opening message is what the user themselves called the
 * conversation. Deliberately not truncated here — the top bar ellipsises on overflow, and a title
 * cut in the data layer would stay cut once R2 persists it.
 */
const conversationTitle = computed(
  () => messages.value.find((message) => message.role === 'user')?.content
)

/**
 * Artboards `QiI0C` / `AHQQk` replaced the old 「工具」 button with two distinct affordances: a
 * standalone Auto Context toggle on the left, and a model + reasoning-effort pill next to send.
 * Enabling individual tools moved to 「设置 · 插件与工具」, so nothing here opens a tool list.
 *
 * Backed by `appSetting` rather than a local ref: this is the same preference the settings page
 * manages, and a local one would reset on every navigation. The model menu still has no picker.
 */
const autoContext = computed({
  get: () => appSetting.tools?.autoContext !== false,
  set: (value: boolean) => {
    if (appSetting.tools) appSetting.tools.autoContext = value
  }
})

// ============================================================================
// Agent tools
// ============================================================================

const agentTools = useAgentTools()

/**
 * Whether the assistant may run tools. Persisted in `appSetting` like Auto
 * Context, and mirrored to main on change — the gateway only opens, and the
 * allowlist only reaches `pi`, once this is on.
 */
const agentToolsEnabled = computed({
  get: () => appSetting.tools?.agentTools === true,
  set: (value: boolean) => {
    if (appSetting.tools) appSetting.tools.agentTools = value
    void agentTools.setEnabled(value)
  }
})

/**
 * Ids of messages that should play the pop-in. Filled only while a turn is
 * streaming — a send or retry — so restoring a stored thread never replays
 * entrances; ids leave the set on animationend, so a virtualized remount
 * (scrolling back up) stays still.
 */
const enteringMessages = reactive(new Set<string>())

watch(
  () => messages.value.length,
  (length, previous) => {
    if (!isStreaming.value || prefersReducedMotion()) return
    for (const message of messages.value.slice(previous ?? 0, length)) {
      enteringMessages.add(message.id)
    }
  }
)

function chainStepsOf(message: ConversationMessage) {
  return toChainSteps(message.parts, message.status === 'streaming')
}

/**
 * Tool results carrying a chart spec render as a chart in the card's result
 * slot; everything else falls through to the card's own text rendering.
 */
function chartSpecOf(tool: AiToolCallPart): ToolChartSpec | null {
  const output = tool.output
  if (tool.status !== 'done' || !output?.startsWith(CHART_RESULT_PREFIX)) return null
  try {
    return JSON.parse(output.slice(CHART_RESULT_PREFIX.length)) as ToolChartSpec
  } catch {
    return null
  }
}

/** A lone tool call renders as its own card; two or more become the timeline. */
function soloToolOf(message: ConversationMessage): AiToolCallPart[] {
  const steps = chainStepsOf(message)
  if (steps.length !== 1) return []
  const tools = (message.parts ?? []).filter(
    (part): part is AiToolCallPart => part.type === 'tool-call'
  )
  return tools.length === 1 ? tools : []
}

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
  const attachments =
    pendingAttachments.value.length > 0 ? [...pendingAttachments.value] : undefined
  draft.value = ''
  // Ownership moves to the message: the tray empties, the bubbles keep the object URLs alive.
  pendingAttachments.value = []
  await nextTick()
  autoGrow()

  // Allocated here rather than at setup so an untouched home screen never claims an id.
  conversationId ??= createConversationId()

  // FLIP: the composer travels from centre stage to the bottom dock. Measured
  // around the reactive flip so the same node glides instead of teleporting.
  const composerEl = composerRef.value
  const first = composerEl?.getBoundingClientRect()

  const turn = conversation.send(text, attachments)
  // Sending from a scrolled-up position still lands you on your own message —
  // the stream only auto-follows readers already at the bottom.
  await nextTick()

  if (composerEl && first && !prefersReducedMotion()) {
    const last = composerEl.getBoundingClientRect()
    const deltaY = first.top - last.top
    if (Math.abs(deltaY) > 8) {
      composerEl.animate(
        [{ transform: `translateY(${deltaY}px)` }, { transform: 'translateY(0)' }],
        { duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      )
    }
  }

  streamRef.value?.scrollToBottom()
  await turn
}

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
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

/**
 * Retrying a missing provider reruns the same failure forever, so that one case swaps the retry for
 * a way out. `/intelligence/channels` is where a provider is actually enabled — the settings AI page
 * only cross-links to it.
 */
function isProviderUnavailable(code: string | undefined): boolean {
  return code === CONVERSATION_ERROR_PROVIDER_UNAVAILABLE
}

function openProviderSettings(): void {
  void router.push('/intelligence/channels')
}

// ============================================================================
// Composer attachments (memory-only: never in the provider payload, never persisted)
// ============================================================================

const pendingAttachments = ref<AiAttachment[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

/**
 * Object URLs this surface created. Revoked wholesale on unmount rather than
 * per-message: the conversation is in-memory and keep-alive keeps this
 * component around, so the registry is bounded by the session, not leaked.
 */
const objectUrls = new Set<string>()

function toAttachment(file: File): AiAttachment {
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file)
    objectUrls.add(url)
    return { kind: 'image', id: crypto.randomUUID(), url, name: file.name }
  }
  return {
    kind: 'file',
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    mime: file.type
  }
}

function addFiles(files: File[]): void {
  if (files.length === 0 || isStreaming.value) return
  pendingAttachments.value = [...pendingAttachments.value, ...files.map(toAttachment)]
}

function removeAttachment(id: string): void {
  const target = pendingAttachments.value.find((attachment) => attachment.id === id)
  if (target?.kind === 'image' && objectUrls.delete(target.url)) URL.revokeObjectURL(target.url)
  pendingAttachments.value = pendingAttachments.value.filter((attachment) => attachment.id !== id)
}

function onFilePick(event: Event): void {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  // Clearing lets the same file be picked twice in a row.
  input.value = ''
}

function onPaste(event: ClipboardEvent): void {
  const items = event.clipboardData?.items
  if (!items) return

  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  if (files.length === 0) return

  // Keeps platform side text (a Finder-copied file pastes its name) out of the draft.
  event.preventDefault()
  addFiles(files)
}

/** Enter/leave fire per descendant — only the pair count says "still inside". */
const dragDepth = ref(0)
const isDragover = computed(() => dragDepth.value > 0)

function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(event: DragEvent): void {
  if (isStreaming.value || !dragHasFiles(event)) return
  event.preventDefault()
  dragDepth.value += 1
}

function onDragOver(event: DragEvent): void {
  // Required — without it the browser refuses the drop.
  if (isDragover.value) event.preventDefault()
}

function onDragLeave(): void {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDrop(event: DragEvent): void {
  if (!isDragover.value) return
  event.preventDefault()
  dragDepth.value = 0
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

/**
 * Feeds the floating composer's measured height to the stream's bottom padding.
 *
 * Observed rather than computed from the textarea's `scrollHeight`: the composer also carries the
 * tool row and its own padding, and a wrapped Auto Context row changes the total without the
 * textarea changing at all.
 */
let composerObserver: ResizeObserver | null = null

onMounted(() => {
  const element = composerRef.value
  if (!element || typeof ResizeObserver === 'undefined') return
  composerObserver = new ResizeObserver(([entry]) => {
    // Border-box, not contentRect: the clearance and the back-to-bottom pill
    // offset need the composer's *visual* height, padding and border included.
    if (entry)
      composerHeight.value = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
  })
  composerObserver.observe(element)
})

onBeforeUnmount(() => {
  composerObserver?.disconnect()
  composerObserver = null
  for (const url of objectUrls) URL.revokeObjectURL(url)
  objectUrls.clear()
})

const composerClearance = computed(() =>
  composerHeight.value > 0 ? `${Math.round(composerHeight.value)}px` : undefined
)

// ============================================================================
// Persistence
// ============================================================================

const homeLog = createRendererLogger('HomeConversation')
const history = useConversationHistory()

/** Allocated on the first send, so an untouched home screen never writes an empty row. */
let conversationId: string | null = null

/**
 * Restores the thread named by `/home/c/:id`, and resets to a blank one on plain `/home`.
 *
 * Watching the param rather than loading once on mount is what makes the sidebar work: navigating
 * between two stored conversations reuses this component instance, so mount never fires again.
 */
watch(
  () => route.params.id,
  async (id) => {
    const target = typeof id === 'string' ? id : null
    if (!target) {
      conversationId = null
      conversation.reset()
      return
    }
    if (target === conversationId) return

    const restored = await history.load(target)
    if (!restored) return
    conversationId = target
    conversation.restore(restored)
    // Wholesale replacement doesn't trip the stream's prepend anchoring, and keep-alive
    // reuses this instance — landing at the latest message needs an explicit call.
    await nextTick()
    streamRef.value?.scrollToBottom()
  },
  { immediate: true }
)

/**
 * Writes after every settled turn.
 *
 * Keyed on the streaming flag rather than on content: saving per delta would issue a full-thread
 * rewrite for every token.
 */
watch(
  () => isStreaming.value,
  async (streaming, wasStreaming) => {
    if (streaming || !wasStreaming || !conversationId) return
    try {
      await history.persist(conversationId, conversationTitle.value ?? '', messages.value)
      // Landing on the conversation's own URL is what lets the sidebar and a reload return to it.
      if (route.params.id !== conversationId) {
        await router.replace(`/home/c/${conversationId}`)
      }
    } catch (error) {
      // A watcher rejection is an unhandled promise nobody sees, and losing a thread silently is
      // worse than losing it loudly — the conversation stays on screen either way.
      homeLog.error('Failed to persist conversation', error)
    }
  }
)
</script>

<template>
  <div
    class="HomePage"
    :class="{ conversing: !isEmpty }"
    :style="{ '--home-composer-height': composerClearance }"
  >
    <HomeTopBar
      :title="conversationTitle"
      :model-name="modelLabel"
      :panel-open="panelOpen"
      :menu-open="openMenu === 'top'"
      @select-model="toggleMenu('top')"
      @toggle-panel="panelOpen = !panelOpen"
    >
      <template #menu>
        <HomeModelMenu :open="openMenu === 'top'" align="left" @close="openMenu = null" />
      </template>
    </HomeTopBar>

    <div class="HomePage-Split">
      <div class="HomePage-Body">
        <div class="HomePage-Center">
          <Transition name="home-head">
            <div v-if="isEmpty" class="HomePage-Head">
              <AppLogo class="HomePage-Mark" />
              <h1 class="HomePage-Greeting">
                {{ t('home.greeting') }}
              </h1>
            </div>
          </Transition>

          <TxConversationStream
            v-if="!isEmpty"
            ref="streamRef"
            class="HomePage-Stream"
            role="log"
            :items="messages"
            item-key="id"
            :streaming="isStreaming"
          >
            <template #item="{ item: message, index }">
              <div class="HomePage-StreamRow">
                <div
                  class="HomePage-Message"
                  :class="[
                    message.role,
                    { 'HomePage-Message--enter': enteringMessages.has(message.id) }
                  ]"
                  :aria-busy="message.status === 'streaming'"
                  @animationend="enteringMessages.delete(message.id)"
                >
                  <template v-if="message.role === 'user'">
                    <TxAttachmentTray
                      v-if="message.attachments?.length"
                      class="HomePage-MsgAttachments"
                      :attachments="message.attachments"
                      :preview-title="t('home.attachPreview')"
                    />
                    <div class="HomePage-UserBubble">
                      {{ message.content }}
                    </div>
                    <p v-if="message.attachments?.length" class="HomePage-AttachHint">
                      {{ t('home.attachmentNotSent') }}
                    </p>
                  </template>

                  <template v-else>
                    <!-- The trail of reasoning and tool calls, above the answer
                         it produced. Rendered from parts; a single step reads
                         better as the plain card the tool card already is. -->
                    <TxChainOfThought
                      v-if="chainStepsOf(message).length > 1"
                      class="HomePage-Chain"
                      :steps="chainStepsOf(message)"
                      :streaming="message.status === 'streaming'"
                      :default-open="false"
                      :label="t('home.chainOfThought')"
                    />
                    <TxToolCallCard
                      v-for="tool in soloToolOf(message)"
                      :key="tool.id"
                      class="HomePage-Tool"
                      :tool-call="tool"
                      :retry-label="t('home.retry')"
                    >
                      <template v-if="chartSpecOf(tool)" #result>
                        <ToolChartCard :spec="chartSpecOf(tool)!" />
                      </template>
                    </TxToolCallCard>

                    <TxStreamMarkdown
                      v-if="message.content"
                      class="HomePage-Reply"
                      :content="message.content"
                      :streaming="message.status === 'streaming'"
                    />

                    <TxTypingIndicator
                      v-else-if="message.status === 'streaming' && !chainStepsOf(message).length"
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
                        v-if="isProviderUnavailable(message.error?.code)"
                        class="HomePage-RetryBtn"
                        type="button"
                        @click="openProviderSettings"
                      >
                        {{ t('home.configureProvider') }}
                      </button>
                      <button
                        v-else-if="index === messages.length - 1"
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
            </template>
          </TxConversationStream>

          <!-- Sits above the composer rather than inside the stream: the agent
               is blocked until this is answered, so it must stay in view even
               when the reader has scrolled away from the tail. -->
          <div v-if="agentTools.pending.value" class="HomePage-ConfirmSlot">
            <TxToolConfirmation
              :tool-name="agentTools.pending.value.tool"
              :summary="agentTools.pending.value.summary"
              :input="agentTools.pending.value.input"
              :risk="agentTools.pending.value.risk"
              :allow-label="t('home.toolAllow')"
              :deny-label="t('home.toolDeny')"
              :remember-label="t('home.toolRemember')"
              @approve="agentTools.approve($event.remember)"
              @deny="agentTools.deny($event.remember)"
            />
          </div>

          <div class="HomePage-ComposerGroup">
            <div
              ref="composerRef"
              class="HomePage-Composer"
              :class="{ 'is-dragover': isDragover }"
              @dragenter="onDragEnter"
              @dragover="onDragOver"
              @dragleave="onDragLeave"
              @drop="onDrop"
            >
              <TxAttachmentTray
                v-if="pendingAttachments.length"
                class="HomePage-ComposerTray"
                :attachments="pendingAttachments"
                removable
                :remove-label="t('home.attachRemove')"
                :cancel-label="t('home.attachCancel')"
                :preview-title="t('home.attachPreview')"
                @remove="removeAttachment"
              />

              <textarea
                ref="inputRef"
                v-model="draft"
                class="HomePage-Input"
                rows="1"
                :aria-label="t('home.placeholder')"
                :placeholder="t('home.placeholder')"
                @input="autoGrow"
                @keydown="handleKeydown"
                @paste="onPaste"
              />

              <div class="HomePage-ToolRow">
                <div class="HomePage-ToolLeft">
                  <input
                    ref="fileInputRef"
                    type="file"
                    multiple
                    class="HomePage-FileInput"
                    :aria-label="t('home.attach')"
                    @change="onFilePick"
                  />
                  <button
                    class="HomePage-RoundBtn"
                    type="button"
                    :aria-label="t('home.attach')"
                    @click="fileInputRef?.click()"
                  >
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
                  <button
                    class="HomePage-PillBtn"
                    :class="{ active: agentToolsEnabled }"
                    type="button"
                    :aria-pressed="agentToolsEnabled"
                    :title="t('home.agentToolsHint')"
                    @click="agentToolsEnabled = !agentToolsEnabled"
                  >
                    <span class="i-ri-tools-line" />
                    <span>{{ t('home.agentTools') }}</span>
                  </button>
                </div>

                <div class="HomePage-ToolRight">
                  <div class="HomePage-ModelSlot">
                    <button
                      class="HomePage-ModelPill"
                      type="button"
                      data-model-pill
                      :aria-label="t('home.model')"
                      :aria-expanded="openMenu === 'composer'"
                      @click="toggleMenu('composer')"
                    >
                      <span class="HomePage-ModelName">{{ modelLabel }}</span>
                      <span class="HomePage-ModelEffort">{{ t('home.effortHigh') }}</span>
                      <span class="i-ri-arrow-down-s-line" />
                    </button>
                    <HomeModelMenu
                      :open="openMenu === 'composer'"
                      align="right"
                      @close="openMenu = null"
                    />
                  </div>
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

      <!--
        The slot is what animates, not the panel: the panel keeps its fixed width inside a
        narrowing, clipping box, so the rows slide out of view instead of reflowing every frame
        while the width interpolates.
      -->
      <Transition name="home-panel">
        <div v-if="panelOpen" class="HomePage-PanelSlot">
          <HomeSidePanel :turn="lastTurn" :message-count="messages.length" />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomePage {
  // Shared by the animating slot and the panel inside it, so the two can never drift apart.
  --home-panel-width: 280px;

  // ---------------------------------------------------------------------------
  // TuffEx token bridge: every tuffex component under this surface renders in
  // the shell's design language. Colour flips with the shell tokens; the
  // components' `theme="auto"` handles the structural themes (shiki, mermaid).
  // ---------------------------------------------------------------------------
  --tx-color-primary: var(--shell-primary);
  --tx-color-danger: var(--shell-danger);
  // The shell has no success token; done states borrow the accent.
  --tx-color-success: var(--shell-primary);
  --tx-text-color-primary: var(--shell-text-primary);
  --tx-text-color-secondary: var(--shell-text-muted);
  --tx-text-color-placeholder: var(--shell-text-muted);
  --tx-border-color: var(--shell-border-strong);
  --tx-border-color-light: var(--shell-border);
  --tx-border-color-lighter: var(--shell-border);
  --tx-fill-color: var(--shell-surface);
  --tx-fill-color-light: var(--shell-surface);
  --tx-fill-color-lighter: var(--shell-surface);
  --tx-fill-color-darker: var(--shell-surface-2);
  --tx-fill-color-blank: var(--shell-bg);
  --tx-bg-color: var(--shell-bg);

  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  // The top bar is pinned, so the page itself never scrolls — the body below it owns the overflow.
  overflow: hidden;
}

/** Splits the area under the top bar between the conversation and the optional right panel. */
.HomePage-Split {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.HomePage-PanelSlot {
  display: flex;
  flex: none;
  width: var(--home-panel-width);
  // Clips the fixed-width panel while the slot narrows, which is what keeps the rows from
  // re-wrapping on every frame of the animation.
  overflow: hidden;
}

/**
 * Matches the shell's own shedding vocabulary (`ShellChromeBar`): the same easing and roughly the
 * same duration, so opening this panel reads as the same kind of motion as collapsing the sidebar.
 * Opacity runs shorter than width so the contents are gone before the box finishes closing.
 */
.home-panel-enter-active,
.home-panel-leave-active {
  transition:
    width 0.24s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.16s ease;
}

.home-panel-enter-from,
.home-panel-leave-to {
  width: 0;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .home-panel-enter-active,
  .home-panel-leave-active {
    transition: none;
  }
}

.HomePage-Body {
  flex: 1 1 auto;
  // Without this the stream's 720px column would push the panel off-screen instead of narrowing.
  min-width: 0;
  min-height: 0;
  overflow-y: auto;

  // The stream owns the scroll once a conversation exists, so the body must not scroll too.
  .HomePage.conversing & {
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
    padding-bottom: 0;
    // Anchors the floating composer below.
    position: relative;
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

/** The stream component owns the scroll; this box only claims the flex space. */
.HomePage-Stream {
  flex: 1;
  width: 100%;
  min-height: 0;

  /**
   * The tail clears the floating composer instead of ending underneath it, and the
   * back-to-bottom pill has to hover above that composer, not under it. Both are
   * driven by the measured composer height for the same reason the padding always
   * was: the textarea grows to 200px. `:deep` because these live inside the stream
   * component and scoped selectors would never reach them otherwise.
   */
  :deep(.tx-conversation-stream__scroller) {
    padding: 28px 0 calc(var(--home-composer-height, 112px) + 28px);
    box-sizing: border-box;
  }

  :deep(.tx-conversation-stream__pill) {
    bottom: calc(var(--home-composer-height, 112px) + 32px);
  }
}

/** Per-row column: same 720px lane as the composer, one row per virtualized item. */
.HomePage-StreamRow {
  width: 720px;
  max-width: calc(100vw - var(--shell-sidebar-width) - 64px);
  margin: 0 auto;
  padding-bottom: 20px;
  box-sizing: border-box;
}

.HomePage-Message {
  display: flex;
  flex-direction: column;
  gap: 10px;

  /* iMessage-style entrance: rise from the composer with a slight overshoot.
     Users pop from the send button's corner, replies from the left. */
  &.HomePage-Message--enter {
    animation: home-msg-pop 0.44s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }

  &.user.HomePage-Message--enter {
    transform-origin: 85% 100%;
  }

  &.assistant.HomePage-Message--enter {
    transform-origin: 12% 100%;
  }

  &.user {
    align-items: flex-end;
  }

  &.assistant {
    align-items: flex-start;
  }
}

.HomePage-MsgAttachments {
  max-width: 78%;
}

/**
 * The pending-tool card floats with the composer rather than scrolling with the
 * transcript: the agent is blocked until it is answered, so it has to stay
 * reachable even when the reader has scrolled away.
 */
.HomePage-ConfirmSlot {
  position: absolute;
  animation: home-msg-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  right: 0;
  bottom: calc(var(--home-composer-height, 112px) + 28px);
  left: 0;
  z-index: 2;
  width: 720px;
  max-width: calc(100vw - var(--shell-sidebar-width) - 64px);
  margin: 0 auto;
}

.HomePage-Chain,
.HomePage-Tool {
  width: 100%;
}

.HomePage-AttachHint {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
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

/**
 * No fill on replies: in v2 the raised look comes from strokes, and body copy is not a
 * raised surface. The class now sits on TxStreamMarkdown — no `pre-wrap` here, markdown
 * owns its own whitespace; colour and size align the markdown body with the shell.
 */
.HomePage-Reply {
  width: 100%;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-md);
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
  transition: background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);

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

  /**
   * Floats over the stream rather than sitting below it, so the transcript runs the full height of
   * the pane and scrolls under the composer.
   *
   * `pointer-events` is handed back only to the composer itself: the group spans the full width, and
   * left as-is its empty margins would swallow wheel events aimed at the messages behind them.
   */
  .HomePage.conversing & {
    position: absolute;
    right: 0;
    bottom: 20px;
    left: 0;
    pointer-events: none;
  }
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
  /* Layered: a tight contact shadow plus a soft ambient one reads as lift
     without the smudge a single big blur gives. */
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--shell-shadow) 70%, transparent),
    0 8px 24px var(--shell-shadow);
  box-sizing: border-box;
  transition:
    border-color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:focus-within {
    border-color: var(--shell-primary);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--shell-shadow) 70%, transparent),
      0 10px 30px var(--shell-shadow),
      0 0 0 3px color-mix(in srgb, var(--shell-primary) 10%, transparent);
  }

  /**
   * Floating form. The fill drops to translucent so the blur has something to do — an opaque
   * `--shell-bg` would render the backdrop filter invisible — and the shadow deepens because the
   * box now has live content sliding underneath it rather than a flat page.
   */
  .HomePage.conversing & {
    background: color-mix(in srgb, var(--shell-bg) 72%, transparent);
    backdrop-filter: blur(20px) saturate(180%);
    box-shadow: 0 6px 24px var(--shell-shadow);
    pointer-events: auto;
  }

  /* Files hovering over the box: the border switches to an invitation. */
  &.is-dragover {
    border-style: dashed;
    border-color: var(--shell-primary);
  }
}

/** The picker is reached through the "+" button; the input itself never shows. */
.HomePage-FileInput {
  display: none;
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
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);
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

/** Anchors the composer's model menu, which opens upward so it never runs off the window bottom. */
.HomePage-ModelSlot {
  position: relative;
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
  transition: border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);

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
  transition:
    transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover:not(:disabled) {
    opacity: 0.92;
    transform: scale(1.06);
  }

  &:active:not(:disabled) {
    transform: scale(0.94);
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

/* The greeting bows out as the first message lands; it never re-enters mid-session. */
.home-head-leave-active {
  transition:
    opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.home-head-leave-to {
  opacity: 0;
  transform: translateY(-14px) scale(0.98);
}

@keyframes home-msg-pop {
  from {
    opacity: 0;
    transform: translateY(26px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .HomePage-Message.HomePage-Message--enter {
    animation: none;
  }

  .home-head-leave-active {
    transition: none;
  }
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
  transition:
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    border-color: var(--shell-border-strong);
    transform: translateY(-1px);
    box-shadow: 0 3px 10px var(--shell-shadow);
  }

  &:active {
    transform: translateY(0);
  }
}
</style>
