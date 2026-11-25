<script lang="ts" name="HomePage" setup>
import type { CodeRunPayload } from '@talex-touch/tuffex/code-stream'
import type {
  WorkspaceQueueDeliveryMode,
  WorkspaceQueuedInput
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { WorkspaceFileAiActionPayload } from '~/components/preview/workspace-file-tree'
import { TxSelectionActions } from '@talex-touch/tuffex/selection-actions'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, nextTick, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { WORKSPACE_QUEUE_LIMIT } from '~/modules/conversation/useAgentWorkspace'
import { useConversationHistory } from '~/modules/conversation/useConversationHistory'
import { useShellRightSidebar } from '~/modules/layout/useShellRightSidebar'
import { useShellTerminal } from '~/modules/layout/useShellTerminal'
import { homeMessageContextKey } from './composables/home-message-context'
import { useConversationRestore } from './composables/useConversationRestore'
import { useConversationTitle } from './composables/useConversationTitle'
import { useHomeAttachments } from './composables/useHomeAttachments'
import { useHomeCommands } from './composables/useHomeCommands'
import { useHomeComposerLayout } from './composables/useHomeComposerLayout'
import { useHomeDictation } from './composables/useHomeDictation'
import { useHomeOpening } from './composables/useHomeOpening'
import { useHomePreviewPanels } from './composables/useHomePreviewPanels'
import { HOME_BODY_MIN_WIDTH, SIDE_PANEL_MIN_WIDTH } from './composables/useHomeSidePanel'
import { useHomeRunTelemetry } from './composables/useHomeRunTelemetry'
import { useHomeSendChoreography } from './composables/useHomeSendChoreography'
import { useHomeSubmit } from './composables/useHomeSubmit'
import { useHomeWorkspaceSession } from './composables/useHomeWorkspaceSession'
import { useLeavingHead } from './composables/useLeavingHead'
import { useMessageParts } from './composables/useMessageParts'
import { usePassageSelection } from './composables/usePassageSelection'
import { useReadAloud } from './composables/useReadAloud'
import { useSendState } from './composables/useSendState'
import { useTurnMetrics } from './composables/useTurnMetrics'
import { useWorkspaceControls } from './composables/useWorkspaceControls'
import HomeRunDock from './composer/HomeRunDock.vue'
import HomeComposerModeSlot from './HomeComposerModeSlot.vue'
import HomeComposerStackHead from './HomeComposerStackHead.vue'
import HomeConversationStream from './HomeConversationStream.vue'
import HomeEmptyHead from './HomeEmptyHead.vue'
import HomePayloadModal from './HomePayloadModal.vue'
import HomePushCardSlot from './HomePushCardSlot.vue'
import HomeSendLiftOverlay from './HomeSendLiftOverlay.vue'
import HomeSidePanelSlot from './HomeSidePanelSlot.vue'
import HomeStageBlurs from './HomeStageBlurs.vue'
import HomeTopBar from './HomeTopBar.vue'
import HomePet from './pet/HomePet.vue'
import { petEnabled } from './pet/pet-settings'
import TuffAIComposer from './TuffAIComposer.vue'
import HomeWorkspaceQueue from './workspace/HomeWorkspaceQueue.vue'
import { selectedSchedulerName } from './workspace/scheduler'

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
const streamEl = ref<InstanceType<typeof HomeConversationStream> | null>(null)
const streamRef = computed(() => streamEl.value?.stream ?? null)
const streamFollowing = ref(true)
const composerEl = ref<InstanceType<typeof TuffAIComposer> | null>(null)
const queueEl = ref<InstanceType<typeof HomeWorkspaceQueue> | null>(null)
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
  box: () => queueEl.value?.el ?? composerEl.value?.box ?? null,
  input: () => composerEl.value?.input ?? null,
  empty: () => isEmpty.value,
  head: () => headRef.value,
  activity: () => {
    if (!isStreaming.value) return 'idle' as const
    if (runStep.value.kind === 'writing') return 'writing' as const
    if (runStep.value.kind === 'tool') return 'running' as const
    return 'thinking' as const
  }
}
const liftOverlayEl = ref<InstanceType<typeof HomeSendLiftOverlay> | null>(null)
const router = useRouter()

