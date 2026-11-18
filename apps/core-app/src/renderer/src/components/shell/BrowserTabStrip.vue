<script setup lang="ts">
import type {
  BrowserTabState,
  BrowserWorkspaceState
} from '@talex-touch/utils/transport/sdk/domains/browser'
import { createBrowserSdk } from '@talex-touch/utils/transport/sdk/domains/browser'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { TxButton, TxIconButton } from '@talex-touch/tuffex/button'
import {
  TxContextMenu,
  TxContextMenuDivider,
  TxContextMenuItem
} from '@talex-touch/tuffex/context-menu'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { APP_SURFACE_ROUTES } from '../../../../shared/app-surface-routes'
import { useBrowserWorkspace } from '~/modules/browser-workspace/useBrowserWorkspace'
import { tabIcon } from '~/modules/browser-workspace/tab-presentation'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import BrowserPluginToolbar from '~/views/base/browser/BrowserPluginToolbar.vue'
import type { BrowserTabMenuAction } from '~/views/base/browser/tab-actions'
import { describeBrowserError } from '~/views/base/browser/browser-errors'
import { runBrowserTabAction } from '~/views/base/browser/tab-actions'
import ShellAccountAvatar from './ShellAccountAvatar.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { isMac, platform } = useRendererPlatform()
const sdk = createBrowserSdk(useTuffTransport())
const {
  state,
  connecting,
  error,
  command,
  retryWorkspace,
  tabMenuOpen,
  pluginToolbarOpen,
  accountOpen
} = useBrowserWorkspace()
const tabMenu = ref<InstanceType<typeof TxContextMenu> | null>(null)
const tabMenuTargetId = ref('')
const draggedTabId = ref<string | null>(null)
const tabDropTarget = ref<{ id: string | null; before: boolean } | null>(null)
const tabMovePending = ref(false)
const onBrowserRoute = computed(() => route.path === APP_SURFACE_ROUTES.browser)
const activeTabId = computed(() => state.value?.activeTabId)
const tabMenuOpenModel = computed({
  get: () => tabMenuOpen.value,
  set: (open: boolean) => {
    tabMenuOpen.value = open
  }
})
const tabMenuIndex = computed(
  () => state.value?.tabs.findIndex((tab) => tab.id === tabMenuTargetId.value) ?? -1
)
const tabMenuTarget = computed(() => state.value?.tabs[tabMenuIndex.value])

// Activating or creating a tab lands on the Browser page; close and reorder stay in place.
async function runInBrowser(action: () => Promise<BrowserWorkspaceState>): Promise<boolean> {
  if (!onBrowserRoute.value) await router.push(APP_SURFACE_ROUTES.browser)
  return command(action)
}

function activateOrOpenTab(tab: BrowserTabState): void {
  if (onBrowserRoute.value && tab.id === activeTabId.value && !tab.error) return
  void runInBrowser(() => sdk.activateTab(tab.id))
}

function onTablistWheel(event: WheelEvent): void {
  const list = event.currentTarget
  if (!(list instanceof HTMLElement)) return
  if (list.scrollWidth <= list.clientWidth) return
  const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  if (delta !== 0) {
    event.preventDefault()
    list.scrollLeft += delta
  }
}

function tabTitle(tab: BrowserTabState): string {
  if (!tab.url) return t('browser.newTab')
  if (tab.url.startsWith('tuff://store')) return t('shell.store')
  if (tab.url.startsWith('tuff://setting')) return t('shell.setting')
  return tab.title || tab.url
}

function onPluginToolbarOverlay(open: boolean): void {
  pluginToolbarOpen.value = open
}

function onAccountOverlay(open: boolean): void {
  accountOpen.value = open
}

function openTabMenu(tabId: string, event: MouseEvent | KeyboardEvent): void {
  event.preventDefault()
  tabMenuTargetId.value = tabId
  if (event instanceof KeyboardEvent) {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
    tabMenu.value?.openAt({ x: bounds.left, y: bounds.bottom })
  } else {
    tabMenu.value?.openAt(event)
  }
}

