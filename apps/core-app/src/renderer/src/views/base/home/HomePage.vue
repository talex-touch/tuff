<script lang="ts" name="HomePage" setup>
import type { TxConversationStreamInstance } from '@talex-touch/tuffex/conversation-stream'
import type { StreamMarkdownCodePreview } from '@talex-touch/tuffex/stream-markdown'
import type { AgentWorkspaceError } from '~/modules/conversation/useAgentWorkspace'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxConversationStream } from '@talex-touch/tuffex/conversation-stream'
import { TxGradualBlur } from '@talex-touch/tuffex/gradual-blur'
import { TxSelectionActions } from '@talex-touch/tuffex/selection-actions'
import { initialReasoningSettingForNewSession } from '@talex-touch/utils/intelligence/model-binding'
import { useAppSdk, useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { prefersReducedMotion, useSendChoreography } from '~/composables/useSendChoreography'
import { createWorkingConversationTitle } from '~/modules/conversation/conversation-title'
import { provideHomeModelScope } from '~/modules/conversation/home-model-scope'
import { reasoningLevelLabelKey } from '~/modules/conversation/reasoning-effort-display'
import {
  AgentWorkspaceRequestError,
  toAgentWorkspaceError,
  useAgentWorkspace,
  WORKSPACE_QUEUE_LIMIT
} from '~/modules/conversation/useAgentWorkspace'
import { useCodePreviewTabs } from '~/modules/conversation/useCodePreviewTabs'
import { useConversationHistory } from '~/modules/conversation/useConversationHistory'
import { useConversationLoading } from '~/modules/conversation/useConversationLoading'
import { useHomeConversation } from '~/modules/conversation/useHomeConversation'
import { useModelOptions } from '~/modules/conversation/useModelOptions'
import { useReasoningEffort } from '~/modules/conversation/useReasoningEffort'
import { createOpeningLeadNote } from '~/modules/home-push/opening'
import { appSetting } from '~/modules/storage/app-storage'
import { useProjectStore } from '~/stores/projects'
import { describeFailure } from '~/utils/failure-text'
import { homeLog } from './composables/home-log'
import { homeMessageContextKey } from './composables/home-message-context'
import { useConversationRestore } from './composables/useConversationRestore'
import { useConversationTitle } from './composables/useConversationTitle'
import { useFileLinkClick } from './composables/useFileLinkClick'
import { useHomeAgentTools } from './composables/useHomeAgentTools'
import { useHomeAttachments } from './composables/useHomeAttachments'
import { useHomeCommands } from './composables/useHomeCommands'
import { useHomeComposerLayout } from './composables/useHomeComposerLayout'
import { useHomeDictation, VOICE_DRAFT_ID } from './composables/useHomeDictation'
import { useHomeOpening } from './composables/useHomeOpening'
import { useHomeRunTelemetry } from './composables/useHomeRunTelemetry'
import { useHomeSubmit } from './composables/useHomeSubmit'
import { useLeavingHead } from './composables/useLeavingHead'
import { useMessageParts } from './composables/useMessageParts'
import { usePassageSelection } from './composables/usePassageSelection'
import { useReadAloud } from './composables/useReadAloud'
import { useSendState } from './composables/useSendState'
import { useTurnMetrics } from './composables/useTurnMetrics'
import { useWorkspaceControls } from './composables/useWorkspaceControls'
import HomeRunDock from './composer/HomeRunDock.vue'
import HomeVoiceDraft from './composer/HomeVoiceDraft.vue'
import { modelPillFace } from './composer/model-pill'
import { deriveSendState, isAwaitingFirstToken } from './composer/send-state'
import HomeComposerStackHead from './HomeComposerStackHead.vue'
import HomeEmptyHead from './HomeEmptyHead.vue'
import HomeMessageRail from './HomeMessageRail.vue'
import HomeMessageRow from './HomeMessageRow.vue'
import HomePayloadModal from './HomePayloadModal.vue'
import HomePushCard from './HomePushCard.vue'
import HomeSidePanelSlot from './HomeSidePanelSlot.vue'
import HomeTopBar from './HomeTopBar.vue'
import HomePet from './pet/HomePet.vue'
import { petEnabled } from './pet/pet-settings'
import HomeFilePreviewDrawer from './preview/HomeFilePreviewDrawer.vue'
import TuffAIComposer from './TuffAIComposer.vue'
import HomeWorkspaceModeMenu from './workspace/HomeWorkspaceModeMenu.vue'

/**
 * The empty state and message stream share one composer node, preserving focus across the first
 * send. Main owns execution, durable history and queues; this page owns only the current view,
 * draft and the navigation-scoped effects of asynchronous submissions.
 */
const { t, locale } = useI18n()

const props = withDefaults(
  defineProps<{
    browserLanding?: boolean
    browserActive?: boolean
    browserNavigate?: (input: string) => Promise<void>
  }>(),
  { browserLanding: false, browserActive: true }
)
const browserMode = ref<'browse' | 'ask'>('browse')
const browserNavigating = ref(false)

const draft = ref('')
const bodyRef = ref<HTMLElement | null>(null)
const selectionBarRef = ref<HTMLElement | null>(null)
const streamRef = ref<TxConversationStreamInstance | null>(null)
const streamFollowing = ref(true)
const composerEl = ref<InstanceType<typeof TuffAIComposer> | null>(null)
const inputRef = computed(() => composerEl.value?.input ?? null)
const composerRef = computed(() => composerEl.value?.box ?? null)
const draftGhostRef = computed(() => composerEl.value?.ghost ?? null)
const composerGroupRef = ref<HTMLElement | null>(null)
const headEl = ref<InstanceType<typeof HomeEmptyHead> | null>(null)
const headRef = computed(() => headEl.value?.el ?? null)
const pageRef = ref<HTMLElement | null>(null)
const petEl = ref<InstanceType<typeof HomePet> | null>(null)
const petOn = computed(() => petEnabled.value)
const petHost = {
  stage: () => pageRef.value,
  body: () => bodyRef.value,
  box: () => composerEl.value?.box ?? null,
  input: () => composerEl.value?.input ?? null,
  empty: () => isEmpty.value,
  head: () => headRef.value
}
const liftGhostRef = ref<HTMLElement | null>(null)
const liftFillRef = ref<HTMLElement | null>(null)
const liftTextRef = ref<HTMLElement | null>(null)
const router = useRouter()
const route = useRoute()

const { composerClearance, autoGrow, collapseDraft, bubbleMaxWidth } = useHomeComposerLayout({
  input: inputRef,
  composerGroup: composerGroupRef
})

const {
  resolvedChoice: globalResolvedModel,
  routing: modelRouting,
  ensureLoaded: ensureModelOptionsLoaded
} = useModelOptions()
const { setting: reasoningEffortSetting } = useReasoningEffort()
onMounted(() => {
  void ensureModelOptionsLoaded()
})

const conversationId = ref<string | null>(null)
const projectId = ref<string | null>(null)

const isHomeRoute = computed(() =>
  props.browserLanding
    ? route.path === '/browser' && props.browserActive
    : route.path === '/home' || route.path.startsWith('/home/c/')
)

const {
  autoContext,
  agentTools,
  agentToolsMode,
  resetRememberedApprovals,
  gatewayApprovals,
  pendingGatewayOrigin
} = useHomeAgentTools({ isHomeRoute, conversationId })

function workspaceErrorText(failure: AgentWorkspaceError): string {
  return t(`home.workspace.error.${failure.code === 'unknown' ? 'unknown' : failure.code}`)
}

function reportWorkspaceError(failure: AgentWorkspaceError, action: string): void {
  homeLog.warn(`Workspace ${action} rejected`, failure.detail)
  const description = failure.code === 'unknown' ? describeFailure(failure.detail, t, '') : ''
  toast.error(workspaceErrorText(failure), description ? { description } : undefined)
}

function reportSubmitError(error: unknown): void {
  const failure =
    error instanceof AgentWorkspaceRequestError ? error.failure : toAgentWorkspaceError(error)
  reportWorkspaceError(failure, 'submit')
}

const workspace = useAgentWorkspace({
  conversationId: () => conversationId.value,
  projectId: () => projectId.value,
  title: createWorkingConversationTitle,
  defaults: () => ({
    providerId: modelRouting.value.providerId,
    model: modelRouting.value.model,
    reasoningEffort:
      appSetting.conversation?.reasoningEffort === undefined
        ? (initialReasoningSettingForNewSession(globalResolvedModel.value?.binding) ??
          reasoningEffortSetting.value)
        : reasoningEffortSetting.value,
    autoContext: autoContext.value
  }),
  leadNote: createOpeningLeadNote(t),
  onError: (failure, action) => reportWorkspaceError(failure, action)
})

const modelScope = provideHomeModelScope({
  settings: () => workspace.sessionModel.value,
  configure: (patch) => void workspace.configure(patch)
})

const conversation = useHomeConversation({ workspace: () => workspace.adapter })
const { isCompacting, isEmpty, isStreaming, lastTurn, messages } = conversation
watch([conversationId, isEmpty], () => {
  streamFollowing.value = true
})

const panelOpen = ref(false)
const panelTab = ref('outputs')
const {
  tabs: codeTabs,
  activeId: activeCodeTabId,
  open: openCodeTab,
  select: selectCodeTab,
  close: closeCodeTab
} = useCodePreviewTabs(conversationId)

function showCodePreview(preview: StreamMarkdownCodePreview): void {
  openCodeTab(preview)
  panelTab.value = 'preview'
  panelOpen.value = true
}
const { setConversationLoading } = useConversationLoading()

const modelPill = computed(() =>
  modelPillFace(modelScope.resolvedChoice.value, t('home.modelName'))
)
const composerModel = computed(() => {
  const level = modelScope.pillLevel.value
  return { ...modelPill.value, effort: level ? t(reasoningLevelLabelKey(level)) : undefined }
})

const submitState = useSendState({ choreography: () => choreography })
const { sending, lifting, openingHold } = submitState

watch(
  [
    () => (typeof route.params.id === 'string' ? route.params.id : conversationId.value),
    isStreaming,
    sending
  ],
  ([id, streaming, isSending]) => {
    if (id) setConversationLoading(id, Boolean(streaming || isSending))
  },
  { immediate: true }
)

const { dictation, streamItems, voiceSendBlocked } = useHomeDictation({
  draft,
  input: () => inputRef.value,
  messages,
  isStreaming,
  isHomeRoute,
  sending,
  workspaceLoading: workspace.loading,
  workspaceLoadError: workspace.loadError,
  router,
  onTextChange: autoGrow,
  onLeaveHome: () => submitState.invalidatePageSubmission()
})

const canSend = computed(
  () =>
    draft.value.trim().length > 0 &&
    isHomeRoute.value &&
    (typeof route.params.id !== 'string' || route.params.id === conversationId.value) &&
    !dictation.active.value &&
    !sending.value &&
    !browserNavigating.value &&
    !workspace.loading.value &&
    !workspace.loadError.value
)

const sendQueues = computed(
  () => workspace.busy.value || (workspace.state.value?.queue.length ?? 0) > 0
)

const sendState = computed(() =>
  deriveSendState({
    hasText: draft.value.trim().length > 0,
    streaming: isStreaming.value,
    awaitingFirstToken: isAwaitingFirstToken(messages.value.at(-1)),
    blocked: Boolean(agentTools.pending.value) || Boolean(workspace.state.value?.pendingRun),
    dictating: dictation.active.value
  })
)

const composerBeamActive = computed(
  () =>
    !props.browserLanding &&
    isHomeRoute.value &&
    isEmpty.value &&
    !isStreaming.value &&
    !dictation.active.value
)

const choreography = useSendChoreography({
  host: () => pageRef.value,
  scroller: () =>
    pageRef.value?.querySelector<HTMLElement>('.tx-conversation-stream__scroller') ?? null,
  composerGroup: () => composerGroupRef.value,
  composer: () => composerRef.value,
  liftOverlay: () => {
    const ghost = liftGhostRef.value
    const fill = liftFillRef.value
    const text = liftTextRef.value
    return ghost && fill && text ? { ghost, fill, text } : null
  }
})
const enteringMessages = choreography.enteringMessages

onBeforeUnmount(() => {
  choreography.cancel()
})

watch(
  () => messages.value.length,
  (length, previous) => {
    const claimed = submitState.consumeChoreographedSend()
    if (!isStreaming.value || prefersReducedMotion()) return
    const appended = messages.value.slice(previous ?? 0, length)
    choreography.markEntering(appended.map((message) => message.id))
    if (claimed && appended.some((message) => message.role === 'user')) return
    void nextTick(() => {
      for (const message of appended) {
        choreography.playEntrance(message.id, message.role === 'user' ? 0.8 : 0.6)
      }
    })
  }
)

const intelligenceSdk = useIntelligenceSdk()
const { toggleSpeak, speakStateOf } = useReadAloud()
const appSdk = useAppSdk()

const messageParts = useMessageParts({
  submit: (text, attachments, options) => workspace.submit(text, attachments, options),
  openExternal: (url) => appSdk.openExternal(url),
  clearDraft: () => {
    draft.value = ''
  },
  onSubmitError: reportSubmitError
})

const { passageSelection, passageActions, runPassageAction } = usePassageSelection({
  body: bodyRef,
  bar: selectionBarRef,
  input: inputRef,
  draft,
  conversationId,
  autoGrow
})

const fileDrawerVisible = ref(false)
const previewFilePath = ref('')
const previewDisplayPath = ref('')

const projectStore = useProjectStore()
const currentProject = computed(() =>
  projectId.value ? (projectStore.projects.find((p) => p.id === projectId.value) ?? null) : null
)

useFileLinkClick({
  container: bodyRef,
  projectRoot: computed(() => currentProject.value?.rootPath),
  onOpenRight: ({ absolutePath, displayPath }) => {
    previewFilePath.value = absolutePath
    previewDisplayPath.value = displayPath
    fileDrawerVisible.value = true
  }
})

const { measureLeavingHead, pinLeavingHead } = useLeavingHead(headRef)

const {
  pendingAttachments,
  attachPreviewProps,
  attachOpenLabel,
  addFiles,
  removeAttachment,
  isDragover,
  onPaste,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop
} = useHomeAttachments({
  isActive: () => isHomeRoute.value,
  onAdd: () => {
    if (props.browserLanding) browserMode.value = 'ask'
  },
  focusInput: () => inputRef.value?.focus()
})

const history = useConversationHistory()
const { generatedTitle, conversationTitle } = useConversationTitle({
  messages,
  conversationId,
  busy: () => workspace.busy.value,
  history,
  sdk: intelligenceSdk
})

const { resetBlankConversation } = useConversationRestore({
  browserLanding: () => props.browserLanding,
  isHomeRoute,
  conversationId,
  projectId,
  generatedTitle,
  workspace,
  history,
  projectStore,
  composer: () => composerRef.value,
  stream: () => streamRef.value,
  focusInput: () => inputRef.value?.focus(),
  resetConversation: () => conversation.reset(),
  submitState,
  invalidateChoreography: () => choreography.invalidate(),
  playComposerFlip: (deltaY) => choreography.playComposerFlip(deltaY),
  measureLeavingHead,
  pinLeavingHead,
  onThreadChange: (next, previous) => {
    dictation.cancel({ restore: false })
    if (submitState.isOwnMintedChange(next, previous)) return
    dictation.dismissClip()
  }
})

const {
  push,
  homeRecommendationsEnabled,
  openingPhase,
  openingText,
  openingSource,
  openingBusy,
  pushSteps,
  pushStep,
  pushSelected,
  pushLoadingRows,
  pushLabels,
  choosePush,
  pushSkeleton,
  pushSettling,
  openingSnapshot,
  pushSlotStyle
} = useHomeOpening({
  openingHold,
  browserLanding: () => props.browserLanding,
  isEmpty,
  conversationId,
  projectId,
  routing: () => modelRouting.value,
  routingReady: () => ensureModelOptionsLoaded(),
  draft,
  input: inputRef,
  autoGrow,
  submit: () => submit()
})

const { submit, pressSend, sendVoiceDraft, handleKeydown, handleComposerKeydown } = useHomeSubmit({
  onSent: (text) => petEl.value?.notifySend(text),
  submitState,
  browserLanding: () => props.browserLanding,
  browserNavigate: props.browserNavigate,
  browserMode,
  browserNavigating,
  isHomeRoute,
  isEmpty,
  conversationId,
  messages,
  draft,
  pendingAttachments,
  canSend,
  voiceSendBlocked,
  sendQueues,
  imageInputAccepted: () => modelScope.resolvedChoice.value?.binding.imageInput.accepted,
  homeRecommendationsEnabled,
  opening: openingSnapshot,
  push,
  workspace,
  dictation,
  history,
  choreography,
  stream: () => streamRef.value,
  input: () => inputRef.value,
  composer: () => composerRef.value,
  draftGhost: () => draftGhostRef.value,
  launchSendKey: () => composerEl.value?.launch(),
  autoGrow,
  collapseDraft,
  bubbleMaxWidth,
  measureLeavingHead,
  pinLeavingHead,
  resetBlankConversation,
  setConversationLoading,
  reportSubmitError
})

const {
  hasHistory,
  branching,
  branchTo,
  canBranchFrom,
  selectMode,
  selectAgentProfile,
  pendingRunProfileName
} = useWorkspaceControls({
  workspace,
  messages,
  conversationId,
  history,
  onSubmitError: reportSubmitError
})

const {
  activityTurns,
  modelLimits,
  runStartedAt,
  runStep,
  thinkingTicker,
  contextShare,
  contextWindowText
} = useHomeRunTelemetry({
  messages,
  isStreaming,
  resolvedChoice: modelScope.resolvedChoice,
  locale
})

provide(homeMessageContextKey, {
  ...messageParts,
  attachPreviewProps,
  attachOpenLabel,
  thinkingVerb: thinkingTicker.activeVerb,
  thinkingLabel: thinkingTicker.activeLabel
})

const { showTurnMetrics, isTurnFooterResting } = useTurnMetrics(messages)

useHomeCommands({
  isHomeRoute,
  browserLanding: () => props.browserLanding,
  panelOpen,
  focusComposer: () => inputRef.value?.focus(),
  canSend: () => canSend.value || (dictation.active.value && !isStreaming.value),
  send: pressSend,
  isStreaming: () => isStreaming.value,
  stop: () => conversation.stop()
})
</script>

<template>
  <div
    ref="pageRef"
    class="HomePage"
    :class="{ conversing: !isEmpty }"
    :style="{ '--home-composer-height': composerClearance }"
  >
    <HomeTopBar
      v-if="!browserLanding"
      :title="conversationTitle"
      :panel-open="panelOpen"
      :turn="lastTurn"
      :message-count="messages.length"
      :project-name="currentProject?.name"
      :project-path="currentProject?.rootPath"
      :can-branch="hasHistory && !workspace.busy.value && !branching"
      :branching="branching"
      @toggle-panel="panelOpen = !panelOpen"
      @branch="branchTo({})"
    />

    <div class="HomePage-Split">
      <div ref="bodyRef" class="HomePage-Body">
        <TxGradualBlur
          v-if="!isEmpty"
          position="top"
          height="72px"
          :strength="2.5"
          curve="bezier"
          :z-index="4"
          class="HomePage-TopBlur"
        />
        <TxGradualBlur
          v-if="!isEmpty"
          position="bottom"
          height="calc(var(--home-composer-height, 112px) + 96px)"
          :strength="2.5"
          curve="bezier"
          :z-index="4"
          class="HomePage-BottomBlur"
        />
        <div class="HomePage-Center">
          <Transition name="home-head">
            <HomeEmptyHead
              v-if="isEmpty"
              ref="headEl"
              :mark-hidden="petOn"
              :browser-landing="browserLanding"
              :opening-enabled="homeRecommendationsEnabled"
              :phase="openingPhase"
              :text="openingText"
              :source="openingSource"
              :busy="openingBusy"
              :loading-label="pushLabels.openingLoading"
            />
          </Transition>

          <Transition name="home-stream">
            <TxConversationStream
              v-if="!isEmpty"
              ref="streamRef"
              :key="conversationId ?? 'draft'"
              class="HomePage-Stream"
              role="log"
              :items="streamItems"
              item-key="id"
              :streaming="isStreaming"
              :top-padding="72"
              bottom-clearance="calc(var(--home-composer-height, 112px) + 88px)"
              pill-bottom="calc(var(--home-composer-height, 112px) + 32px)"
              :data-following="streamFollowing"
              @following-change="streamFollowing = $event"
            >
              <template #item="{ item: message, index }">
                <div v-if="message.id === VOICE_DRAFT_ID" class="HomePage-StreamRow">
                  <div class="HomePage-VoiceRow">
                    <HomeVoiceDraft
                      v-if="dictation.clip.value"
                      :clip="dictation.clip.value"
                      :dictating="dictation.active.value"
                      :send-blocked="voiceSendBlocked"
                      @retry="dictation.recognizeClip()"
                      @send="sendVoiceDraft()"
                      @dismiss="dictation.dismissClip()"
                    />
                  </div>
                </div>
                <div v-else class="HomePage-StreamRow">
                  <HomeMessageRow
                    :message="message"
                    :entering="enteringMessages.has(message.id)"
                    :latest="index === messages.length - 1"
                    :streaming="isStreaming"
                    :compacting="isCompacting"
                    :resting="isTurnFooterResting(message)"
                    :branchable="canBranchFrom(message, index)"
                    :branching="branching"
                    :speak-state="speakStateOf(message)"
                    :show-metrics="showTurnMetrics"
                    @retry="conversation.retry()"
                    @regenerate="conversation.retry()"
                    @speak="toggleSpeak(message)"
                    @branch="branchTo({ messageId: message.id })"
                    @code-preview="showCodePreview"
                  />
                </div>
              </template>
              <template #rail="{ activeIndex, scrollToIndex }">
                <HomeMessageRail
                  v-if="!isEmpty && !panelOpen"
                  :items="messages"
                  :active-index="activeIndex"
                  @navigate="scrollToIndex($event)"
                />
              </template>
            </TxConversationStream>
          </Transition>

          <HomePayloadModal />

          <div ref="composerGroupRef" class="HomePage-ComposerGroup">
            <HomeComposerStackHead
              :load-error="workspace.loadError.value"
              :load-error-text="
                workspace.loadError.value ? workspaceErrorText(workspace.loadError.value) : ''
              "
              :pending-run="workspace.state.value?.pendingRun"
              :pending-run-profile-name="pendingRunProfileName"
              :run-decision="workspace.runDecision.value"
              :pending-tool="agentTools.pending.value"
              :pending-gateway-origin="pendingGatewayOrigin"
              :workspace-status="workspace.state.value?.status"
              :queue="workspace.queue.value"
              :queue-held="workspace.state.value?.queueHeld ?? false"
              :queue-limit="WORKSPACE_QUEUE_LIMIT"
              :queue-pending="workspace.queuePending.value"
              :resuming="workspace.resuming.value"
              :show-empty-voice-draft="isEmpty"
              :voice-clip="dictation.clip.value"
              :dictating="dictation.active.value"
              :voice-send-blocked="voiceSendBlocked"
              @reload-workspace="workspace.reload()"
              @approve-run="workspace.approveRun()"
              @reject-run="workspace.rejectRun()"
              @approve-tool="agentTools.approve($event)"
              @deny-tool="agentTools.deny($event)"
              @queue-action="workspace.queueAction"
              @queue-update="workspace.updateQueued"
              @queue-resume="workspace.resume()"
              @voice-retry="dictation.recognizeClip()"
              @voice-send="sendVoiceDraft()"
              @voice-dismiss="dictation.dismissClip()"
            />

            <HomeRunDock
              v-if="!isEmpty && (isStreaming || contextShare !== null)"
              :streaming="isStreaming"
              :started-at="runStartedAt"
              :step="runStep"
              :verb="thinkingTicker.activeLabel.value"
              :context-share="contextShare"
              :context-window-text="contextWindowText"
            />

            <TuffAIComposer
              ref="composerEl"
              v-model:draft="draft"
              v-model:permission-mode="agentToolsMode"
              :placeholder="t(browserLanding ? 'browser.composerPlaceholder' : 'home.placeholder')"
              :attachments="pendingAttachments"
              :attach-open-label="attachOpenLabel"
              :attach-preview-props="attachPreviewProps"
              :input-disabled="browserNavigating"
              :dragover="isDragover"
              :live="isStreaming"
              :lifting="lifting"
              :beam-active="composerBeamActive"
              :dictation="dictation"
              :model="composerModel"
              :send-state="sendState"
              :send-queues="sendQueues"
              @input="autoGrow"
              @input-keydown="handleKeydown"
              @box-keydown="handleComposerKeydown"
              @paste="onPaste"
              @dragenter="onDragEnter"
              @dragover="onDragOver"
              @dragleave="onDragLeave"
              @drop="onDrop"
              @remove="removeAttachment"
              @files="addFiles"
              @send="pressSend"
              @stop="conversation.stop()"
              @mic="dictation.toggle()"
              @reset-approvals="resetRememberedApprovals"
            >
              <template #mode>
                <template v-if="browserLanding">
                  <TxButton
                    size="sm"
                    variant="flat"
                    :type="browserMode === 'browse' ? 'primary' : 'text'"
                    :aria-pressed="browserMode === 'browse'"
                    :disabled="pendingAttachments.length > 0 || browserNavigating"
                    icon="i-ri-global-line"
                    @click="browserMode = 'browse'"
                    >{{ t('browser.browse') }}</TxButton
                  >
                  <TxButton
                    size="sm"
                    variant="flat"
                    :type="browserMode === 'ask' ? 'primary' : 'text'"
                    :aria-pressed="browserMode === 'ask'"
                    :disabled="browserNavigating"
                    icon="i-ri-search-line"
                    @click="browserMode = 'ask'"
                    >{{ t('browser.ask') }}</TxButton
                  >
                </template>
                <HomeWorkspaceModeMenu
                  v-if="!browserLanding"
                  :mode="workspace.settings.value.mode"
                  :profile-id="workspace.settings.value.profileId"
                  :profiles="workspace.profiles.value"
                  :profiles-loading="workspace.profilesLoading.value"
                  :profile-saving="workspace.profileSaving.value"
                  :profiles-error="workspace.profilesError.value"
                  :branch-on-change="hasHistory"
                  :locked="workspace.busy.value || branching"
                  @select-chat="selectMode('chat')"
                  @select-agent="selectAgentProfile"
                  @toggle-profile="workspace.setProfileEnabled"
                  @load-profiles="workspace.loadProfiles()"
                />
              </template>
            </TuffAIComposer>

            <Transition
              name="home-card"
              appear
              appear-from-class="home-card-appear-from"
              appear-active-class="home-card-appear-active"
            >
              <HomePushCard
                v-if="isEmpty && homeRecommendationsEnabled"
                v-model:step="pushStep"
                :steps="pushSteps"
                :selected="pushSelected"
                :loading="pushSkeleton"
                :loading-rows="pushLoadingRows"
                :settling="pushSettling"
                :prev-label="pushLabels.prev"
                :next-label="pushLabels.next"
                :slot-style="pushSlotStyle"
                @select="choosePush"
              />
            </Transition>
            <slot v-if="browserLanding" name="browser-footer" />
          </div>
        </div>
      </div>

      <HomeSidePanelSlot
        v-model:tab="panelTab"
        :open="panelOpen"
        :messages="messages"
        :conversation-id="conversationId"
        :context="workspace.state.value?.context"
        :turn="lastTurn"
        :activity-turns="activityTurns"
        :limits="modelLimits"
        :gateway="gatewayApprovals"
        :pending-run="workspace.state.value?.pendingRun"
        :loading="workspace.loading.value"
        :code-tabs="codeTabs"
        :active-code-tab-id="activeCodeTabId"
        @locate="streamRef?.scrollToIndex($event)"
        @select-code-tab="selectCodeTab"
        @close-code-tab="closeCodeTab"
      />
    </div>

    <HomePet v-if="petOn" ref="petEl" :host="petHost" />

    <div ref="liftGhostRef" class="HomePage-SendLift" aria-hidden="true">
      <div ref="liftFillRef" class="HomePage-SendLiftFill" />
      <div ref="liftTextRef" class="HomePage-UserBubble HomePage-SendLiftText" />
    </div>

    <TxSelectionActions
      v-if="passageSelection"
      ref="selectionBarRef"
      :selection="passageSelection"
      :actions="passageActions"
      :aria-label="t('home.selectionActions')"
      hide-prompt
      @action="runPassageAction"
    />

    <HomeFilePreviewDrawer
      v-model:visible="fileDrawerVisible"
      :file-path="previewFilePath"
      :display-path="previewDisplayPath"
    />
  </div>
</template>

<style lang="scss" scoped>
.HomePage {
  position: relative;
  --home-panel-width: 360px;
  --home-chat-lane-width: min(720px, calc(100% - 64px));

  --home-z-leaving: 0;
  --home-z-flight: 1;
  --home-z-topblur: 4;
  --home-z-bottomblur: 4;
  --home-z-topbar: 6;
  --home-z-composer: 8;
  --home-z-lift: 9;

  --home-live-stops: #0894ff, #c959dd 27%, #ff2e54 52%, #ff9004 74%, #0894ff;

  --tx-color-primary: var(--shell-primary);
  --tx-color-danger: var(--shell-danger);
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

  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  container-type: inline-size;
  overflow: hidden;
}

:deep(.HomeTopBar) {
  grid-column: 1;
  grid-row: 1;
  position: relative;
  z-index: var(--home-z-topbar);
}

.HomePage-Split {
  display: contents;
}

.HomePage-Body {
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  position: relative;

  .HomePage.conversing & {
    grid-row: 1 / -1;
    overflow: hidden;
  }
}

.HomePage-TopBlur {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 72px;
  z-index: var(--home-z-topblur);
  pointer-events: none;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--shell-bg) 80%, transparent) 0%,
    color-mix(in srgb, var(--shell-bg) 35%, transparent) 40%,
    transparent 100%
  );
}

