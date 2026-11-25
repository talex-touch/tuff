<script lang="ts" name="HomeSidePanel" setup>
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
import { TxPopover } from '@talex-touch/tuffex/popover'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createBrowserSdk } from '@talex-touch/utils/transport/sdk/domains/browser'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import WorkspaceFileViewer from '~/components/preview/WorkspaceFileViewer.vue'
import { SHELL_MENU_CARD } from '~/components/shell/shell-menu-panel'
import { buildPreviewIndex } from '~/modules/conversation/preview-index'
import { useConversationReview } from '~/modules/conversation/useConversationReview'
import HomePreviewActivity from './preview/HomePreviewActivity.vue'
import HomePreviewArtifacts from './preview/HomePreviewArtifacts.vue'
import HomePreviewContext from './preview/HomePreviewContext.vue'
import HomePreviewEmpty from './preview/HomePreviewEmpty.vue'
import HomePreviewReview from './preview/HomePreviewReview.vue'
import HomePreviewSources from './preview/HomePreviewSources.vue'
import HomePreviewWidgets from './preview/HomePreviewWidgets.vue'
import HomeSideBrowserPane from './preview/HomeSideBrowserPane.vue'
import HomeSideGitPane from './preview/HomeSideGitPane.vue'
import HomeSideLauncher from './preview/HomeSideLauncher.vue'
import HomeSidePluginsPane from './preview/HomeSidePluginsPane.vue'
import HomeSideTerminalPane from './preview/HomeSideTerminalPane.vue'

/**
 * The docked right-hand sidebar beside the conversation (never a modal drawer).
 *
 * Hosts tabbed file previews (HTML, Markdown, Images, PDF, Code, Directories), an embedded
 * WebContentsView browser, an embedded workspace terminal, and the conversation's review,
 * artifacts, sources, activity, context, and plugins views behind a unified launcher.
 */
const props = withDefaults(
  defineProps<{
    messages: ConversationMessage[]
    conversationId: string | null
    workspaceRoot?: string
    context?: WorkspaceContextProjection
    turn?: ConversationTurnMeta
    limits?: HomeModelLimits
    activityTurns: ActivityTurn[]
    gateway: ActivityGatewayApproval[]
    pendingRun?: WorkspacePendingRun
    loading: boolean
    tabs: SidePanelTab[]
    activeTabId: string | null
    recentItems?: SidePanelRecentItem[]
    panelActive?: boolean
    dockedToShell?: boolean
  }>(),
  {
    recentItems: () => [],
    panelActive: true,
    dockedToShell: false
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
  (event: 'remove-recent', id: string): void
  (event: 'clear-recents'): void
}>()

const { t } = useI18n()
const menuOpen = ref(false)
const tabStripRef = ref<HTMLElement | null>(null)
const sideTabElements = new Map<string, HTMLElement>()
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
let tabStripResizeObserver: ResizeObserver | null = null
const transport = isElectronRenderer() ? useTuffTransport() : null
const browserSdk = transport ? createBrowserSdk(transport) : null

const index = computed(() => buildPreviewIndex(props.messages))
const createdFiles = computed(() =>
  index.value.artifacts.filter((item) => item.kind === 'created' && Boolean(item.path))
)
const counts = computed(() => ({
  outputs: index.value.artifacts.length + index.value.widgets.length,
  sources: index.value.sources.length,
  work: index.value.toolCalls.length
}))
const waiting = computed(() => props.gateway.length > 0 || Boolean(props.pendingRun))
const review = useConversationReview(() => props.conversationId)

const activeTab = computed(() => props.tabs.find((tab) => tab.id === props.activeTabId) ?? null)
const activeWebTab = computed(() => (activeTab.value?.kind === 'web' ? activeTab.value : null))
const hasAnyWebTab = computed(() => props.tabs.some((tab) => tab.kind === 'web'))
const hasAnyTerminalTab = computed(() => props.tabs.some((tab) => tab.kind === 'terminal'))
const hasAnyGitTab = computed(() => props.tabs.some((tab) => tab.kind === 'git'))

watch(hasAnyWebTab, (exists) => {
  if (!exists && browserSdk) {
    void browserSdk.sideClose().catch(() => {})
  }
})

function setSideTabEl(tabId: string, el: unknown): void {
  if (el instanceof HTMLElement) {
    sideTabElements.set(tabId, el)
  } else {
    sideTabElements.delete(tabId)
  }
}

function syncTabStripScrollEdges(): void {
  const el = tabStripRef.value
  if (!el || el.scrollWidth <= el.clientWidth + 1) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }
  canScrollLeft.value = el.scrollLeft > 2
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}