function selectTabMenuAction(action: BrowserTabMenuAction): void {
  if (!tabMenuOpen.value) return
  const tabId = tabMenuTargetId.value
  tabMenuOpen.value = false
  const run = () => runBrowserTabAction(sdk, action, tabId)
  void (action === 'duplicate' ? runInBrowser(run) : command(run))
}

function resetTabDrag(): void {
  draggedTabId.value = null
  tabDropTarget.value = null
}

async function moveTab(tabId: string, beforeTabId: string | null): Promise<void> {
  if (tabMovePending.value) return
  tabMovePending.value = true
  try {
    if (await command(() => sdk.moveTab(tabId, beforeTabId))) {
      await nextTick()
      if (onBrowserRoute.value) {
        const element = document.getElementById(`browser-tab-${tabId}`)
        element?.focus({ preventScroll: true })
        element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    }
  } finally {
    tabMovePending.value = false
  }
}

function startTabDrag(tabId: string, event: DragEvent): void {
  if (tabMovePending.value || tabMenuOpen.value || pluginToolbarOpen.value || !event.dataTransfer) {
    event.preventDefault()
    return
  }
  draggedTabId.value = tabId
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-tuff-browser-tab', tabId)
}

function showTabDropTarget(event: DragEvent, tabId: string | null): void {
  if (!draggedTabId.value || tabMovePending.value) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const before = tabId === null || event.clientX < bounds.left + bounds.width / 2
  if (tabDropTarget.value?.id !== tabId || tabDropTarget.value.before !== before) {
    tabDropTarget.value = { id: tabId, before }
  }
}

function dropTab(event: DragEvent, targetId: string | null): void {
  event.preventDefault()
  event.stopPropagation()
  const tabId = draggedTabId.value
  if (!tabId || tabMovePending.value) return
  const tabs = state.value?.tabs ?? []
  let beforeTabId = targetId
  if (targetId !== null) {
    const index = tabs.findIndex((tab) => tab.id === targetId)
    if (index < 0) {
      resetTabDrag()
      return
    }
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
    if (event.clientX >= bounds.left + bounds.width / 2) beforeTabId = tabs[index + 1]?.id ?? null
  }
  resetTabDrag()
  void moveTab(tabId, beforeTabId)
}

function tabKeydown(event: KeyboardEvent, index: number): void {
  const tabs = state.value?.tabs ?? []
  if (!tabs.length) return
  if (event.altKey && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault()
    event.stopPropagation()
    const tab = tabs[index]
    if (!tab || tabMovePending.value) return
    if (event.key === 'ArrowLeft' && index > 0) void moveTab(tab.id, tabs[index - 1]!.id)
    else if (event.key === 'ArrowRight' && index < tabs.length - 1) {
      void moveTab(tab.id, tabs[index + 2]?.id ?? null)
    }
    return
  }
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    const tab = tabs[index]
    if (tab) openTabMenu(tab.id, event)
    return
  }
  let target: number
  if (event.key === 'ArrowRight') target = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length
  else if (event.key === 'Home') target = 0
  else if (event.key === 'End') target = tabs.length - 1
  else return
  event.preventDefault()
  const tab = tabs[target]
  if (!tab) return
  void runInBrowser(() => sdk.activateTab(tab.id)).then(() => {
    document.getElementById(`browser-tab-${tab.id}`)?.focus()
  })
}