const { composerClearance, autoGrow, collapseDraft, bubbleMaxWidth } = useHomeComposerLayout({
  input: inputRef,
  composer: composerRef,
  composerGroup: composerGroupRef
})

const conversationId = ref<string | null>(null)
const projectId = ref<string | null>(null)

const {
  isHomeRoute,
  modelRouting,
  ensureModelOptionsLoaded,
  agentTools,
  agentToolsMode,
  resetRememberedApprovals,
  gatewayApprovals,
  pendingGatewayOrigin,
  workspaceErrorText,
  reportSubmitError,
  workspace,
  modelScope,
  conversation,
  composerModel
} = useHomeWorkspaceSession({
  browserLanding: () => props.browserLanding,
  browserActive: () => props.browserActive,
  conversationId,
  projectId
})

const { isCompacting, isEmpty, isStreaming, lastTurn, messages } = conversation
// Conversation view already shows the compact status Miko and context meter in HomeRunDock
// along the composer's top edge, so the roaming HomePet only lives on the empty Home stage.
const petVisible = computed(() => petOn.value && isEmpty.value)
watch([conversationId, isEmpty], () => {
  streamFollowing.value = true
})

const { dockHost: rightSidebarDockHost } = useShellRightSidebar()

function resolveSidePanelAvailableWidth(): number | undefined {
  if (!props.browserLanding && rightSidebarDockHost.value) {
    const mainWidth = pageRef.value?.closest<HTMLElement>('.AppShell-Main')?.clientWidth ?? 0
    const rightWidth = rightSidebarDockHost.value.clientWidth
    const combined = mainWidth + rightWidth
    if (combined > 0) return combined
  }
  const pageWidth = pageRef.value?.clientWidth
  return pageWidth && pageWidth > 0 ? pageWidth : undefined
}

const workspaceRoot = computed(() => workspace.state.value?.workspaceRoot)

const {
  panelOpen,
  panelWidth,
  isResizing,
  tabs: sidePanelTabs,
  activeTabId: activeSidePanelTabId,
  recentItems: sidePanelRecentItems,
  removeRecentItem: removeSidePanelRecent,
  clearRecentItems: clearSidePanelRecents,
  openLauncher,
  openFileInSidebar,
  openWebInSidebar,
  openBlankWebTab,
  openWorkspaceTool,
  updateWebTab,
  updateFileTab,
  selectTab: selectSidePanelTab,
  closeTab: closeSidePanelTab,
  closeOtherTabs: closeOtherSidePanelTabs,
  closeAllTabs: closeAllSidePanelTabs,
  startResize: startSidePanelResize,
  resetWidth: resetSidePanelWidth,
  gitAvailable,
  effectiveWorkspaceRoot,
  showCodePreview,
  openWebInBuiltInBrowser,
  openFileInBuiltInBrowser,
  openWebExternal,
  pickAndOpenFileInSidebar,
  projectStore,
  currentProject
} = useHomePreviewPanels({
  conversationId,
  projectId,
  workspaceRoot,
  messages,
  bodyRef,
  getSidePanelAvailableWidth: resolveSidePanelAvailableWidth
})

const submitState = useSendState({ choreography: () => choreography })
const { sending, lifting, openingHold } = submitState

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

const {
  choreography,
  enteringMessages,
  canSend,
  sendQueues,
  sendState,
  composerBeamActive,
  setConversationLoading
} = useHomeSendChoreography({
  browserLanding: () => props.browserLanding,
  isHomeRoute,
  isEmpty,
  isStreaming,
  messages,
  conversationId,
  draft,
  browserNavigating,
  dictationActive: () => dictation.active.value,
  workspace,
  pendingTool: () => agentTools.pending.value,
  submitState,
  host: () => pageRef.value,
  composerGroup: () => composerGroupRef.value,
  composer: () => composerRef.value,
  liftOverlay: () => liftOverlayEl.value?.overlay() ?? null
})

const intelligenceSdk = useIntelligenceSdk()
const { toggleSpeak, speakStateOf } = useReadAloud()
const { runCommand: runTerminalCommand } = useShellTerminal()

