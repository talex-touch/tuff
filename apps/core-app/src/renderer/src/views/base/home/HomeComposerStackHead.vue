<script lang="ts" name="HomeComposerStackHead" setup>
import type { AgentToolConfirmRequest } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type {
  ConversationWorkspaceStatus,
  WorkspacePendingRun,
  WorkspaceQueuedInput
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { IntelligenceMessageAttachment } from '@talex-touch/utils/types/intelligence'
import type {
  AgentWorkspaceError,
  WorkspaceQueueAction
} from '~/modules/conversation/useAgentWorkspace'
import type { DictationClip } from './composer/useComposerDictation'
import { TxToolConfirmation } from '@talex-touch/tuffex/tool-confirmation'
import { useI18n } from 'vue-i18n'
import HomeVoiceDraft from './composer/HomeVoiceDraft.vue'
import HomeRunApproval from './workspace/HomeRunApproval.vue'
import HomeWorkspaceQueue from './workspace/HomeWorkspaceQueue.vue'

/**
 * The interactive cards stacked immediately above the composer inside `.HomePage-ComposerGroup`:
 * load error banner, run approval gate, tool confirmation card, queued follow-up drawer, and
 * untouched-home voice draft clip. Rendered as a fragment so each card stays a direct flex item of
 * `.HomePage-ComposerGroup` and preserves `--home-group-gap` / `:has(.HomeWorkspaceQueue)` layout.
 */
defineProps<{
  loadError: AgentWorkspaceError | null
  loadErrorText: string
  pendingRun?: WorkspacePendingRun
  pendingRunProfileName?: string
  runDecision: 'approve' | 'reject' | null
  pendingTool: AgentToolConfirmRequest | null
  pendingGatewayOrigin?: 'current' | 'other' | 'external'
  workspaceStatus?: ConversationWorkspaceStatus
  queue: WorkspaceQueuedInput[]
  queueHeld: boolean
  queueLimit: number
  queuePending: { queueId: string; action: WorkspaceQueueAction } | null
  resuming: boolean
  showEmptyVoiceDraft: boolean
  voiceClip: DictationClip | null
  dictating: boolean
  voiceSendBlocked: boolean
}>()

const emit = defineEmits<{
  (event: 'reload-workspace'): void
  (event: 'approve-run'): void
  (event: 'reject-run'): void
  (event: 'approve-tool', remember: boolean): void
  (event: 'deny-tool', remember: boolean): void
  (event: 'queue-action', queueId: string, action: WorkspaceQueueAction): void
  (
    event: 'queue-update',
    queueId: string,
    text: string,
    attachments?: IntelligenceMessageAttachment[],
    keptAttachmentIds?: string[]
  ): void
  (event: 'queue-resume'): void
  (event: 'voice-retry'): void
  (event: 'voice-send'): void
  (event: 'voice-dismiss'): void
}>()

const { t } = useI18n()
</script>

<template>
  <!-- Main could not read this thread: nothing below is its state, so say so and offer
       the read again rather than an empty stage that looks like a new conversation. -->
  <div v-if="loadError" class="HomePage-WorkspaceAlert" role="alert">
    <span class="i-ri-error-warning-line HomePage-ErrorIcon" aria-hidden="true" />
    <p class="HomePage-WorkspaceAlertText">
      {{ loadErrorText }}
    </p>
    <button class="HomePage-RetryBtn" type="button" @click="emit('reload-workspace')">
      {{ t('home.workspace.retry') }}
    </button>
  </div>

  <!-- An agent run waiting on the run gate (run id), apart from the tool gate below. -->
  <HomeRunApproval
    v-if="pendingRun"
    :run="pendingRun"
    :profile-name="pendingRunProfileName"
    :deciding="runDecision"
    @approve="emit('approve-run')"
    @reject="emit('reject-run')"
  />

  <!-- The agent cannot continue until this is answered. Keeping the card in the measured
       composer stack reserves its full height while the transcript still scrolls behind it. -->
  <div v-if="pendingTool" class="HomePage-ConfirmSlot">
    <!-- Main attributed the request to its turn; one it could not is not this thread's. -->
    <p
      v-if="pendingGatewayOrigin && pendingGatewayOrigin !== 'current'"
      class="HomePage-ConfirmOrigin"
    >
      <span class="i-ri-information-line" aria-hidden="true" />
      <span>{{ t(`home.workspace.gateway.originNote.${pendingGatewayOrigin}`) }}</span>
    </p>
    <TxToolConfirmation
      :tool-name="pendingTool.tool"
      :summary="pendingTool.summary"
      :input="pendingTool.input"
      :risk="pendingTool.risk"
      :allow-label="t('home.toolAllow')"
      :deny-label="t('home.toolDeny')"
      :remember-label="t('home.toolRemember')"
      @approve="emit('approve-tool', $event.remember)"
      @deny="emit('deny-tool', $event.remember)"
    />
  </div>

  <Transition name="home-queue">
    <HomeWorkspaceQueue
      v-if="workspaceStatus && queue.length > 0"
      :items="queue"
      :status="workspaceStatus"
      :held="queueHeld"
      :limit="queueLimit"
      :pending="queuePending"
      :resuming="resuming"
      @action="(queueId, action) => emit('queue-action', queueId, action)"
      @update="
        (queueId, text, attachments, keptAttachmentIds) =>
          emit('queue-update', queueId, text, attachments, keptAttachmentIds)
      "
      @resume="emit('queue-resume')"
    />
  </Transition>

  <!-- An untouched Home has no stream for the voice clip to end: it waits here instead. -->
  <HomeVoiceDraft
    v-if="showEmptyVoiceDraft && voiceClip"
    class="HomePage-VoiceDraftDock"
    :clip="voiceClip"
    :dictating="dictating"
    :send-blocked="voiceSendBlocked"
    @retry="emit('voice-retry')"
    @send="emit('voice-send')"
    @dismiss="emit('voice-dismiss')"
  />
</template>

<style lang="scss" scoped>
.HomePage-VoiceDraftDock {
  width: var(--home-chat-lane-width, 100%);
  max-width: 100%;
}

.HomePage-WorkspaceAlert {
  display: flex;
  gap: 10px;
  align-items: center;
  width: var(--home-chat-lane-width);
  min-width: 0;
  padding: 10px 14px;
  border-radius: var(--shell-radius-lg);
  background: var(--shell-danger-soft);
  box-sizing: border-box;
  pointer-events: auto;
}

.HomePage-WorkspaceAlertText {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--shell-danger);
  font-size: var(--shell-fs-body);
  line-height: 1.5;
}

.HomePage-ErrorIcon {
  flex: none;
  margin-top: 1px;
  color: var(--shell-danger);
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

  &:hover {
    background: color-mix(in srgb, var(--shell-danger) 12%, transparent);
  }
}

.HomePage-ConfirmOrigin {
  display: flex;
  gap: 6px;
  align-items: center;
  margin: 0 0 6px;
  padding: 6px 10px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-warning-soft);
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-caption);
}

.HomePage-ConfirmSlot {
  width: var(--home-chat-lane-width);
  min-width: 0;
  animation: home-msg-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  pointer-events: auto;
}

@media (prefers-reduced-motion: no-preference) {
  .home-queue-enter-active {
    transition:
      opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.32s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .home-queue-leave-active {
    transition:
      opacity 0.2s cubic-bezier(0.4, 0, 1, 1),
      transform 0.2s cubic-bezier(0.4, 0, 1, 1);
  }
}

.home-queue-enter-from,
.home-queue-leave-to {
  opacity: 0;
  transform: translateY(28px) scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .home-queue-enter-active,
  .home-queue-leave-active {
    transition: none;
  }
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
</style>