watch(
  () => state.value?.tabs,
  (tabs) => {
    const ids = new Set((tabs ?? []).map((tab) => tab.id))
    if (tabMenuOpen.value && tabMenuTargetId.value && !ids.has(tabMenuTargetId.value)) {
      tabMenuOpen.value = false
    }
    if (draggedTabId.value && !ids.has(draggedTabId.value)) {
      resetTabDrag()
    }
  }
)
watch(activeTabId, (id, previousId) => {
  if (id === previousId) return
  void nextTick(() => {
    document
      .getElementById(`browser-tab-${id}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
})
watch(tabMenuOpen, (open) => {
  if (open) return
  void nextTick(() => {
    if (!onBrowserRoute.value) return
    const tabId = tabMenuTarget.value?.id ?? activeTabId.value
    document.getElementById(`browser-tab-${tabId}`)?.focus()
  })
})
onBeforeUnmount(() => {
  resetTabDrag()
})
</script>

<template>
  <div
    class="BrowserTabStrip flex h-11 flex-none items-center gap-1 px-2 pt-1"
    :class="{ 'is-window-controls': !isMac }"
    :data-platform="platform"
    data-browser-tabbar
    @dragover.self="showTabDropTarget($event, null)"
    @drop.self="dropTab($event, null)"
  >
    <div
      class="BrowserTabStrip-TabList BrowserTabStrip-NoDrag flex min-w-0 shrink items-center gap-1 overflow-x-auto"
      role="tablist"
      :aria-label="t('browser.tabs')"
      @wheel="onTablistWheel"
      @dragover.self="showTabDropTarget($event, null)"
      @drop.self="dropTab($event, null)"
    >
      <div
        v-for="(tab, index) in state?.tabs ?? []"
        :key="tab.id"
        class="BrowserTabStrip-Tab BrowserTabStrip-NoDrag relative flex min-w-32 max-w-56 items-center gap-0.5 rounded-t-lg pr-1.5"
        :class="{
          'opacity-50': draggedTabId === tab.id,
          'is-active': tab.id === state?.activeTabId
        }"
        @contextmenu="openTabMenu(tab.id, $event)"
        @auxclick.middle.prevent="command(() => sdk.closeTab(tab.id))"
        @dragover="showTabDropTarget($event, tab.id)"
        @drop="dropTab($event, tab.id)"
      >
        <button
          :id="`browser-tab-${tab.id}`"
          type="button"
          role="tab"
          :aria-selected="tab.id === state?.activeTabId"
          :tabindex="tab.id === state?.activeTabId ? 0 : -1"
          aria-controls="browser-viewport"
          aria-haspopup="menu"
          :aria-description="t('browser.reorderTabsHint')"
          :aria-expanded="tabMenuOpen && tabMenuTargetId === tab.id"
          class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-t-lg pl-3 pr-1 text-sm outline-offset-[-3px]"
          :title="tabTitle(tab)"
          :draggable="!tabMovePending"
          @dragstart="startTabDrag(tab.id, $event)"
          @dragend="resetTabDrag"
          @click="activateOrOpenTab(tab)"
          @keydown="tabKeydown($event, index)"
        >
          <span class="inline-flex h-4 w-4 flex-none" :class="tabIcon(tab)" aria-hidden="true" />
          <span class="truncate">{{ tabTitle(tab) }}</span>
        </button>
        <TxIconButton
          icon="i-ri-close-line"
          size="xs"
          :label="t('browser.closeTab', { title: tabTitle(tab) })"
          @click="command(() => sdk.closeTab(tab.id))"
        />
        <span
          v-if="draggedTabId && tabDropTarget?.id === tab.id"
          aria-hidden="true"
          class="pointer-events-none absolute inset-y-1 w-0.5 bg-[var(--tx-color-primary)]"
          :class="tabDropTarget.before ? 'left-0' : 'right-0'"
        />
      </div>
    </div>
    <div
      class="BrowserTabStrip-NoDrag relative flex flex-none items-center gap-1"
      @dragover="showTabDropTarget($event, null)"
      @drop="dropTab($event, null)"
    >
      <span
        v-if="draggedTabId && tabDropTarget?.id === null"
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-1 left-0 w-0.5 bg-[var(--tx-color-primary)]"
      />
      <TxSkeleton v-if="connecting && !state" :width="150" :height="30" :radius="8" />
      <TxIconButton
        icon="i-ri-add-line"
        size="sm"
        :label="t('browser.addTab')"
        :disabled="!state"
        class="flex-none"
        @click="runInBrowser(() => sdk.createTab())"
      />
    </div>
    <div
      data-browser-window-drag
      aria-hidden="true"
      :title="t('browser.dragWindow')"
      class="BrowserTabStrip-DragRegion relative h-full min-w-12 flex-1 self-stretch"
      @dragover="showTabDropTarget($event, null)"
      @drop="dropTab($event, null)"
    />
    <div
      class="BrowserTabStrip-Actions shell-chrome-safe-inline-end flex flex-none items-center gap-0.5"
      :class="{ 'BrowserTabStrip-NoDrag': onBrowserRoute }"
    >
      <template v-if="onBrowserRoute">
        <BrowserPluginToolbar active @overlay-change="onPluginToolbarOverlay" />
        <ShellAccountAvatar @overlay-change="onAccountOverlay" />
      </template>
    </div>
  </div>
  <div
    v-if="error && !onBrowserRoute"
    role="alert"
    class="BrowserTabStrip-NoDrag flex flex-none items-center gap-3 bg-[var(--tx-color-danger-light-9)] px-2 py-1.5 text-sm"
  >
    <span class="min-w-0 flex-1 break-words">{{
      t('browser.actionFailedWithReason', { reason: describeBrowserError(error, t) })
    }}</span>
    <TxButton size="sm" variant="ghost" @click="retryWorkspace">{{ t('browser.retry') }}</TxButton>
  </div>
  <TxContextMenu
    ref="tabMenu"
    v-model="tabMenuOpenModel"
    trigger="manual"
    :activation-feedback="false"
  >
    <template #menu>
      <TxContextMenuItem :disabled="!tabMenuTarget?.url" @select="selectTabMenuAction('reload')">
        {{ t('browser.tabMenu.reload') }}
      </TxContextMenuItem>
      <TxContextMenuItem :disabled="!tabMenuTarget" @select="selectTabMenuAction('duplicate')">
        {{ t('browser.tabMenu.duplicate') }}
      </TxContextMenuItem>
      <TxContextMenuDivider />
      <TxContextMenuItem :disabled="!tabMenuTarget" @select="selectTabMenuAction('close')">
        {{ t('browser.tabMenu.close') }}
      </TxContextMenuItem>
      <TxContextMenuItem
        :disabled="!tabMenuTarget || (state?.tabs.length ?? 0) < 2"
        @select="selectTabMenuAction('close-others')"
      >
        {{ t('browser.tabMenu.closeOthers') }}
      </TxContextMenuItem>
      <TxContextMenuItem :disabled="tabMenuIndex <= 0" @select="selectTabMenuAction('close-left')">
        {{ t('browser.tabMenu.closeLeft') }}
      </TxContextMenuItem>
      <TxContextMenuItem
        :disabled="!tabMenuTarget || tabMenuIndex >= (state?.tabs.length ?? 0) - 1"
        @select="selectTabMenuAction('close-right')"
      >
        {{ t('browser.tabMenu.closeRight') }}
      </TxContextMenuItem>
    </template>
  </TxContextMenu>
</template>

<style lang="scss" scoped>
.BrowserTabStrip {
  background: var(--tx-fill-color-light);
  -webkit-app-region: drag;
  user-select: none;
}

.BrowserTabStrip-DragRegion {
  -webkit-app-region: drag;
}

.BrowserTabStrip-NoDrag {
  -webkit-app-region: no-drag;

  :deep(*) {
    -webkit-app-region: no-drag;
  }
}

.BrowserTabStrip-TabList {
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.BrowserTabStrip-Tab {
  &:not(.is-active):hover {
    background: var(--tx-fill-color);
  }

  &.is-active {
    background: var(--tx-bg-color);
  }
}
</style>
