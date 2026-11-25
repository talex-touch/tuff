<script lang="ts" name="HomeSidePanelSlot" setup>
import type {
  WorkspaceContextProjection,
  WorkspacePendingRun
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type {
  ConversationMessage,
  ConversationTurnMeta
} from '~/modules/conversation/useHomeConversation'
import type {
  ActivityGatewayApproval,
  ActivityTurn
} from '~/modules/conversation/workspace-activity'
import type { HomeModelLimits } from '~/modules/conversation/workspace-panel'
import type {
  SidePanelRecentItem,
  SidePanelTab,
  SidePanelWorkspaceKind
} from './composables/useHomeSidePanel'
import { computed, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useShellRightSidebar } from '~/modules/layout/useShellRightSidebar'
import { HOME_BODY_MIN_WIDTH, SIDE_PANEL_MIN_WIDTH } from './composables/useHomeSidePanel'
import HomeSidePanel from './HomeSidePanel.vue'

/**
 * Animated & resizable docked slot wrapper for `HomeSidePanel`: clips the panel while animating
 * open/closed, offers a left-edge drag grip to resize width, and teleports into `AppShell`'s
 * full-height right sidebar dock so it spans cleanly from the very top edge of the window.
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    resizing: boolean
    width?: number
    dockToShell?: boolean
    active?: boolean
    messages: ConversationMessage[]
    conversationId: string | null
    workspaceRoot?: string
    context?: WorkspaceContextProjection
    turn?: ConversationTurnMeta
    activityTurns: ActivityTurn[]
    limits?: HomeModelLimits
    gateway: ActivityGatewayApproval[]
    pendingRun?: WorkspacePendingRun
    loading: boolean
    tabs: SidePanelTab[]
    activeTabId: string | null
    recentItems?: SidePanelRecentItem[]
  }>(),
  {
    width: 460,
    dockToShell: false,
    active: true,
    recentItems: () => []
  }
)

const emit = defineEmits<{
  (event: 'locate', messageIndex: number): void
  (event: 'select-tab', id: string | null): void
  (event: 'close-tab', id: string): void
  (event: 'close-other-tabs', id: string): void
  (event: 'close-all-tabs'): void
  (event: 'close-panel'): void
  (event: 'open-launcher'): void
  (event: 'open-tool', kind: SidePanelWorkspaceKind): void
  (event: 'open-file-picker'): void
  (event: 'open-file', payload: { path: string; displayPath: string; line?: number }): void
  (event: 'open-web', url: string): void
  (event: 'open-blank-browser'): void
  (
    event: 'update-web-tab',
    id: string,
    payload: { url: string; title: string; favicon: string | null }
  ): void
  (event: 'update-file-tab', id: string, payload: { path: string; displayPath: string }): void
  (event: 'open-web-in-browser', url: string): void
  (
    event: 'open-file-in-browser',
    payload: { path: string; displayPath: string; line?: number }
  ): void
  (event: 'open-web-external', url: string): void
  (event: 'start-resize', pointerEvent: PointerEvent): void
  (event: 'reset-width'): void
  (event: 'remove-recent', id: string): void
  (event: 'clear-recents'): void
}>()

const { t } = useI18n()
const { dockHost, syncDockState, resetDockState } = useShellRightSidebar()

const keepAliveActive = ref(true)
const hasBeenOpened = ref(props.open)
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) hasBeenOpened.value = true
  }
)
const panelActive = computed(() => keepAliveActive.value && props.active)
const visible = computed(() => props.open && panelActive.value)
const shouldTeleport = computed(() => Boolean(props.dockToShell && dockHost.value))
const teleportTarget = computed<HTMLElement | string>(() => dockHost.value ?? 'body')
const dockedVisible = computed(() => shouldTeleport.value && visible.value)
const slotStyle = computed(() => ({
  '--home-panel-width': `${props.width}px`,
  '--home-panel-min-width': `${SIDE_PANEL_MIN_WIDTH}px`,
  '--home-body-min-width': `${HOME_BODY_MIN_WIDTH}px`
}))

watch(
  [dockedVisible, () => props.resizing],
  ([visible, resizing]) => {
    if (!props.dockToShell) return
    syncDockState({ open: visible, resizing })
  },
  { immediate: true }
)

onActivated(() => {
  keepAliveActive.value = true
})

onDeactivated(() => {
  keepAliveActive.value = false
})

onBeforeUnmount(() => {
  if (props.dockToShell) {
    resetDockState()
  }
})
</script>

<template>
  <Teleport :to="teleportTarget" :disabled="!shouldTeleport">
    <Transition name="home-panel">
      <div
        v-if="hasBeenOpened"
        v-show="visible"
        class="HomePage-PanelSlot"
        :class="{ 'is-resizing': resizing, 'is-shell-docked': shouldTeleport }"
        :style="slotStyle"
      >
        <div
          class="HomePage-PanelResizer"
          :class="{ 'is-resizing': resizing }"
          role="separator"
          aria-orientation="vertical"
          :aria-label="t('home.sidePanel.resize')"
          :title="t('home.sidePanel.resizeHint')"
          tabindex="-1"
          @pointerdown="emit('start-resize', $event)"
          @dblclick="emit('reset-width')"
        />
        <HomeSidePanel
          :messages="messages"
          :conversation-id="conversationId"
          :workspace-root="workspaceRoot"
          :context="context"
          :turn="turn"
          :activity-turns="activityTurns"
          :limits="limits"
          :gateway="gateway"
          :pending-run="pendingRun"
          :loading="loading"
          :tabs="tabs"
          :active-tab-id="activeTabId"
          :recent-items="recentItems"
          :panel-active="visible"
          :docked-to-shell="shouldTeleport"
          @locate="emit('locate', $event)"
          @select-tab="emit('select-tab', $event)"
          @close-tab="emit('close-tab', $event)"
          @close-other-tabs="emit('close-other-tabs', $event)"
          @close-all-tabs="emit('close-all-tabs')"
          @close-panel="emit('close-panel')"
          @open-launcher="emit('open-launcher')"
          @open-tool="emit('open-tool', $event)"
          @open-file-picker="emit('open-file-picker')"
          @open-file="emit('open-file', $event)"
          @open-web="emit('open-web', $event)"
          @open-blank-browser="emit('open-blank-browser')"
          @update-web-tab="(id, payload) => emit('update-web-tab', id, payload)"
          @update-file-tab="(id, payload) => emit('update-file-tab', id, payload)"
          @open-web-in-browser="emit('open-web-in-browser', $event)"
          @open-file-in-browser="emit('open-file-in-browser', $event)"
          @open-web-external="emit('open-web-external', $event)"
          @remove-recent="emit('remove-recent', $event)"
          @clear-recents="emit('clear-recents')"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.HomePage-PanelSlot {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  width: var(--home-panel-rendered-width, var(--home-panel-width, 460px));
  height: 100%;
  min-height: 0;
  overflow: hidden;

  &:not(.is-shell-docked) {
    --home-panel-rendered-width: min(
      var(--home-panel-width, 460px),
      max(var(--home-panel-min-width, 320px), calc(100cqi - var(--home-body-min-width, 480px)))
    );
    grid-column: 2;
    grid-row: 1 / -1;
  }

  &.is-shell-docked {
    --home-panel-rendered-width: min(
      var(--home-panel-width, 460px),
      max(
        var(--home-panel-min-width, 320px),
        calc(100vw - var(--shell-sidebar-width, 260px) - var(--home-body-min-width, 480px))
      )
    );
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
  }

  &.is-resizing {
    user-select: none;
  }
}

.HomePage-PanelResizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  width: 6px;
  cursor: col-resize;
  -webkit-app-region: no-drag;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 2px;
    background: var(--shell-primary);
    opacity: 0;
    transition: opacity 140ms ease;
  }

  &:hover::after,
  &.is-resizing::after {
    opacity: 0.75;
  }
}

/* Docks underneath once an inline HomePage is narrower than HOME_BODY_MIN_WIDTH + SIDE_PANEL_MIN_WIDTH. */
@container (max-width: 800px) {
  .HomePage-PanelSlot:not(.is-shell-docked) {
    --home-panel-rendered-width: 100%;
    --home-panel-width: 100%;
    grid-column: 1 / -1;
    grid-row: 3;
    width: 100%;
    height: min(42vh, 360px);
    min-height: 180px;
    border-top: 1px solid var(--shell-border);

    .HomePage-PanelResizer {
      display: none;
    }

    :deep(.HomeSidePanel) {
      width: 100%;
      min-width: 0;
      height: 100%;
      border-left: 0;
    }
  }
}

.home-panel-enter-active,
.home-panel-leave-active {
  transition:
    width 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.15s ease;
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
