<script setup lang="ts">
const {
  pilotTitle,
  sessionRows,
  activeSessionId,
  activeSessionTitle,
  activeSessionTitleLoading,
  loadingSessions,
  running,
  deletingSessionId,
  handleCreateSession,
  selectSession,
  deleteSession,
  chatListMessages,
  loadingMessages,
  draft,
  onComposerSend,
  composerAttachments,
  replayFromSeq,
  hasPausedSession,
  streamError,
  reconnectHint,
  uploadFiles,
  traceDrawerOpen,
  traceItems,
  lastSeq,
} = usePilotChatPage()
</script>

<template>
  <div class="pilot-page">
    <PilotSessionsPanel
      :pilot-title="pilotTitle"
      :sessions="sessionRows"
      :active-session-id="activeSessionId"
      :loading-sessions="loadingSessions"
      :running="running"
      :deleting-session-id="deletingSessionId"
      @create-session="handleCreateSession"
      @select-session="selectSession"
      @delete-session="deleteSession"
    />

    <PilotChatWorkspace
      v-model:draft="draft"
      v-model:trace-drawer-open="traceDrawerOpen"
      :active-session-id="activeSessionId"
      :active-session-title="activeSessionTitle"
      :active-session-title-loading="activeSessionTitleLoading"
      :running="running"
      :loading-messages="loadingMessages"
      :messages="chatListMessages"
      :composer-attachments="composerAttachments"
      :has-paused-session="hasPausedSession"
      :stream-error="streamError"
      :reconnect-hint="reconnectHint"
      :trace-items="traceItems"
      :last-seq="lastSeq"
      @send="onComposerSend"
      @replay="replayFromSeq"
      @upload-files="uploadFiles"
    />
  </div>
</template>

<style scoped>
.pilot-page {
  display: grid;
  grid-template-columns: clamp(248px, 19vw, 292px) minmax(0, 1fr);
  height: 100dvh;
  overflow: hidden;
  background: radial-gradient(
      circle at 8% 8%,
      color-mix(in srgb, var(--tx-color-warning-light-5) 48%, transparent) 0%,
      transparent 42%
    ),
    radial-gradient(
      circle at 92% 0%,
      color-mix(in srgb, var(--tx-color-primary-light-5) 46%, transparent) 0%,
      transparent 35%
    ),
    linear-gradient(
      160deg,
      color-mix(in srgb, var(--tx-bg-color-page) 82%, var(--tx-fill-color-light)) 0%,
      color-mix(in srgb, var(--tx-bg-color-page) 70%, var(--tx-fill-color-lighter)) 100%
    );
  color: var(--tx-text-color-primary);
  font-family: var(--tx-font-family);
}

@media (max-width: 960px) {
  .pilot-page {
    grid-template-columns: 1fr;
  }
}
</style>