watch(
  tabStripRef,
  (el) => {
    tabStripResizeObserver?.disconnect()
    tabStripResizeObserver = null
    if (el && typeof ResizeObserver !== 'undefined') {
      tabStripResizeObserver = new ResizeObserver(syncTabStripScrollEdges)
      tabStripResizeObserver.observe(el)
    }
    void nextTick(syncTabStripScrollEdges)
  },
  { flush: 'post' }
)

watch(
  () => props.tabs.length,
  () => {
    void nextTick(syncTabStripScrollEdges)
  }
)

watch(
  () => props.activeTabId,
  (id) => {
    if (!id) return
    void nextTick(() => {
      sideTabElements.get(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      syncTabStripScrollEdges()
    })
  }
)

onBeforeUnmount(() => {
  tabStripResizeObserver?.disconnect()
  tabStripResizeObserver = null
  sideTabElements.clear()
  if (browserSdk) {
    void browserSdk.sideClose().catch(() => {})
  }
})

function tabIconClass(tab: SidePanelTab): string {
  switch (tab.kind) {
    case 'file':
      return 'i-ri-file-code-line'
    case 'web':
      return 'i-ri-global-line'
    case 'code':
      return 'i-ri-code-s-slash-line'
    case 'git':
      return 'i-ri-git-branch-line'
    case 'review':
      return 'i-ri-file-edit-line'
    case 'terminal':
      return 'i-ri-terminal-box-line'
    case 'outputs':
      return 'i-ri-stack-line'
    case 'sources':
      return 'i-ri-book-open-line'
    case 'work':
      return 'i-ri-pulse-line'
    case 'context':
      return 'i-ri-cpu-line'
    case 'plugins':
      return 'i-ri-puzzle-line'
  }
}

function runMenuAction(action: () => void): void {
  menuOpen.value = false
  action()
}

function onTabBarWheel(event: WheelEvent): void {
  const el = event.currentTarget
  if (!(el instanceof HTMLElement) || el.scrollWidth <= el.clientWidth) return
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && event.deltaY !== 0) {
    event.preventDefault()
    el.scrollLeft += event.deltaY
    syncTabStripScrollEdges()
  }
}
</script>