function runCodeInTerminal(payload: CodeRunPayload): void {
  runTerminalCommand(payload.code, {
    cwd: effectiveWorkspaceRoot.value,
    lang: payload.lang
  })
}

async function handleFileAiAction(payload: WorkspaceFileAiActionPayload): Promise<void> {
  const prompt = payload.prompt.trim()
  if (!prompt) return

  if (payload.mode === 'quote') {
    const existing = draft.value.replace(/\s+$/, '')
    draft.value = existing ? `${existing}\n\n${payload.prompt}` : payload.prompt
    await nextTick()
    const input = inputRef.value
    if (input) {
      input.focus()
      input.selectionStart = input.value.length
      input.selectionEnd = input.value.length
      autoGrow()
    }
    return
  }

  if (!draft.value.trim()) {
    draft.value = prompt
    await nextTick()
    void submit()
    return
  }

  if (conversationId.value) {
    try {
      await workspace.submit(prompt)
    } catch (error) {
      reportSubmitError(error)
    }
    return
  }

  draft.value = `${draft.value.replace(/\s+$/, '')}\n\n${prompt}`
  await nextTick()
  void submit()
}

const messageParts = useMessageParts({
  submit: (text, attachments, options) => workspace.submit(text, attachments, options),
  openExternal: async (url) => {
    openWebInSidebar(url)
  },
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
/** Which composer slot hosts the mode controls (see the `#[composerModeSlot]` template). */
const composerModeSlot = computed(() => (props.browserLanding ? 'mode' : 'scheduler'))
/** The model pill also names the scheduler: 「Tuff Pi › model · 档位」. */
const composerPill = computed(() => ({
  ...composerModel.value,
  scheduler: props.browserLanding
    ? undefined
    : selectedSchedulerName(
        workspace.settings.value.mode,
        workspace.settings.value.profileId,
        workspace.profiles.value,
        t('home.workspace.mode.coordinator')
      )
}))
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

const steerDeliveryMode = ref<WorkspaceQueueDeliveryMode>('steer')
const canSteer = computed(
  () =>
    workspace.settings.value.mode === 'agent' &&
    isStreaming.value &&
    !(workspace.state.value?.queueHeld ?? false)
)
watch(isStreaming, (live) => {
  if (live) steerDeliveryMode.value = 'steer'
})
watch(
  () => workspace.queue.value.length,
  () => {
    void nextTick(() => petEl.value?.syncSurface())
  }
)

async function recallQueuedItem(item: WorkspaceQueuedInput): Promise<void> {
  const ownerId = conversationId.value
  const removed = await workspace.queueAction(item.id, 'remove')
  if (!removed || conversationId.value !== ownerId) return
  const existing = draft.value.trim()
  draft.value = existing ? `${item.text}\n${draft.value}` : item.text
  if (canSteer.value) {
    steerDeliveryMode.value = item.deliveryMode ?? 'queue'
  }
  void nextTick(() => {
    autoGrow()
    composerEl.value?.focus()
  })
}

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
  deliveryMode: () => (canSteer.value ? steerDeliveryMode.value : 'queue'),
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
    :class="{ conversing: !isEmpty, 'is-resizing-panel': isResizing }"
    :style="{
      '--home-composer-height': composerClearance,
      '--home-panel-width': `${panelWidth}px`,
      '--home-panel-min-width': `${SIDE_PANEL_MIN_WIDTH}px`,
      '--home-body-min-width': `${HOME_BODY_MIN_WIDTH}px`
    }"
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
        <HomeStageBlurs :visible="!isEmpty" />
        <div
          class="HomePage-Center"
          :class="{ 'is-compact-head': isEmpty && !homeRecommendationsEnabled }"
        >
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

          <HomeConversationStream
            ref="streamEl"
            v-model:following="streamFollowing"
            :visible="!isEmpty"
            :conversation-id="conversationId"
            :stream-items="streamItems"
            :messages="messages"
            :is-streaming="isStreaming"
            :is-compacting="isCompacting"
            :panel-open="panelOpen"
            :entering-messages="enteringMessages"
            :branching="branching"
            :show-turn-metrics="showTurnMetrics"
            :dictation-clip="dictation.clip.value"
            :dictating="dictation.active.value"
            :voice-send-blocked="voiceSendBlocked"
            :is-turn-footer-resting="isTurnFooterResting"
            :can-branch-from="canBranchFrom"
            :speak-state-of="speakStateOf"
            @voice-retry="dictation.recognizeClip()"
            @voice-send="sendVoiceDraft()"
            @voice-dismiss="dictation.dismissClip()"
            @retry="conversation.retry()"
            @regenerate="conversation.retry()"
            @speak="toggleSpeak"
            @branch="branchTo({ messageId: $event })"
            @code-preview="showCodePreview"
            @code-run="runCodeInTerminal"
          />

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
              :show-empty-voice-draft="isEmpty"
              :voice-clip="dictation.clip.value"
              :dictating="dictation.active.value"
              :voice-send-blocked="voiceSendBlocked"
              @reload-workspace="workspace.reload()"
              @approve-run="workspace.approveRun()"
              @reject-run="workspace.rejectRun()"
              @approve-tool="agentTools.approve($event)"
              @deny-tool="agentTools.deny($event)"
              @voice-retry="dictation.recognizeClip()"
              @voice-send="sendVoiceDraft()"
              @voice-dismiss="dictation.dismissClip()"
            />

            <div class="HomePage-ComposerDeck">
              <Transition
                name="home-queue"
                @after-enter="petEl?.syncSurface()"
                @after-leave="petEl?.syncSurface()"
              >
                <HomeWorkspaceQueue
                  v-if="workspace.state.value?.status && workspace.queue.value.length > 0"
                  ref="queueEl"
                  :items="workspace.queue.value"
                  :status="workspace.state.value.status"
                  :held="workspace.state.value.queueHeld ?? false"
                  :limit="WORKSPACE_QUEUE_LIMIT"
                  :pending="workspace.queuePending.value"
                  :resuming="workspace.resuming.value"
                  :can-steer="canSteer"
                  @action="workspace.queueAction"
                  @update="workspace.updateQueued"
                  @mode="workspace.setQueuedDeliveryMode"
                  @recall="recallQueuedItem"
                  @resume="workspace.resume()"
                />
              </Transition>

              <TuffAIComposer
                ref="composerEl"
                v-model:draft="draft"
                v-model:permission-mode="agentToolsMode"
                :placeholder="
                  t(browserLanding ? 'browser.composerPlaceholder' : 'home.placeholder')
                "
                :attachments="pendingAttachments"
                :attach-open-label="attachOpenLabel"
                :attach-preview-props="attachPreviewProps"
                :input-disabled="browserNavigating"
                :dragover="isDragover"
                :live="isStreaming"
                :lifting="lifting"
                :beam-active="composerBeamActive"
                :dictation="dictation"
                :model="composerPill"
                :send-state="sendState"
                :send-queues="sendQueues"
                :can-steer="canSteer"
                :delivery-mode="canSteer ? steerDeliveryMode : 'queue'"
                @update:delivery-mode="steerDeliveryMode = $event"
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
                <!-- Browser landing: Browse / Ask on the left. Home: the scheduler joins the model
                     pill in the toolbar's engine capsule. -->
                <template #[composerModeSlot]>
                  <HomeComposerModeSlot
                    v-model:browser-mode="browserMode"
                    :browser-landing="browserLanding"
                    :browser-navigating="browserNavigating"
                    :has-attachments="pendingAttachments.length > 0"
                    :workspace-mode="workspace.settings.value.mode"
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
            </div>

            <HomeRunDock
              v-if="!isEmpty && (isStreaming || contextShare !== null)"
              :streaming="isStreaming"
              :started-at="runStartedAt"
              :step="runStep"
              :verb="thinkingTicker.activeLabel.value"
              :context-share="contextShare"
              :context-window-text="contextWindowText"
              :hide-miko="petVisible"
            />

            <HomePushCardSlot
              v-model:step="pushStep"
              :visible="isEmpty && homeRecommendationsEnabled"
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
            <slot v-if="browserLanding" name="browser-footer" />
          </div>
        </div>
      </div>

      <HomeSidePanelSlot
        :open="panelOpen"
        :resizing="isResizing"
        :width="panelWidth"
        :dock-to-shell="!browserLanding"
        :active="isHomeRoute"
        :messages="messages"
        :conversation-id="conversationId"
        :workspace-root="effectiveWorkspaceRoot"
        :git-available="gitAvailable"
        :context="workspace.state.value?.context"
        :turn="lastTurn"
        :activity-turns="activityTurns"
        :limits="modelLimits"
        :gateway="gatewayApprovals"
        :pending-run="workspace.state.value?.pendingRun"
        :loading="workspace.loading.value"
        :tabs="sidePanelTabs"
        :active-tab-id="activeSidePanelTabId"
        :recent-items="sidePanelRecentItems"
        @locate="streamRef?.scrollToIndex($event)"
        @select-tab="selectSidePanelTab"
        @close-tab="closeSidePanelTab"
        @close-other-tabs="closeOtherSidePanelTabs"
        @close-all-tabs="closeAllSidePanelTabs"
        @close-panel="panelOpen = false"
        @open-launcher="openLauncher"
        @open-tool="openWorkspaceTool"
        @open-file-picker="pickAndOpenFileInSidebar"
        @open-file="
          openFileInSidebar({
            absolutePath: $event.path,
            displayPath: $event.displayPath,
            line: $event.line
          })
        "
        @open-web="openWebInSidebar"
        @open-blank-browser="openBlankWebTab(t('home.sidePanel.browser'))"
        @update-web-tab="updateWebTab"
        @update-file-tab="updateFileTab"
        @open-web-in-browser="openWebInBuiltInBrowser"
        @open-file-in-browser="
          openFileInBuiltInBrowser({
            absolutePath: $event.path,
            displayPath: $event.displayPath,
            line: $event.line
          })
        "
        @open-web-external="openWebExternal"
        @start-resize="startSidePanelResize"
        @reset-width="resetSidePanelWidth"
        @remove-recent="removeSidePanelRecent"
        @clear-recents="clearSidePanelRecents"
        @ai-action="handleFileAiAction"
      />
    </div>

    <Transition name="home-pet">
      <HomePet v-if="petVisible" ref="petEl" :host="petHost" />
    </Transition>
    <HomeSendLiftOverlay ref="liftOverlayEl" />

    <TxSelectionActions
      v-if="passageSelection"
      ref="selectionBarRef"
      :selection="passageSelection"
      :actions="passageActions"
      :aria-label="t('home.selectionActions')"
      hide-prompt
      @action="runPassageAction"
    />
  </div>
</template>

<style lang="scss" scoped>
.HomePage {
  position: relative;
  --home-panel-width: 460px;
  --home-panel-min-width: 320px;
  --home-body-min-width: 480px;
  --home-chat-lane-width: min(720px, calc(100% - clamp(40px, 8%, 64px)));

  &.is-resizing-panel {
    user-select: none;
    cursor: col-resize;
  }

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

.HomePage-Center {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding-bottom: 16px;
  position: relative;

  // Without the three-line opening block (Browser Start Page, or Home with recommendations off),
  // give the greeting a bit more breathing room above the composer so the perched pet clears it.
  &.is-compact-head {
    gap: 36px;
  }

  .HomePage.conversing & {
    gap: 16px;
    justify-content: flex-start;
    height: 100%;
    min-height: 0;
    padding-bottom: 0;
  }
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
    bottom: 12px;
    left: 0;
    --home-group-gap: 8px;
    gap: var(--home-group-gap);
    pointer-events: none;
  }
}

.HomePage-ComposerDeck {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  min-width: 0;
  pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
  .home-queue-enter-active {
    transition:
      opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .home-queue-leave-active {
    transition:
      opacity 0.18s cubic-bezier(0.4, 0, 1, 1),
      transform 0.18s cubic-bezier(0.4, 0, 1, 1);
  }
}

.home-queue-enter-from,
.home-queue-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.98);
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

.home-pet-enter-active {
  transition: opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1) 0.42s;

  :deep(.HomePet-Button) {
    pointer-events: none;
  }
}

.home-pet-enter-from {
  opacity: 0;
}

@property --home-glow-on {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}

:deep(.is-file-path),
:deep(.is-web-link) {
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
  .home-pet-enter-active,
  .home-queue-enter-active,
  .home-queue-leave-active {
    transition: none;
  }
}
</style>
