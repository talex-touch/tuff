<script lang="ts" name="HomePage" setup>
import { TxSelectionActions } from '@talex-touch/tuffex/selection-actions'
import { useAppSdk, useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { WORKSPACE_QUEUE_LIMIT } from '~/modules/conversation/useAgentWorkspace'
import { useConversationHistory } from '~/modules/conversation/useConversationHistory'
import { homeMessageContextKey } from './composables/home-message-context'
import { useConversationRestore } from './composables/useConversationRestore'
import { useConversationTitle } from './composables/useConversationTitle'
import { useHomeAttachments } from './composables/useHomeAttachments'
import { useHomeCommands } from './composables/useHomeCommands'
import { useHomeComposerLayout } from './composables/useHomeComposerLayout'
import { useHomeDictation } from './composables/useHomeDictation'
import { useHomeOpening } from './composables/useHomeOpening'
import { useHomePreviewPanels } from './composables/useHomePreviewPanels'
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
import HomeFilePreviewDrawer from './preview/HomeFilePreviewDrawer.vue'
import TuffAIComposer from './TuffAIComposer.vue'

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
const liftOverlayEl = ref<InstanceType<typeof HomeSendLiftOverlay> | null>(null)
const router = useRouter()

const { composerClearance, autoGrow, collapseDraft, bubbleMaxWidth } = useHomeComposerLayout({
  input: inputRef,
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
watch([conversationId, isEmpty], () => {
  streamFollowing.value = true
})

const {
  panelOpen,
  panelTab,
  codeTabs,
  activeCodeTabId,
  selectCodeTab,
  closeCodeTab,
  showCodePreview,
  fileDrawerVisible,
  previewFilePath,
  previewDisplayPath,
  projectStore,
  currentProject
} = useHomePreviewPanels({ conversationId, projectId, bodyRef })

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
        <HomeStageBlurs :visible="!isEmpty" />
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
  .home-head-enter-active {
    transition: none;
  }
}
</style>