<template>
  <aside class="HomeSidePanel" :aria-label="t('home.panel.title')">
    <header class="HomeSidePanel-Header">
      <div
        v-if="tabs.length > 0"
        ref="tabStripRef"
        class="HomeSidePanel-TabStrip"
        :class="{
          'can-scroll-left': canScrollLeft,
          'can-scroll-right': canScrollRight
        }"
        role="tablist"
        :aria-label="t('home.sidePanel.tabs')"
        @scroll.passive="syncTabStripScrollEdges"
        @wheel="onTabBarWheel"
      >
        <div class="HomeSidePanel-TabTrack">
          <div
            v-for="tab in tabs"
            :key="tab.id"
            :ref="(el) => setSideTabEl(tab.id, el)"
            class="HomeSidePanel-Tab"
            :class="{ 'is-active': tab.id === activeTabId }"
            @auxclick.middle.prevent="emit('close-tab', tab.id)"
          >
            <button
              type="button"
              role="tab"
              class="HomeSidePanel-TabBtn"
              :aria-selected="tab.id === activeTabId"
              :title="
                tab.kind === 'file'
                  ? tab.path
                  : tab.kind === 'web'
                    ? tab.url || tab.title
                    : tab.title
              "
              @click="emit('select-tab', tab.id)"
            >
              <span :class="tabIconClass(tab)" class="HomeSidePanel-TabIcon" aria-hidden="true" />
              <span class="HomeSidePanel-TabTitle">{{ tab.title }}</span>
            </button>
            <button
              type="button"
              class="HomeSidePanel-TabClose"
              :aria-label="t('home.preview.closeCode', { title: tab.title })"
              :title="t('common.close')"
              @click.stop="emit('close-tab', tab.id)"
            >
              <span class="i-ri-close-line" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div v-else class="HomeSidePanel-Brand">
        <span class="HomeSidePanel-BrandLabel">{{ t('home.sidePanel.title') }}</span>
      </div>

      <div v-if="tabs.length > 0" class="HomeSidePanel-DragSpacer" aria-hidden="true" />

      <div
        class="HomeSidePanel-Controls"
        :class="{ 'shell-chrome-safe-inline-end': dockedToShell }"
      >
        <button
          type="button"
          class="HomeSidePanel-IconBtn"
          :class="{ 'is-active': activeTabId === null }"
          :aria-pressed="activeTabId === null"
          :title="t('home.sidePanel.newTab')"
          :aria-label="t('home.sidePanel.newTab')"
          @click="emit('open-launcher')"
        >
          <span class="i-ri-add-line" aria-hidden="true" />
        </button>

        <TxPopover
          v-model="menuOpen"
          trigger="click"
          placement="bottom-end"
          :offset="6"
          :match-reference-width="false"
          :min-width="200"
          :panel-radius="12"
          :panel-padding="6"
          :panel-card="SHELL_MENU_CARD"
        >
          <template #reference>
            <button
              type="button"
              class="HomeSidePanel-IconBtn"
              aria-haspopup="menu"
              :aria-expanded="menuOpen"
              :title="t('home.moreActions')"
              :aria-label="t('home.moreActions')"
            >
              <span class="i-ri-more-2-line" aria-hidden="true" />
            </button>
          </template>

          <div class="HomeSidePanel-Menu" role="menu">
            <button
              type="button"
              role="menuitem"
              class="HomeSidePanel-MenuItem"
              @click="runMenuAction(() => emit('open-tool', 'git'))"
            >
              <span class="i-ri-git-branch-line" aria-hidden="true" />
              <span class="HomeSidePanel-MenuLabel">{{ t('home.git.title') }}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              class="HomeSidePanel-MenuItem"
              @click="runMenuAction(() => emit('open-tool', 'review'))"
            >
              <span class="i-ri-file-edit-line" aria-hidden="true" />
              <span class="HomeSidePanel-MenuLabel">{{ t('home.workspace.panel.review') }}</span>
              <span v-if="review.records.value.length" class="HomeSidePanel-Count">
                {{ review.records.value.length }}
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              class="HomeSidePanel-MenuItem"
              @click="runMenuAction(() => emit('open-file-picker'))"
            >
              <span class="i-ri-file-line" aria-hidden="true" />
              <span class="HomeSidePanel-MenuLabel">{{ t('home.sidePanel.openFile') }}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              class="HomeSidePanel-MenuItem"
              @click="runMenuAction(() => emit('open-tool', 'terminal'))"
            >
              <span class="i-ri-terminal-box-line" aria-hidden="true" />
              <span class="HomeSidePanel-MenuLabel">{{ t('terminal.title') }}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              class="HomeSidePanel-MenuItem"
              @click="runMenuAction(() => emit('open-blank-browser'))"
            >
              <span class="i-ri-global-line" aria-hidden="true" />
              <span class="HomeSidePanel-MenuLabel">{{ t('home.sidePanel.browser') }}</span>
            </button>
            <div class="HomeSidePanel-MenuDivider" role="separator" />
            <button
              type="button"
              role="menuitem"
              class="HomeSidePanel-MenuItem"
              @click="runMenuAction(() => emit('open-tool', 'outputs'))"
            >
              <span class="i-ri-stack-line" aria-hidden="true" />
              <span class="HomeSidePanel-MenuLabel">{{ t('home.preview.artifacts') }}</span>
              <span v-if="counts.outputs" class="HomeSidePanel-Count">{{ counts.outputs }}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              class="HomeSidePanel-MenuItem"
              @click="runMenuAction(() => emit('open-tool', 'work'))"
            >
              <span class="i-ri-pulse-line" aria-hidden="true" />
              <span class="HomeSidePanel-MenuLabel">{{ t('home.preview.toolCalls') }}</span>
              <span v-if="counts.work" class="HomeSidePanel-Count">{{ counts.work }}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              class="HomeSidePanel-MenuItem"
              @click="runMenuAction(() => emit('open-tool', 'sources'))"
            >
              <span class="i-ri-book-open-line" aria-hidden="true" />
              <span class="HomeSidePanel-MenuLabel">{{ t('home.preview.sources') }}</span>
              <span v-if="counts.sources" class="HomeSidePanel-Count">{{ counts.sources }}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              class="HomeSidePanel-MenuItem"
              @click="runMenuAction(() => emit('open-tool', 'context'))"
            >
              <span class="i-ri-cpu-line" aria-hidden="true" />
              <span class="HomeSidePanel-MenuLabel">{{ t('home.workspace.panel.context') }}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              class="HomeSidePanel-MenuItem"
              @click="runMenuAction(() => emit('open-tool', 'plugins'))"
            >
              <span class="i-ri-puzzle-line" aria-hidden="true" />
              <span class="HomeSidePanel-MenuLabel">{{ t('home.sidePanel.plugins') }}</span>
            </button>
            <template v-if="tabs.length > 0">
              <div class="HomeSidePanel-MenuDivider" role="separator" />
              <button
                v-if="activeTabId && tabs.length > 1"
                type="button"
                role="menuitem"
                class="HomeSidePanel-MenuItem"
                @click="runMenuAction(() => emit('close-other-tabs', activeTabId!))"
              >
                <span class="i-ri-close-circle-line" aria-hidden="true" />
                <span class="HomeSidePanel-MenuLabel">{{ t('browser.tabMenu.closeOthers') }}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                class="HomeSidePanel-MenuItem"
                @click="runMenuAction(() => emit('close-all-tabs'))"
              >
                <span class="i-ri-delete-bin-6-line" aria-hidden="true" />
                <span class="HomeSidePanel-MenuLabel">{{ t('home.sidePanel.closeAllTabs') }}</span>
              </button>
            </template>
          </div>
        </TxPopover>

        <button
          type="button"
          class="HomeSidePanel-IconBtn"
          :title="t('home.closePanel')"
          :aria-label="t('home.closePanel')"
          @click="emit('close-panel')"
        >
          <span class="i-ri-close-line" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="HomeSidePanel-Stage">
      <!-- Launcher / Hub view (shown when no tab is active) -->
      <HomeSideLauncher
        v-if="!activeTab"
        :workspace-root="workspaceRoot"
        :created-files="createdFiles"
        :recent-items="recentItems"
        :review-count="review.records.value.length"
        :outputs-count="counts.outputs"
        :sources-count="counts.sources"
        :activity-count="counts.work"
        :waiting="waiting"
        @open-tool="emit('open-tool', $event)"
        @open-file-picker="emit('open-file-picker')"
        @open-file="emit('open-file', $event)"
        @open-web="emit('open-web', $event)"
        @open-blank-browser="emit('open-blank-browser')"
        @remove-recent="emit('remove-recent', $event)"
        @clear-recents="emit('clear-recents')"
      />

      <!-- Local file & directory viewer -->
      <WorkspaceFileViewer
        v-else-if="activeTab.kind === 'file'"
        :key="activeTab.id"
        :file-path="activeTab.path"
        :display-path="activeTab.displayPath"
        :conversation-id="conversationId"
        :line="activeTab.line"
        :refresh-token="activeTab.refreshToken"
        @navigate="emit('update-file-tab', activeTab.id, $event)"
        @open-in-browser="emit('open-file-in-browser', $event)"
      />

      <!-- Sandboxed code-block HTML/SVG preview -->
      <div v-else-if="activeTab.kind === 'code'" class="HomeSidePanel-CodeWrap">
        <iframe
          class="HomeSidePanel-CodeFrame"
          sandbox=""
          :title="t('home.code.frameLabel', { lang: activeTab.lang })"
          :srcdoc="activeTab.srcdoc"
        />
      </div>

      <!-- Review -->
      <div v-else-if="activeTab.kind === 'review'" class="HomeSidePanel-ScrollPane">
        <HomePreviewReview
          :records="review.records.value"
          :loading="review.loading.value"
          :load-error="review.loadError.value"
          :detail="review.detail.value"
          :detail-loading="review.detailLoading.value"
          :rolling-back="review.rollingBack.value"
          :last-rollback="review.lastRollback.value"
          @open="review.open"
          @close="review.close"
          @rollback="review.rollback"
          @reload="review.reload"
        />
      </div>

      <!-- Outputs / Artifacts -->
      <div v-else-if="activeTab.kind === 'outputs'" class="HomeSidePanel-ScrollPane">
        <HomePreviewEmpty
          v-if="!counts.outputs"
          icon="i-ri-file-text-line"
          :text="t('home.preview.outputsEmpty')"
        />
        <div v-else class="HomeSidePanel-Outputs">
          <HomePreviewArtifacts
            v-if="index.artifacts.length"
            :items="index.artifacts"
            @locate="emit('locate', $event)"
            @open-file="emit('open-file', $event)"
          />
          <HomePreviewWidgets
            v-if="index.widgets.length"
            :items="index.widgets"
            @locate="emit('locate', $event)"
          />
        </div>
      </div>

      <!-- Sources -->
      <div v-else-if="activeTab.kind === 'sources'" class="HomeSidePanel-ScrollPane">
        <HomePreviewSources
          :items="index.sources"
          @open-file="emit('open-file', $event)"
          @open-web="emit('open-web', $event)"
        />
      </div>

      <!-- Work / Activity -->
      <div v-else-if="activeTab.kind === 'work'" class="HomeSidePanel-ScrollPane">
        <HomePreviewActivity
          :turns="activityTurns"
          :gateway="gateway"
          :run="pendingRun"
          :loading="loading"
          @locate="emit('locate', $event)"
        />
      </div>

      <!-- Context -->
      <div v-else-if="activeTab.kind === 'context'" class="HomeSidePanel-ScrollPane">
        <HomePreviewContext :context="context" :turn="turn" :limits="limits" :loading="loading" />
      </div>

      <!-- Plugins -->
      <HomeSidePluginsPane v-else-if="activeTab.kind === 'plugins'" />

      <!-- Persistent side-git host while any git tab exists (preserves commit draft & diff selection) -->
      <HomeSideGitPane
        v-if="hasAnyGitTab"
        v-show="activeTab?.kind === 'git'"
        :cwd="workspaceRoot"
        :conversation-id="conversationId"
        :active="panelActive && activeTab?.kind === 'git'"
        @open-file="emit('open-file', $event)"
        @open-web="emit('open-web', $event)"
      />

      <!-- Persistent side-terminal host while any terminal tab exists -->
      <HomeSideTerminalPane
        v-if="hasAnyTerminalTab"
        v-show="activeTab?.kind === 'terminal'"
        :cwd="workspaceRoot"
        :active="panelActive && activeTab?.kind === 'terminal'"
      />

      <!-- Persistent side-browser host while any web tab exists -->
      <HomeSideBrowserPane
        v-if="hasAnyWebTab"
        v-show="activeTab?.kind === 'web'"
        :url="activeWebTab?.url ?? ''"
        :active="panelActive && activeTab?.kind === 'web'"
        @meta-change="activeWebTab && emit('update-web-tab', activeWebTab.id, $event)"
        @open-in-browser="emit('open-web-in-browser', $event)"
        @open-external="emit('open-web-external', $event)"
      />
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.HomeSidePanel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--shell-border);
  background: var(--shell-bg);
  box-sizing: border-box;
}

