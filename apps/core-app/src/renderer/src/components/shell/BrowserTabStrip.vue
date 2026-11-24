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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { APP_SURFACE_ROUTES } from '../../../../shared/app-surface-routes'
import { basenameOfPath, parseBrowserFilePreviewUrl } from '~/modules/browser-workspace/preview-url'
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
const tablistRef = ref<HTMLElement | null>(null)
const tabElements = new Map<string, HTMLElement>()
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const activePill = ref({ left: 0, top: 0, width: 0, height: 0, visible: false })
const activePillAnimated = ref(false)
let tablistResizeObserver: ResizeObserver | null = null
let activePillRaf = 0
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

function syncScrollEdges(): void {
  const list = tablistRef.value
  if (!list || list.scrollWidth <= list.clientWidth + 1) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }
  canScrollLeft.value = list.scrollLeft > 2
  canScrollRight.value = list.scrollLeft + list.clientWidth < list.scrollWidth - 2
}

function onTablistWheel(event: WheelEvent): void {
  const list = event.currentTarget
  if (!(list instanceof HTMLElement)) return
  if (list.scrollWidth <= list.clientWidth) return
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && event.deltaY !== 0) {
    event.preventDefault()
    list.scrollLeft += event.deltaY
    syncScrollEdges()
  }
}