.HomePage-BottomBlur {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(var(--home-composer-height, 112px) + 96px);
  z-index: var(--home-z-bottomblur);
  pointer-events: none;
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--shell-bg) 85%, transparent) 0%,
    color-mix(in srgb, var(--shell-bg) 60%, transparent) 35%,
    color-mix(in srgb, var(--shell-bg) 25%, transparent) 70%,
    transparent 100%
  );
}

.HomePage-Center {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding-bottom: 16px;
  position: relative;

  .HomePage.conversing & {
    gap: 16px;
    justify-content: flex-start;
    height: 100%;
    min-height: 0;
    padding-bottom: 0;
  }
}

.home-stream-leave-active {
  position: absolute;
  z-index: var(--home-z-leaving);
  inset: 0;
  transition: opacity 0.26s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-stream-leave-to {
  opacity: 0;
}

.home-stream-enter-active {
  transition: opacity 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-stream-enter-from {
  opacity: 0;
}

.HomePage-Stream {
  flex: 1;
  width: 100%;
  min-height: 0;

  :deep(.tx-conversation-stream__pill) {
    z-index: 10;
  }
}

.HomePage-StreamRow {
  width: var(--home-chat-lane-width);
  min-width: 0;
  margin: 0 auto;
  padding-bottom: 20px;
  box-sizing: border-box;
}

.HomePage-VoiceRow {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.HomePage-SendLift {
  position: fixed;
  top: 0;
  left: 0;
  z-index: var(--home-z-lift);
  pointer-events: none;
  visibility: hidden;

  &.is-active {
    visibility: visible;
    will-change: transform;
  }
}

.HomePage-SendLiftFill {
  position: absolute;
  inset: 0;
  border-radius: var(--shell-radius-lg);
  background: var(--shell-surface-2);
  opacity: 0;
}

.HomePage-UserBubble.HomePage-SendLiftText {
  position: relative;
  margin: 0;
  background: none;
}

.HomePage-ComposerGroup {
  --home-card-gap: 12px;
  --home-group-gap: var(--home-card-gap);

  display: flex;
  flex-direction: column;
  gap: var(--home-group-gap);
  align-items: center;
  width: 100%;
  min-width: 0;
  position: relative;
  z-index: var(--home-z-composer);

  .HomePage.conversing & {
    position: absolute;
    right: 0;
    bottom: 20px;
    left: 0;
    --home-group-gap: 18px;
    gap: var(--home-group-gap);
    pointer-events: none;

    &:has(.HomeWorkspaceQueue) {
      --home-group-gap: 0px;
    }
  }
}

.home-head-leave-active {
  transition:
    opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.home-head-leave-to {
  opacity: 0;
  transform: translateY(-14px) scale(0.98);
}

.home-head-enter-active {
  transition:
    opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.42s,
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.42s,
    filter 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.42s;
}

.home-head-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
  filter: blur(8px);
}

.home-card-enter-active,
.home-card-appear-active {
  transition:
    opacity 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}

.home-card-enter-active {
  transition-delay: 0.45s;
}

.home-card-appear-active {
  transition-delay: 0.08s;
}

.home-card-enter-from,
.home-card-appear-from {
  opacity: 0;
  transform: translateY(10px);
}

.home-card-leave-active {
  position: absolute;
  top: calc(100% + var(--home-card-gap));
  left: 50%;
  transform: translateX(-50%);
  transition:
    opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

.home-card-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

@property --home-glow-on {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}

:deep(.is-file-path) {
  color: var(--shell-primary);
  text-decoration: underline dotted;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  cursor: pointer;

  &:hover {
    text-decoration-style: solid;
    background: color-mix(in srgb, var(--shell-primary) 10%, transparent);
  }
}

:deep(.is-command-path-clickable) {
  cursor: pointer !important;
  text-decoration: underline solid !important;
  text-underline-offset: 3px !important;
}

@media (prefers-reduced-motion: reduce) {
  .home-head-leave-active,
  .home-head-enter-active,
  .home-card-leave-active,
  .home-card-enter-active,
  .home-card-appear-active,
  .home-stream-leave-active,
  .home-stream-enter-active {
    transition: none;
  }
}
</style>