.HomeSidePanel-Header {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
  height: var(--shell-top-strip-height, 44px);
  padding: 0 10px;
  background: var(--shell-surface, var(--tx-fill-color-lighter));
  border-bottom: 1px solid
    color-mix(in srgb, var(--shell-border, var(--tx-border-color-lighter)) 75%, transparent);
  box-sizing: border-box;
  -webkit-app-region: drag;
  user-select: none;
}

.HomeSidePanel-TabStrip {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  min-width: 0;
  height: 100%;
  padding: 4px 2px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  -webkit-app-region: no-drag;

  &::-webkit-scrollbar {
    display: none;
  }

  &.can-scroll-left {
    mask-image: linear-gradient(to right, transparent 0, #000 18px, #000 100%);
  }

  &.can-scroll-right {
    mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 18px), transparent 100%);
  }

  &.can-scroll-left.can-scroll-right {
    mask-image: linear-gradient(
      to right,
      transparent 0,
      #000 18px,
      #000 calc(100% - 18px),
      transparent 100%
    );
  }
}

.HomeSidePanel-TabTrack {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.HomeSidePanel-DragSpacer {
  flex: 1 1 12px;
  min-width: 8px;
  height: 100%;
  -webkit-app-region: drag;
}

.HomeSidePanel-Tab {
  display: inline-flex;
  flex: none;
  align-items: center;
  min-width: 88px;
  max-width: 176px;
  height: 32px;
  padding-right: 6px;
  border-radius: 999px;
  color: var(--shell-text-secondary);
  background: color-mix(in srgb, var(--tx-fill-color) 42%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shell-border) 70%, transparent);

  @supports (corner-shape: superellipse(2)) {
    border-radius: calc(12px * var(--tx-corner-smooth-scale, 1.6)) / 50%;
    corner-shape: var(--tx-corner-smooth-shape, superellipse(1.777));
  }

  &:not(.is-active):hover {
    background: color-mix(in srgb, var(--tx-fill-color) 85%, transparent);
    box-shadow: inset 0 0 0 1px var(--shell-border-strong, var(--shell-border));
    color: var(--shell-text-primary);
  }

  &.is-active {
    background: color-mix(in srgb, var(--tx-surface-raised, var(--shell-bg)) 58%, var(--shell-bg));
    box-shadow:
      inset 0 0 0 1px
        color-mix(in srgb, var(--shell-border-strong, var(--shell-border)) 70%, transparent),
      var(--tx-elevation-1);
    color: var(--shell-text-primary);
  }
}

