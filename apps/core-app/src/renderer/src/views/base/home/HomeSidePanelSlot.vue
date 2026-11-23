<script lang="ts" name="HomeSidePanelSlot" setup>
import type {
  WorkspaceContextProjection,
  WorkspacePendingRun
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { CodePreviewTab } from '~/modules/conversation/useCodePreviewTabs'
import type {
  ConversationMessage,
  ConversationTurnMeta
} from '~/modules/conversation/useHomeConversation'
import type {
  ActivityGatewayApproval,
  ActivityTurn
} from '~/modules/conversation/workspace-activity'
import type { HomeModelLimits } from '~/modules/conversation/workspace-panel'
import HomeSidePanel from './HomeSidePanel.vue'

/**
 * Animated slot wrapper for `HomeSidePanel`: clips the fixed-width panel while the slot narrows so
 * rows slide out instead of reflowing every frame, and docks underneath on narrow containers.
 */
defineProps<{
  open: boolean
  messages: ConversationMessage[]
  conversationId: string | null
  context?: WorkspaceContextProjection
  turn?: ConversationTurnMeta
  activityTurns: ActivityTurn[]
  limits?: HomeModelLimits
  gateway: ActivityGatewayApproval[]
  pendingRun?: WorkspacePendingRun
  loading: boolean
  codeTabs: CodePreviewTab[]
  activeCodeTabId: string | null
}>()

const tab = defineModel<string>('tab', { required: true })

const emit = defineEmits<{
  (event: 'locate', messageIndex: number): void
  (event: 'select-code-tab', id: string): void
  (event: 'close-code-tab', id: string): void
}>()
</script>

<template>
  <Transition name="home-panel">
    <div v-if="open" class="HomePage-PanelSlot">
      <HomeSidePanel
        v-model:tab="tab"
        :messages="messages"
        :conversation-id="conversationId"
        :context="context"
        :turn="turn"
        :activity-turns="activityTurns"
        :limits="limits"
        :gateway="gateway"
        :pending-run="pendingRun"
        :loading="loading"
        :code-tabs="codeTabs"
        :active-code-tab-id="activeCodeTabId"
        @locate="emit('locate', $event)"
        @select-code-tab="emit('select-code-tab', $event)"
        @close-code-tab="emit('close-code-tab', $event)"
      />
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.HomePage-PanelSlot {
  display: flex;
  grid-column: 2;
  grid-row: 1 / -1;
  width: var(--home-panel-width);
  overflow: hidden;
}

@container (max-width: 720px) {
  .HomePage-PanelSlot {
    --home-panel-width: 100%;
    grid-column: 1 / -1;
    grid-row: 3;
    width: 100%;
    height: min(35vh, 300px);
    min-height: 160px;
    border-top: 1px solid var(--shell-border);
  }

  .HomePage-PanelSlot :deep(.HomeSidePanel) {
    min-width: 0;
    height: 100%;
    border-left: 0;
  }
}

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
</style>