function tabTitle(tab: BrowserTabState): string {
  if (!tab.url) return t('browser.newTab')
  if (tab.url.startsWith('tuff://store')) return t('shell.store')
  if (tab.url.startsWith('tuff://setting')) return t('shell.setting')
  const preview = parseBrowserFilePreviewUrl(tab.url)
  if (preview) return basenameOfPath(preview.path)
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

function setTabEl(tabId: string, el: unknown): void {
  if (el instanceof HTMLElement) {
    tabElements.set(tabId, el)
  } else {
    tabElements.delete(tabId)
  }
}

function syncActivePill(animate = true): void {
  const id = activeTabId.value
  const activeEl = id ? tabElements.get(id) : undefined
  if (!activeEl) {
    activePill.value.visible = false
    return
  }
  const width = activeEl.offsetWidth
  const height = activeEl.offsetHeight
  if (width <= 0 || height <= 0) {
    activePill.value.visible = false
    return
  }
  const wasVisible = activePill.value.visible
  activePillAnimated.value = animate && wasVisible
  activePill.value = {
    left: activeEl.offsetLeft,
    top: activeEl.offsetTop,
    width,
    height,
    visible: true
  }
  if (!activePillAnimated.value && typeof requestAnimationFrame !== 'undefined') {
    cancelAnimationFrame(activePillRaf)
    activePillRaf = requestAnimationFrame(() => {
      activePillAnimated.value = true
    })
  }
}

const activePillStyle = computed(() => ({
  width: `${activePill.value.width}px`,
  height: `${activePill.value.height}px`,
  transform: `translate3d(${activePill.value.left}px, ${activePill.value.top}px, 0)`
}))

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
    void nextTick(() => {
      syncActivePill(true)
      syncScrollEdges()
    })
  }
)
watch(activeTabId, (id, previousId) => {
  if (id === previousId) return
  void nextTick(() => {
    syncActivePill(Boolean(previousId))
    document
      .getElementById(`browser-tab-${id}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    syncScrollEdges()
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
onMounted(() => {
  void nextTick(() => {
    syncActivePill(false)
    syncScrollEdges()
  })
  if (typeof ResizeObserver !== 'undefined' && tablistRef.value) {
    tablistResizeObserver = new ResizeObserver(() => {
      syncActivePill(false)
      syncScrollEdges()
    })
    tablistResizeObserver.observe(tablistRef.value)
  }
})
onBeforeUnmount(() => {
  cancelAnimationFrame(activePillRaf)
  tablistResizeObserver?.disconnect()
  tablistResizeObserver = null
  tabElements.clear()
  resetTabDrag()
})
</script>

<template>
  <div
    class="BrowserTabStrip flex h-11 min-w-0 flex-none items-center gap-1.5 overflow-hidden px-2.5"
    :class="{ 'is-window-controls': !isMac }"
    :data-platform="platform"
    data-browser-tabbar
    @dragover.self="showTabDropTarget($event, null)"
    @drop.self="dropTab($event, null)"
  >
    <div
      ref="tablistRef"
      class="BrowserTabStrip-TabList BrowserTabStrip-NoDrag relative flex min-w-0 shrink items-center overflow-x-auto"
      :class="{
        'has-active-pill': activePill.visible,
        'can-scroll-left': canScrollLeft,
        'can-scroll-right': canScrollRight
      }"
      role="tablist"
      :aria-label="t('browser.tabs')"
      @scroll.passive="syncScrollEdges"
      @wheel="onTablistWheel"
      @dragover.self="showTabDropTarget($event, null)"
      @drop.self="dropTab($event, null)"
    >
      <span
        v-if="activePill.visible"
        aria-hidden="true"
        class="BrowserTabStrip-ActivePill"
        :class="{ 'is-animated': activePillAnimated }"
        :style="activePillStyle"
      />
      <TransitionGroup
        name="browser-tab"
        tag="div"
        class="BrowserTabStrip-TabTrack flex flex-none items-center gap-1.5"
        @after-enter="syncActivePill(false)"
        @after-leave="syncActivePill(true)"
      >
        <div
          v-for="(tab, index) in state?.tabs ?? []"
          :key="tab.id"
          :ref="(el) => setTabEl(tab.id, el)"
          class="BrowserTabStrip-Tab BrowserTabStrip-NoDrag relative flex h-8 min-w-28 max-w-52 flex-none items-center gap-1 pr-1.5"
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
            class="BrowserTabStrip-TabButton flex h-full min-w-0 flex-1 items-center gap-2 pl-3 pr-1 outline-none"
            :title="tabTitle(tab)"
            :draggable="!tabMovePending"
            @dragstart="startTabDrag(tab.id, $event)"
            @dragend="resetTabDrag"
            @click="activateOrOpenTab(tab)"
            @keydown="tabKeydown($event, index)"
          >
            <span
              class="BrowserTabStrip-TabIcon inline-flex h-4 w-4 flex-none items-center justify-center"
              :class="tabIcon(tab)"
              aria-hidden="true"
            />
            <span class="BrowserTabStrip-TabTitle truncate">{{ tabTitle(tab) }}</span>
          </button>
          <TxIconButton
            icon="i-ri-close-line"
            size="xs"
            shape="circle"
            class="BrowserTabStrip-CloseBtn flex-none"
            :label="t('browser.closeTab', { title: tabTitle(tab) })"
            @click="command(() => sdk.closeTab(tab.id))"
          />
          <span
            v-if="draggedTabId && tabDropTarget?.id === tab.id"
            aria-hidden="true"
            class="pointer-events-none absolute inset-y-1.5 w-0.5 rounded-full bg-[var(--tx-color-primary)]"
            :class="tabDropTarget.before ? 'left-0' : 'right-0'"
          />
        </div>
      </TransitionGroup>
    </div>
    <div
      class="BrowserTabStrip-NoDrag relative flex flex-none items-center gap-1.5"
      @dragover="showTabDropTarget($event, null)"
      @drop="dropTab($event, null)"
    >
      <span
        v-if="draggedTabId && tabDropTarget?.id === null"
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-[var(--tx-color-primary)]"
      />
      <TxSkeleton v-if="connecting && !state" :width="132" :height="32" :radius="16" />
      <TxIconButton
        icon="i-ri-add-line"
        size="sm"
        shape="circle"
        :label="t('browser.addTab')"
        :disabled="!state"
        class="BrowserTabStrip-AddBtn flex-none"
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
@mixin tab-capsule-g2 {
  border-radius: 999px;

  @supports (corner-shape: superellipse(2)) {
    border-radius: calc(12px * var(--tx-corner-smooth-scale, 1.6)) / 50%;
    corner-shape: var(--tx-corner-smooth-shape, superellipse(1.777));
  }
}

@mixin pill-control-g2 {
  border-radius: 999px;

  @supports (corner-shape: superellipse(2)) {
    corner-shape: var(--tx-corner-smooth-shape, superellipse(1.777));
  }
}

.BrowserTabStrip {
  background: var(--shell-surface, var(--tx-fill-color-lighter));
  border-bottom: 1px solid
    color-mix(in srgb, var(--shell-border, var(--tx-border-color-lighter)) 75%, transparent);
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
  padding: 4px 2px;
  overscroll-behavior-x: contain;
  scrollbar-width: none;

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

.BrowserTabStrip-ActivePill {
  @include tab-capsule-g2;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  pointer-events: none;
  background: color-mix(
    in srgb,
    var(--tx-surface-raised, var(--tx-bg-color)) 58%,
    var(--tx-bg-color)
  );
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color) 65%, transparent),
    var(--tx-elevation-1);
  will-change: transform, width;

  &.is-animated {
    transition:
      transform 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      width 240ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }

  @media (prefers-reduced-motion: reduce) {
    &.is-animated {
      transition: none;
    }
  }
}

.BrowserTabStrip-Tab {
  @include tab-capsule-g2;
  z-index: 1;
  color: var(--tx-text-color-regular);
  background: color-mix(in srgb, var(--tx-fill-color) 42%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-lighter) 70%, transparent);

  &:not(.is-active):hover {
    color: var(--tx-text-color-primary);
    background: color-mix(in srgb, var(--tx-fill-color) 85%, transparent);
    box-shadow: inset 0 0 0 1px var(--tx-border-color-light);
  }

  &.is-active {
    color: var(--tx-text-color-primary);
    background: color-mix(
      in srgb,
      var(--tx-surface-raised, var(--tx-bg-color)) 58%,
      var(--tx-bg-color)
    );
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color) 65%, transparent),
      var(--tx-elevation-1);

    .BrowserTabStrip-TabList.has-active-pill &:not(:has(.BrowserTabStrip-TabButton:focus-visible)) {
      background: transparent;
      box-shadow: none;
    }
  }

  &:has(.BrowserTabStrip-TabButton:focus-visible) {
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}

.browser-tab-enter-active,
.browser-tab-leave-active {
  transition:
    opacity 160ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 180ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.browser-tab-enter-from {
  opacity: 0;
  transform: scale(0.92);
}

.browser-tab-leave-to {
  opacity: 0;
  transform: scale(0.92);
}

.browser-tab-move {
  transition: transform 200ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

@media (prefers-reduced-motion: reduce) {
  .browser-tab-enter-active,
  .browser-tab-leave-active,
  .browser-tab-move {
    transition: none;
  }
}

.BrowserTabStrip-TabButton {
  border-radius: inherit;
  corner-shape: inherit;
  color: inherit;
  font-size: var(--shell-fs-body, 13px);
  line-height: 1.25;
  cursor: pointer;

  .BrowserTabStrip-Tab.is-active & {
    font-weight: 500;
  }
}

.BrowserTabStrip-TabIcon {
  font-size: 15px;
  opacity: 0.82;

  .BrowserTabStrip-Tab.is-active & {
    opacity: 1;
  }
}

.BrowserTabStrip-CloseBtn {
  @include pill-control-g2;
  --tx-icon-button-size: 20px;
  --tx-icon-button-radius: 999px;
  --tx-icon-button-color: var(--tx-text-color-secondary);
  --tx-icon-button-bg: transparent;
  --tx-icon-button-bg-hover: color-mix(in srgb, var(--tx-text-color-primary) 10%, transparent);
  opacity: 0.65;
  transition:
    opacity 120ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  :deep(.tx-icon-button__icon) {
    font-size: 0.875rem;
  }

  .BrowserTabStrip-Tab:hover &,
  .BrowserTabStrip-Tab:focus-within &,
  .BrowserTabStrip-Tab.is-active & {
    opacity: 1;
  }

  &:hover:not(.is-disabled) {
    --tx-icon-button-color: var(--tx-text-color-primary);
  }
}

.BrowserTabStrip-AddBtn {
  @include pill-control-g2;
  --tx-icon-button-size: 32px;
  --tx-icon-button-radius: 999px;
  --tx-icon-button-color: var(--tx-text-color-regular);
  --tx-icon-button-bg: color-mix(in srgb, var(--tx-fill-color) 42%, transparent);
  --tx-icon-button-bg-hover: color-mix(in srgb, var(--tx-fill-color) 85%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-lighter) 70%, transparent);

  :deep(.tx-icon-button__icon) {
    font-size: 1rem;
  }

  &:hover:not(.is-disabled) {
    --tx-icon-button-color: var(--tx-text-color-primary);
    box-shadow: inset 0 0 0 1px var(--tx-border-color-light);
  }

  &:focus-visible {
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}
</style>