.HomeSidePanel-TabBtn {
  display: inline-flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  height: 100%;
  padding: 0 4px 0 11px;
  border: none;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--shell-fs-body, 13px);
  line-height: 1.25;
  cursor: pointer;

  .HomeSidePanel-Tab.is-active & {
    font-weight: 500;
  }
}

.HomeSidePanel-TabIcon {
  flex: none;
  font-size: 14px;
  opacity: 0.82;

  .HomeSidePanel-Tab.is-active & {
    opacity: 1;
  }
}

.HomeSidePanel-TabTitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSidePanel-TabClose {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 13px;
  cursor: pointer;
  opacity: 0.65;

  .HomeSidePanel-Tab:hover &,
  .HomeSidePanel-Tab:focus-within &,
  .HomeSidePanel-Tab.is-active & {
    opacity: 1;
  }

  &:hover {
    background: color-mix(in srgb, var(--shell-text-primary) 10%, transparent);
    color: var(--shell-text-primary);
  }
}

.HomeSidePanel-Brand {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  min-width: 0;
  padding-left: 4px;
}

.HomeSidePanel-BrandLabel {
  overflow: hidden;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.HomeSidePanel-Controls {
  display: flex;
  flex: none;
  gap: 2px;
  align-items: center;
  -webkit-app-region: no-drag;
}

.HomeSidePanel-IconBtn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 16px;
  cursor: pointer;

  &:hover,
  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}

