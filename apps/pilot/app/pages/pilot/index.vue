<script setup lang="ts">
import { ref } from 'vue'

definePageMeta({
  layout: 'pilot',
})

const {
  pilotTitle,
  sessionRows,
  activeSessionId,
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

const sidebarCollapsed = ref(false)

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}
</script>

<template>
  <div class="pilot-page" :class="{ 'is-sidebar-collapsed': sidebarCollapsed }">
    <PilotSessionsPanel
      :pilot-title="pilotTitle"
      :sessions="sessionRows"
      :active-session-id="activeSessionId"
      :collapsed="sidebarCollapsed"
      :loading-sessions="loadingSessions"
      :deleting-session-id="deletingSessionId"
      @create-session="handleCreateSession"
      @toggle-collapse="toggleSidebar"
      @select-session="selectSession"
      @delete-session="deleteSession"
    />

    <PilotChatWorkspace
      v-model:draft="draft"
      v-model:trace-drawer-open="traceDrawerOpen"
      :active-session-id="activeSessionId"
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
  transition: grid-template-columns 180ms ease;
}

.pilot-page.is-sidebar-collapsed {
  grid-template-columns: 86px minmax(0, 1fr);
}

@media (max-width: 960px) {
  .pilot-page,
  .pilot-page.is-sidebar-collapsed {
    grid-template-columns: 1fr;
  }
}
</style>