.HomeSidePanel-Stage {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.HomeSidePanel-ScrollPane {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 12px 20px;
  overscroll-behavior: contain;
  box-sizing: border-box;
}

.HomeSidePanel-CodeWrap {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  padding: 8px;
  box-sizing: border-box;
}

.HomeSidePanel-CodeFrame {
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  background: var(--tx-color-white, #fff);
}

.HomeSidePanel-Outputs {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Teleported popover menu */
.HomeSidePanel-Menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.HomeSidePanel-MenuItem {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
  }
}

.HomeSidePanel-MenuLabel {
  flex: 1 1 auto;
  min-width: 0;
}

.HomeSidePanel-MenuDivider {
  height: 1px;
  margin: 4px 6px;
  background: var(--shell-border);
}

.HomeSidePanel-Count {
  margin-left: 4px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
}

/* Shared vocabulary for embedded preview subcomponents */
:deep(.HomePreview-Empty) {
  margin: 0;
  padding: 4px 8px;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  line-height: 1.6;
}

:deep(.HomePreview-GroupLabel) {
  margin: 0 0 2px;
  padding: 0 8px;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

:deep(.HomePreview-Name) {
  overflow: hidden;
  color: var(--shell-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--shell-fs-sm);
}

:deep(.HomePreview-Detail) {
  overflow: hidden;
  color: var(--shell-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--shell-fs-caption);
}

:deep(.HomePreview-IconBtn) {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }
}
</style>
