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
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxKbd } from '@talex-touch/tuffex/kbd'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { getActivePinia } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { APP_SURFACE_ROUTES, herdrConversationRoute } from '../../../../shared/app-surface-routes'
import { basenameOfPath, parseBrowserFilePreviewUrl } from '~/modules/browser-workspace/preview-url'
import { useBrowserWorkspace } from '~/modules/browser-workspace/useBrowserWorkspace'
import { tabIcon } from '~/modules/browser-workspace/tab-presentation'
import { useConversationHistory } from '~/modules/conversation/useConversationHistory'
import {
  buildHerdrProjectTabTitles,
  buildNewTerminalRequestForGroup,
  groupHerdrSessions,
  type HerdrProjectGroup
} from '~/modules/herdr/herdr-project-groups'
import { type HerdrProjectedSession, useHerdrRuntime } from '~/modules/herdr/useHerdrRuntime'
import { type HerdrStageViewMode, useHerdrStageControl } from '~/modules/herdr/useHerdrStageControl'
import { useShellStageActions } from '~/modules/layout/useShellStageActions'
import { useShellTerminal } from '~/modules/layout/useShellTerminal'
import {
  attachBrowserTabToSpace,
  BROWSER_SCOPE_KEY,
  closeSpaceTabsBulk,
  conversationTabId,
  draftTabId,
  ensureConversationTab,
  ensureDraftTab,
  ensureHerdrTab,
  getSpaceTabs,
  HERDR_SPACE_KEY,
  herdrGroupKeyFromSpaceKey,
  herdrProjectSpaceKey,
  herdrTabId,
  isDeprecatedInternalBrowserUrl,
  isHerdrSpaceKey,
  isSpaceScopeKey,
  projectIdFromSpaceKey,
  projectSpaceKey,
  removeSpaceTab,
  reorderSpaceTab,
  resolveBrowserTabSpaceKey,
  setLastHerdrAddressForGroup,
  setLastWorkspaceScope,
  spaceBrowserTabId,
  syncBrowserTabsWithSpaces,
  syncHerdrProjectTabs,
  useShellWorkspaceTabs,
  type SpaceWorkspaceTab
} from '~/modules/layout/useShellWorkspaceTabs'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { useProjectStore } from '~/stores/projects'
import BrowserPluginToolbar from '~/views/base/browser/BrowserPluginToolbar.vue'
import type { BrowserTabMenuAction } from '~/views/base/browser/tab-actions'
import { describeBrowserError } from '~/views/base/browser/browser-errors'
import { runBrowserTabAction } from '~/views/base/browser/tab-actions'
import HomeTurnInfoMenu from '~/views/base/home/HomeTurnInfoMenu.vue'
import MetaHintBadge from './MetaHintBadge.vue'
import { SHELL_MENU_CARD } from './shell-menu-panel'
import ShellAccountAvatar from './ShellAccountAvatar.vue'

interface StripTab {
  id: string
  kind: 'browser' | 'conversation' | 'draft' | 'herdr'
  title: string
  icon: string
  browserTab?: BrowserTabState
  conversationId?: string
  herdrAddress?: string
  spaceKey?: string
}

const HERDR_TAB_ICON_MAP: Record<string, string> = {
  claude: 'i-simple-icons-claude',
  codex: 'i-simple-icons-openai',
  pi: 'i-simple-icons-pi',
  omp: 'i-simple-icons-pi',
  'oh-my-pi': 'i-simple-icons-pi',
  gemini: 'i-simple-icons-googlegemini',
  opencode: 'i-simple-icons-opencode',
  cursor: 'i-simple-icons-cursor',
  ssh: 'i-ri-server-line'
}

function resolveHerdrTabIcon(session?: HerdrProjectedSession | null): string {
  if (!session) return 'i-ri-terminal-box-line'
  const candidates = [session.appName, session.status?.app, session.foregroundName, session.argv[0]]
  for (const raw of candidates) {
    if (!raw) continue
    const token = raw.trim().toLowerCase().split('/').pop() ?? ''
    if (Object.hasOwn(HERDR_TAB_ICON_MAP, token)) {
      return HERDR_TAB_ICON_MAP[token]!
    }
    for (const [key, icon] of Object.entries(HERDR_TAB_ICON_MAP)) {
      if (token.includes(key)) return icon
    }
  }
  if (session.machine !== null) return 'i-ri-server-line'
  return 'i-ri-terminal-box-line'
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { isMac, platform } = useRendererPlatform()
const sdk = createBrowserSdk(useTuffTransport())
const history = useConversationHistory()
const herdr = useHerdrRuntime({ subscribe: false })
const herdrStageControl = useHerdrStageControl()
const shellStageActions = useShellStageActions()
const { toggleTerminal } = useShellTerminal()
const projectStore = getActivePinia() ? useProjectStore() : null
const workspaceTabs = useShellWorkspaceTabs()
const creatingHerdrSession = ref(false)
const {
  state,
  connecting,
  error,
  command,
  retryWorkspace,
  tabMenuOpen,
  addTabMenuOpen,
  pluginToolbarOpen,
  accountOpen
} = useBrowserWorkspace()
const tabMenu = ref<InstanceType<typeof TxContextMenu> | null>(null)
const tablistRef = ref<HTMLElement | null>(null)
const tabElements = new Map<string, HTMLElement>()
const closingDeprecatedIds = new Set<string>()
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const activePill = ref({ left: 0, top: 0, width: 0, height: 0, visible: false })
const activePillAnimated = ref(false)
let tablistResizeObserver: ResizeObserver | null = null
let activePillRaf = 0
let lastObservedRoutePath = ''
let userSelectionSeq = 0
const tabMenuTargetId = ref('')
const draggedTabId = ref<string | null>(null)
const tabDropTarget = ref<{ id: string | null; before: boolean } | null>(null)
const tabMovePending = ref(false)

const onBrowserRoute = computed(() => route.path === APP_SURFACE_ROUTES.browser)
const onHomeConversationRoute = computed(() => route.path.startsWith('/home/c/'))
const onHerdrRoute = computed(() => route.path.startsWith('/home/herdr/'))
const onHomeBlankRoute = computed(() => route.path === APP_SURFACE_ROUTES.home)
const onHomeRoute = computed(() => onHomeBlankRoute.value || onHomeConversationRoute.value)
const onUnfocusedShellRoute = computed(
  () => route.path === '/store' || route.path.startsWith('/setting')
)

const activeStageActions = computed(() => {
  const handle = shellStageActions.activeHandle.value
  if (!handle) return null
  if (handle.surface === 'home' && onHomeRoute.value) return handle
  if (handle.surface === 'herdr' && onHerdrRoute.value) return handle
  return null
})
const hasTrailingActions = computed(() => onBrowserRoute.value || Boolean(activeStageActions.value))
const stagePanelOpen = computed(() => Boolean(activeStageActions.value?.isPanelOpen()))
const stageShowTurnInfo = computed(() => Boolean(activeStageActions.value?.showTurnInfo?.()))
const stageTurn = computed(() => activeStageActions.value?.getTurn?.())
const stageMessageCount = computed(() => activeStageActions.value?.getMessageCount?.() ?? 0)
const stageCanBranch = computed(() => Boolean(activeStageActions.value?.canBranch?.()))
const stageBranching = computed(() => Boolean(activeStageActions.value?.isBranching?.()))

const routeConversationId = computed<string | null>(() => {
  if (!onHomeConversationRoute.value) return null
  const params = route.params as Record<string, unknown> | undefined
  const paramId = typeof params?.id === 'string' ? params.id.trim() : ''
  if (paramId) return paramId
  const tail = route.path.slice('/home/c/'.length).split('/')[0]?.trim() ?? ''
  return tail || null
})

const routeHerdrAddress = computed<string | null>(() => {
  if (!onHerdrRoute.value) return null
  const params = route.params as Record<string, unknown> | undefined
  const paramAddress = typeof params?.address === 'string' ? params.address : ''
  const raw = paramAddress || route.path.slice('/home/herdr/'.length)
  if (!raw) return null
  try {
    return decodeURIComponent(raw).trim() || null
  } catch {
    return raw.trim() || null
  }
})

const herdrProjectGroups = computed<HerdrProjectGroup[]>(() => {
  if (herdr.projectGroups?.value) return herdr.projectGroups.value
  const live = herdr.liveSessions?.value ?? [...herdr.sessionByAddress.value.values()]
  return groupHerdrSessions(live.filter((session) => session.state === 'live'))
})

const herdrProjectGroupByKey = computed(() => {
  if (herdr.projectGroupByKey?.value) return herdr.projectGroupByKey.value
  const map = new Map<string, HerdrProjectGroup>()
  for (const group of herdrProjectGroups.value) map.set(group.key, group)
  return map
})

const herdrProjectGroupByAddress = computed(() => {
  if (herdr.projectGroupByAddress?.value) return herdr.projectGroupByAddress.value
  const map = new Map<string, HerdrProjectGroup>()
  for (const group of herdrProjectGroups.value) {
    for (const session of group.sessions) map.set(session.address, group)
  }
  return map
})

const activeRouteHerdrGroup = computed<HerdrProjectGroup | null>(() =>
  routeHerdrAddress.value
    ? (herdrProjectGroupByAddress.value.get(routeHerdrAddress.value) ?? null)
    : null
)

function resolveConversationRecord(conversationId: string) {
  return history.conversations.value.find((item) => item.id === conversationId) ?? null
}

function resolveConversationSpace(conversationId: string): string | null {
  if (conversationId.startsWith('herdr:')) {
    const addr = conversationId.slice('herdr:'.length)
    const group = herdrProjectGroupByAddress.value.get(addr)
    return group ? herdrProjectSpaceKey(group.key) : HERDR_SPACE_KEY
  }
  const record = resolveConversationRecord(conversationId)
  if (!record) return null
  return projectSpaceKey(record.projectId)
}

const activeBrowserTab = computed(() => {
  const current = state.value?.tabs.find((tab) => tab.id === state.value?.activeTabId) ?? null
  if (!current || isDeprecatedInternalBrowserUrl(current.url)) return null
  return current
})

const currentLiveScope = computed<string | null>(() => {
  if (onUnfocusedShellRoute.value) return null
  if (onHerdrRoute.value && routeHerdrAddress.value) {
    return activeRouteHerdrGroup.value
      ? herdrProjectSpaceKey(activeRouteHerdrGroup.value.key)
      : HERDR_SPACE_KEY
  }
  if (onHomeConversationRoute.value && routeConversationId.value) {
    return (
      resolveConversationSpace(routeConversationId.value) ??
      projectSpaceKey(projectStore?.activeProjectId ?? null)
    )
  }
  if (onHomeBlankRoute.value) {
    return projectSpaceKey(projectStore?.activeProjectId ?? null)
  }
  if (onBrowserRoute.value) {
    const tab = activeBrowserTab.value
    if (tab) {
      const boundSpace = resolveBrowserTabSpaceKey(tab, resolveConversationSpace)
      if (boundSpace) return boundSpace
    }
    return BROWSER_SCOPE_KEY
  }
  return null
})

const displayedScopeKey = computed<string>(
  () => currentLiveScope.value ?? workspaceTabs.lastWorkspaceScope.value ?? BROWSER_SCOPE_KEY
)
const isSpaceScope = computed(() => isSpaceScopeKey(displayedScopeKey.value))
const isHerdrScope = computed(() => isHerdrSpaceKey(displayedScopeKey.value))
const displayedHerdrGroup = computed<HerdrProjectGroup | null>(() => {
  const groupKey = herdrGroupKeyFromSpaceKey(displayedScopeKey.value)
  if (!groupKey) return activeRouteHerdrGroup.value
  return herdrProjectGroupByKey.value.get(groupKey) ?? null
})
const displayedHerdrTabTitles = computed<Map<string, string> | null>(() =>
  displayedHerdrGroup.value ? buildHerdrProjectTabTitles(displayedHerdrGroup.value) : null
)

function browserTabTitle(tab: BrowserTabState): string {
  if (!tab.url) return t('browser.newTab')
  const preview = parseBrowserFilePreviewUrl(tab.url)
  if (preview) return basenameOfPath(preview.path)
  return tab.title || tab.url
}

function isStandaloneBrowserTab(tab: BrowserTabState): boolean {
  return (
    !isDeprecatedInternalBrowserUrl(tab.url) &&
    !resolveBrowserTabSpaceKey(tab, resolveConversationSpace)
  )
}

const displayedTabs = computed<StripTab[]>(() => {
  const allBrowserTabs = state.value?.tabs ?? []

  if (!isSpaceScope.value) {
    return allBrowserTabs.filter(isStandaloneBrowserTab).map((tab) => ({
      id: tab.id,
      kind: 'browser' as const,
      title: browserTabTitle(tab),
      icon: tabIcon(tab),
      browserTab: tab
    }))
  }

  const scope = displayedScopeKey.value
  const spaceTabs = workspaceTabs.spaceTabsMap.value[scope] ?? []
  const browserById = new Map<string, BrowserTabState>()
  for (const tab of allBrowserTabs) {
    if (!isDeprecatedInternalBrowserUrl(tab.url)) {
      browserById.set(tab.id, tab)
    }
  }

  const result: StripTab[] = []
  for (const entry of spaceTabs) {
    if (entry.kind === 'conversation') {
      const record = resolveConversationRecord(entry.conversationId)
      result.push({
        id: entry.id,
        kind: 'conversation',
        title: record?.title?.trim() || t('shell.history.untitled'),
        icon: 'i-ri-chat-3-line',
        conversationId: entry.conversationId,
        spaceKey: scope
      })
    } else if (entry.kind === 'herdr') {
      const session = herdr.sessionByAddress.value.get(entry.address)
      result.push({
        id: entry.id,
        kind: 'herdr',
        title:
          displayedHerdrTabTitles.value?.get(entry.address) ||
          session?.displayTitle ||
          entry.address,
        icon: resolveHerdrTabIcon(session),
        herdrAddress: entry.address,
        spaceKey: scope
      })
    } else if (entry.kind === 'draft') {
      result.push({
        id: entry.id,
        kind: 'draft',
        title: t('shell.newChat'),
        icon: 'i-ri-chat-3-line',
        spaceKey: scope
      })
    } else {
      const liveBrowserTab = browserById.get(entry.browserTabId)
      if (!liveBrowserTab) continue
      result.push({
        id: entry.id,
        kind: 'browser',
        title: browserTabTitle(liveBrowserTab),
        icon: tabIcon(liveBrowserTab),
        browserTab: liveBrowserTab,
        conversationId: entry.conversationId,
        spaceKey: scope
      })
    }
  }
  return result
})

const activeStripTabId = computed<string | null>(() => {
  if (onUnfocusedShellRoute.value || !currentLiveScope.value) {
    return null
  }
  if (!isSpaceScope.value) {
    if (!onBrowserRoute.value) return null
    const current = activeBrowserTab.value
    if (!current) return null
    return displayedTabs.value.some((tab) => tab.id === current.id) ? current.id : null
  }
  if (onHerdrRoute.value && routeHerdrAddress.value) {
    const id = herdrTabId(routeHerdrAddress.value)
    return displayedTabs.value.some((tab) => tab.id === id) ? id : null
  }
  if (onHomeConversationRoute.value && routeConversationId.value) {
    const id = conversationTabId(routeConversationId.value)
    return displayedTabs.value.some((tab) => tab.id === id) ? id : null
  }
  if (onHomeBlankRoute.value) {
    const id = draftTabId(displayedScopeKey.value)
    return displayedTabs.value.some((tab) => tab.id === id) ? id : null
  }
  if (onBrowserRoute.value && activeBrowserTab.value) {
    const id = spaceBrowserTabId(activeBrowserTab.value.id)
    return displayedTabs.value.some((tab) => tab.id === id) ? id : null
  }
  return null
})

const activeStripTab = computed<StripTab | null>(
  () => displayedTabs.value.find((tab) => tab.id === activeStripTabId.value) ?? null
)
const addControlsDisabled = computed(() => !isSpaceScope.value && !state.value)
const primaryAddDisabled = computed(
  () =>
    addControlsDisabled.value ||
    (isHerdrScope.value && (creatingHerdrSession.value || !herdr.isConnected.value))
)
const primaryAddLabel = computed(() => {
  if (isHerdrScope.value) return t('herdr.sidebar.newSession')
  if (isSpaceScope.value) return t('shell.newChat')
  return t('browser.addTab')
})
const hiddenHerdrSessions = computed<Array<{ address: string; title: string; icon: string }>>(
  () => {
    const group = displayedHerdrGroup.value
    if (!group) return []
    const visibleIds = new Set(displayedTabs.value.map((tab) => tab.id))
    const titles = displayedHerdrTabTitles.value
    return group.sessions
      .filter((session) => !visibleIds.has(herdrTabId(session.address)))
      .map((session) => ({
        address: session.address,
        title: titles?.get(session.address) || session.displayTitle || session.address,
        icon: resolveHerdrTabIcon(session)
      }))
  }
)

const tabMenuOpenModel = computed({
  get: () => tabMenuOpen.value,
  set: (open: boolean) => {
    tabMenuOpen.value = open
  }
})
const addTabMenuOpenModel = computed({
  get: () => addTabMenuOpen.value,
  set: (open: boolean) => {
    addTabMenuOpen.value = open
  }
})
const tabMenuIndex = computed(() =>
  displayedTabs.value.findIndex((tab) => tab.id === tabMenuTargetId.value)
)
const tabMenuTarget = computed<StripTab | undefined>(() => displayedTabs.value[tabMenuIndex.value])
const tabMenuHerdrAddress = computed(() =>
  tabMenuTarget.value?.kind === 'herdr' ? (tabMenuTarget.value.herdrAddress ?? '') : ''
)
const tabMenuHerdrSession = computed(() =>
  tabMenuHerdrAddress.value
    ? (herdr.sessionByAddress.value.get(tabMenuHerdrAddress.value) ?? null)
    : null
)
const tabMenuHerdrLive = computed(() => tabMenuHerdrSession.value?.state === 'live')
const tabMenuHerdrViewMode = computed<HerdrStageViewMode>(() => {
  const addr = tabMenuHerdrAddress.value
  if (!addr) return 'chat'
  const active = herdrStageControl.activeHandle.value
  if (active && active.address === addr) return active.getViewMode()
  const selected = herdrStageControl.getSelectedMode(addr)
  if (selected) return selected
  const projection = herdr.projectionsByAddress?.[addr]
  return projection && !projection.available ? 'terminal' : 'chat'
})
const tabMenuHerdrPanelOpen = computed(() => {
  const addr = tabMenuHerdrAddress.value
  const active = herdrStageControl.activeHandle.value
  return Boolean(addr && active && active.address === addr && active.isPanelOpen())
})
const leftTabsCount = computed(() => (tabMenuIndex.value > 0 ? tabMenuIndex.value : 0))
const rightTabsCount = computed(() => {
  const total = displayedTabs.value.length
  return tabMenuIndex.value >= 0 ? Math.max(0, total - tabMenuIndex.value - 1) : 0
})
const otherTabsCount = computed(() => {
  const total = displayedTabs.value.length
  return tabMenuIndex.value >= 0 ? Math.max(0, total - 1) : 0
})
const quickSavedPages = computed(() => {
  const seen = new Set<string>()
  const result: Array<{ url: string; title: string; favicon: string | null; bookmarked: boolean }> =
    []
  for (const item of state.value?.bookmarks ?? []) {
    if (!item.url || item.url.startsWith('tuff://') || seen.has(item.url)) continue
    seen.add(item.url)
    result.push({ ...item, bookmarked: true })
    if (result.length >= 4) return result
  }
  for (const item of state.value?.recent ?? []) {
    if (!item.url || item.url.startsWith('tuff://') || seen.has(item.url)) continue
    seen.add(item.url)
    result.push({ ...item, bookmarked: false })
    if (result.length >= 4) return result
  }
  return result
})

function shortcutKeys(key: string): string[] {
  return isMac.value ? ['⌘', key] : ['Ctrl', key]
}

function openAddTabMenu(): void {
  if (addControlsDisabled.value) return
  addTabMenuOpen.value = true
}

async function openSpaceConversationDraft(spaceKey: string): Promise<void> {
  addTabMenuOpen.value = false
  setLastWorkspaceScope(spaceKey)
  ensureDraftTab(spaceKey)
  projectStore?.beginConversation(projectIdFromSpaceKey(spaceKey))
  await router.push(APP_SURFACE_ROUTES.home)
}

async function openSpaceWebTab(spaceKey: string, url?: string): Promise<void> {
  addTabMenuOpen.value = false
  if (!state.value) return
  await runInBrowser(async () => {
    const next = await sdk.createTab(url)
    const createdTabId = next.createdTabId || next.activeTabId
    if (createdTabId) {
      attachBrowserTabToSpace(createdTabId, spaceKey)
      setLastWorkspaceScope(spaceKey)
    }
    return next
  })
}

async function openNewHerdrSession(): Promise<void> {
  addTabMenuOpen.value = false
  if (creatingHerdrSession.value || !herdr.isConnected.value) return
  creatingHerdrSession.value = true
  try {
    const targetGroup = displayedHerdrGroup.value
    const request = targetGroup ? buildNewTerminalRequestForGroup(targetGroup) : {}
    const session = await herdr.startSession(request)
    const targetScope = targetGroup ? herdrProjectSpaceKey(targetGroup.key) : HERDR_SPACE_KEY
    setLastWorkspaceScope(targetScope)
    if (targetGroup) {
      setLastHerdrAddressForGroup(targetGroup.key, session.address)
    }
    ensureHerdrTab(session.address, targetScope)
    await router.push(herdrConversationRoute(session.address))
  } catch {
    toast.error(t('terminal.failed'))
  } finally {
    creatingHerdrSession.value = false
  }
}

async function reopenHerdrSession(address: string): Promise<void> {
  addTabMenuOpen.value = false
  const targetGroup = displayedHerdrGroup.value
  const targetScope = targetGroup ? herdrProjectSpaceKey(targetGroup.key) : displayedScopeKey.value
  setLastWorkspaceScope(targetScope)
  if (targetGroup) {
    setLastHerdrAddressForGroup(targetGroup.key, address)
  }
  ensureHerdrTab(address, targetScope)
  await router.push(herdrConversationRoute(address))
}

function handlePrimaryAddClick(): void {
  addTabMenuOpen.value = false
  if (isHerdrScope.value) {
    void openNewHerdrSession()
    return
  }
  if (isSpaceScope.value) {
    void openSpaceConversationDraft(displayedScopeKey.value)
    return
  }
  void runInBrowser(() => sdk.createTab())
}

function openNewTab(): void {
  addTabMenuOpen.value = false
  if (isSpaceScope.value) {
    void openSpaceWebTab(displayedScopeKey.value)
    return
  }
  void runInBrowser(() => sdk.createTab())
}

function duplicateActiveTab(): void {
  const current = activeStripTab.value?.browserTab ?? activeBrowserTab.value
  addTabMenuOpen.value = false
  if (!current) return
  if (isSpaceScope.value) {
    void openSpaceWebTab(displayedScopeKey.value, current.url)
    return
  }
  void runInBrowser(() => sdk.createTab(current.url))
}

function openSavedPage(url: string): void {
  addTabMenuOpen.value = false
  if (isSpaceScope.value) {
    void openSpaceWebTab(displayedScopeKey.value, url)
    return
  }
  void runInBrowser(() => sdk.createTab(url))
}

// Activating or creating a browser tab lands on the Browser page; close and reorder stay in place.
async function runInBrowser(action: () => Promise<BrowserWorkspaceState>): Promise<boolean> {
  if (!onBrowserRoute.value) await router.push(APP_SURFACE_ROUTES.browser)
  return command(action)
}

function activateSpaceEntry(entry: SpaceWorkspaceTab): void {
  setLastWorkspaceScope(entry.spaceKey)
  if (entry.kind === 'conversation') {
    if (route.path !== `/home/c/${entry.conversationId}`) {
      void router.push(`/home/c/${entry.conversationId}`)
    }
    return
  }
  if (entry.kind === 'herdr') {
    const targetPath = herdrConversationRoute(entry.address)
    if (route.path !== targetPath) {
      void router.push(targetPath)
    }
    return
  }
  if (entry.kind === 'draft') {
    void openSpaceConversationDraft(entry.spaceKey)
    return
  }
  void runInBrowser(() => sdk.activateTab(entry.browserTabId))
}

function activateOrOpenTab(tab: StripTab): void {
  userSelectionSeq += 1
  if (tab.kind === 'conversation' && tab.conversationId) {
    if (tab.spaceKey) setLastWorkspaceScope(tab.spaceKey)
    if (route.path === `/home/c/${tab.conversationId}`) return
    void router.push(`/home/c/${tab.conversationId}`)
    return
  }
  if (tab.kind === 'herdr' && tab.herdrAddress) {
    setLastWorkspaceScope(tab.spaceKey ?? HERDR_SPACE_KEY)
    const targetPath = herdrConversationRoute(tab.herdrAddress)
    if (route.path === targetPath) return
    void router.push(targetPath)
    return
  }
  if (tab.kind === 'draft') {
    const scope = tab.spaceKey ?? displayedScopeKey.value
    if (
      onHomeBlankRoute.value &&
      projectSpaceKey(projectStore?.activeProjectId ?? null) === scope
    ) {
      return
    }
    void openSpaceConversationDraft(scope)
    return
  }
  const browserTab = tab.browserTab
  if (!browserTab) return
  setLastWorkspaceScope(tab.spaceKey ?? BROWSER_SCOPE_KEY)
  if (onBrowserRoute.value && browserTab.id === state.value?.activeTabId && !browserTab.error) {
    return
  }
  void runInBrowser(() => sdk.activateTab(browserTab.id))
}

async function closeStripTab(tab: StripTab): Promise<void> {
  if (!isSpaceScope.value) {
    if (tab.browserTab) {
      void command(() => sdk.closeTab(tab.browserTab!.id))
    }
    return
  }

  const scope = displayedScopeKey.value
  const wasActive = activeStripTabId.value === tab.id

  if (tab.kind === 'browser' && tab.browserTab) {
    const startRoutePath = route.path
    const browserTabId = tab.browserTab.id
    const currentList = getSpaceTabs(scope)
    const closingIndex = currentList.findIndex((item) => item.id === tab.id)
    const fallbackNext =
      closingIndex >= 0
        ? (currentList[closingIndex + 1] ?? currentList[closingIndex - 1] ?? null)
        : null

    const accepted = await command(() => sdk.closeTab(browserTabId))
    if (!accepted) return

    const { nextTab } = removeSpaceTab(scope, tab.id)
    if (!wasActive || route.path !== startRoutePath) return

    const remaining = getSpaceTabs(scope)
    const resolvedNext =
      nextTab ??
      (fallbackNext && remaining.some((item) => item.id === fallbackNext.id)
        ? fallbackNext
        : (remaining[0] ?? null))
    if (resolvedNext) {
      activateSpaceEntry(resolvedNext)
      return
    }
    if (isHerdrSpaceKey(scope)) {
      setLastWorkspaceScope(BROWSER_SCOPE_KEY)
      void router.push(APP_SURFACE_ROUTES.browser)
      return
    }
    void openSpaceConversationDraft(scope)
    return
  }

  const { removed, nextTab } = removeSpaceTab(scope, tab.id)
  if (!wasActive) return

  if (nextTab) {
    activateSpaceEntry(nextTab)
    return
  }
  if (removed?.kind === 'draft' || isHerdrSpaceKey(scope)) {
    setLastWorkspaceScope(BROWSER_SCOPE_KEY)
    void router.push(APP_SURFACE_ROUTES.browser)
    return
  }
  void openSpaceConversationDraft(scope)
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

async function selectHerdrTabViewMode(mode: HerdrStageViewMode): Promise<void> {
  const target = tabMenuTarget.value
  const addr = tabMenuHerdrAddress.value
  tabMenuOpen.value = false
  if (!target || !addr) return
  herdrStageControl.setSelectedMode(addr, mode)
  if (routeHerdrAddress.value !== addr) {
    activateOrOpenTab(target)
  }
}

async function runHerdrTabRefresh(): Promise<void> {
  const addr = tabMenuHerdrAddress.value
  tabMenuOpen.value = false
  if (!addr) return
  const active = herdrStageControl.activeHandle.value
  if (active && active.address === addr) {
    await active.refreshProjection()
    return
  }
  await herdr.refreshProjection?.(addr)
}

async function runHerdrTabInterrupt(): Promise<void> {
  const addr = tabMenuHerdrAddress.value
  tabMenuOpen.value = false
  if (!addr) return
  const active = herdrStageControl.activeHandle.value
  if (active && active.address === addr) {
    await active.interrupt()
    return
  }
  try {
    await herdr.interrupt?.(addr)
  } catch {
    toast.error(t('herdr.actions.interruptFailed'))
  }
}

async function runHerdrTabKill(): Promise<void> {
  const addr = tabMenuHerdrAddress.value
  tabMenuOpen.value = false
  if (!addr) return
  const active = herdrStageControl.activeHandle.value
  if (active && active.address === addr) {
    await active.kill()
    return
  }
  try {
    await herdr.kill?.(addr)
  } catch {
    toast.error(t('herdr.stage.killConfirmFailed'))
  }
}

async function runHerdrTabTogglePanel(): Promise<void> {
  const target = tabMenuTarget.value
  const addr = tabMenuHerdrAddress.value
  tabMenuOpen.value = false
  if (!target || !addr) return
  if (herdrStageControl.activeHandle.value?.address !== addr) {
    activateOrOpenTab(target)
    await nextTick()
  }
  herdrStageControl.activeHandle.value?.togglePanel()
}

function runHerdrTabToggleTerminal(): void {
  tabMenuOpen.value = false
  toggleTerminal()
}

async function selectTabMenuAction(action: BrowserTabMenuAction): Promise<void> {
  if (!tabMenuOpen.value) return
  const target = tabMenuTarget.value
  tabMenuOpen.value = false
  if (!target) return

  if (!isSpaceScope.value) {
    if (!target.browserTab) return
    const browserTabId = target.browserTab.id
    const run = (): Promise<BrowserWorkspaceState> =>
      runBrowserTabAction(sdk, action, browserTabId, { filter: isStandaloneBrowserTab })
    void (action === 'duplicate' ? runInBrowser(run) : command(run))
    return
  }

  const scope = displayedScopeKey.value
  if (action === 'reload') {
    if (target.browserTab?.url) {
      void command(() => sdk.reload(target.browserTab!.id))
    }
    return
  }
  if (action === 'duplicate') {
    if (target.browserTab) {
      void openSpaceWebTab(scope, target.browserTab.url)
    }
    return
  }
  if (action === 'close') {
    void closeStripTab(target)
    return
  }

  const startRoutePath = route.path
  const startSelectionSeq = userSelectionSeq
  const wasActiveRemoved =
    activeStripTabId.value !== null &&
    ((action === 'close-others' && activeStripTabId.value !== target.id) ||
      (action === 'close-left' &&
        displayedTabs.value.findIndex((item) => item.id === activeStripTabId.value) <
          tabMenuIndex.value) ||
      (action === 'close-right' &&
        displayedTabs.value.findIndex((item) => item.id === activeStripTabId.value) >
          tabMenuIndex.value))

  const shouldActivateTarget = (): boolean =>
    wasActiveRemoved &&
    route.path === startRoutePath &&
    userSelectionSeq === startSelectionSeq &&
    getSpaceTabs(scope).some((item) => item.id === target.id)

  const hasBrowserTabsToClose = displayedTabs.value.some((item, idx) => {
    if (item.kind !== 'browser') return false
    return action === 'close-others'
      ? idx !== tabMenuIndex.value
      : action === 'close-left'
        ? idx < tabMenuIndex.value
        : idx > tabMenuIndex.value
  })

  if (hasBrowserTabsToClose) {
    const runSpaceBulkClose = async (): Promise<BrowserWorkspaceState> => {
      const currentList = getSpaceTabs(scope)
      const targetIndex = currentList.findIndex((item) => item.id === target.id)
      if (targetIndex < 0) {
        return state.value ?? (await sdk.getState())
      }
      const toRemove = currentList.filter((_item, idx) =>
        action === 'close-others'
          ? idx !== targetIndex
          : action === 'close-left'
            ? idx < targetIndex
            : idx > targetIndex
      )

      let latestState = state.value
      for (const entry of toRemove) {
        if (entry.kind === 'browser') {
          latestState = await sdk.closeTab(entry.browserTabId)
        }
        removeSpaceTab(scope, entry.id)
      }

      if (shouldActivateTarget()) {
        if (target.kind === 'browser' && target.browserTab) {
          setLastWorkspaceScope(scope)
          latestState = await sdk.activateTab(target.browserTab.id)
          if (!onBrowserRoute.value) {
            void router.push(APP_SURFACE_ROUTES.browser)
          }
        } else {
          activateOrOpenTab(target)
        }
      }
      return latestState ?? (await sdk.getState())
    }
    await command(runSpaceBulkClose)
  } else {
    closeSpaceTabsBulk(scope, target.id, action)
    if (shouldActivateTarget()) {
      activateOrOpenTab(target)
    }
  }
}

function resetTabDrag(): void {
  draggedTabId.value = null
  tabDropTarget.value = null
}

async function moveTab(tabId: string, beforeTabId: string | null): Promise<void> {
  if (tabMovePending.value) return
  if (isSpaceScope.value) {
    if (reorderSpaceTab(displayedScopeKey.value, tabId, beforeTabId)) {
      await nextTick()
      syncActivePill(true)
      const element = document.getElementById(`browser-tab-${tabId}`)
      element?.focus({ preventScroll: true })
      element?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    return
  }

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
  if (
    tabMovePending.value ||
    tabMenuOpen.value ||
    addTabMenuOpen.value ||
    pluginToolbarOpen.value ||
    !event.dataTransfer
  ) {
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
  const tabs = displayedTabs.value
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
  const tabs = displayedTabs.value
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
  activateOrOpenTab(tab)
  void nextTick(() => {
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
  const id = activeStripTabId.value
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

// Automatically clean up legacy persisted `tuff://store` and `tuff://settings` tabs
// and keep space-scoped browser tabs synchronized with live BrowserWorkspaceState.
watch(
  () => [state.value?.tabs, history.conversations.value] as const,
  ([tabs]) => {
    if (!tabs) return
    syncBrowserTabsWithSpaces(tabs, resolveConversationSpace)
    for (const tab of tabs) {
      if (!isDeprecatedInternalBrowserUrl(tab.url)) continue
      if (closingDeprecatedIds.has(tab.id)) continue
      closingDeprecatedIds.add(tab.id)
      void command(() => sdk.closeTab(tab.id)).finally(() => {
        closingDeprecatedIds.delete(tab.id)
      })
    }
  },
  { immediate: true }
)

// Track route & Space / conversation focus so clicking any Space conversation adds/activates
// its tab in that Space's strip while /store and /setting preserve the last strip unselected.
watch(
  () =>
    [
      route.path,
      routeConversationId.value,
      routeHerdrAddress.value,
      activeRouteHerdrGroup.value,
      displayedHerdrGroup.value,
      projectStore?.activeProjectId ?? null,
      history.conversations.value,
      currentLiveScope.value
    ] as const,
  ([
    path,
    convId,
    herdrAddress,
    routeGroup,
    displayedGroup,
    activeProjectId,
    _convs,
    liveScope
  ]) => {
    const previousPath = lastObservedRoutePath
    lastObservedRoutePath = path

    if (onHerdrRoute.value && herdrAddress) {
      if (routeGroup) {
        const spaceKey = herdrProjectSpaceKey(routeGroup.key)
        setLastWorkspaceScope(spaceKey)
        setLastHerdrAddressForGroup(routeGroup.key, herdrAddress)
        syncHerdrProjectTabs(
          spaceKey,
          routeGroup.sessions.map((session) => session.address),
          { activeAddress: herdrAddress }
        )
      } else {
        setLastWorkspaceScope(HERDR_SPACE_KEY)
        ensureHerdrTab(herdrAddress, HERDR_SPACE_KEY)
      }
      return
    }
    if (onHomeConversationRoute.value && convId) {
      const spaceKey = resolveConversationSpace(convId) ?? projectSpaceKey(activeProjectId)
      setLastWorkspaceScope(spaceKey)
      ensureConversationTab(spaceKey, convId, {
        promoteDraft: previousPath === APP_SURFACE_ROUTES.home
      })
      return
    }
    if (onHomeBlankRoute.value) {
      const spaceKey = projectSpaceKey(activeProjectId)
      setLastWorkspaceScope(spaceKey)
      ensureDraftTab(spaceKey)
      return
    }
    if (liveScope) {
      setLastWorkspaceScope(liveScope)
    }
    if (displayedGroup && isHerdrSpaceKey(displayedScopeKey.value)) {
      syncHerdrProjectTabs(
        herdrProjectSpaceKey(displayedGroup.key),
        displayedGroup.sessions.map((session) => session.address)
      )
    }
  },
  { immediate: true }
)

watch(
  () => displayedTabs.value.map((tab) => tab.id),
  (tabIds) => {
    const ids = new Set(tabIds)
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

watch(displayedScopeKey, () => {
  tabMenuOpen.value = false
  addTabMenuOpen.value = false
  resetTabDrag()
  void nextTick(() => {
    syncActivePill(false)
    syncScrollEdges()
  })
})

watch(activeStripTabId, (id, previousId) => {
  if (id === previousId) return
  void nextTick(() => {
    syncActivePill(Boolean(previousId && id))
    if (id) {
      document
        .getElementById(`browser-tab-${id}`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    syncScrollEdges()
  })
})

watch(tabMenuOpen, (open) => {
  if (open) return
  void nextTick(() => {
    if (onUnfocusedShellRoute.value) return
    const tabId = tabMenuTarget.value?.id ?? activeStripTabId.value
    if (tabId) document.getElementById(`browser-tab-${tabId}`)?.focus()
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
  closingDeprecatedIds.clear()
  resetTabDrag()
})
</script>

<template>
  <div
    class="BrowserTabStrip flex h-11 min-w-0 flex-none items-center gap-1.5 px-2.5"
    :class="{ 'is-window-controls': !isMac }"
    :data-platform="platform"
    :data-tab-scope="displayedScopeKey"
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
      :aria-label="isSpaceScope ? t('browser.spaceTabs') : t('browser.tabs')"
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
          v-for="(tab, index) in displayedTabs"
          :key="tab.id"
          :ref="(el) => setTabEl(tab.id, el)"
          class="BrowserTabStrip-Tab BrowserTabStrip-NoDrag relative flex h-8 min-w-28 max-w-52 flex-none items-center gap-1 pr-1.5"
          :class="{
            'opacity-50': draggedTabId === tab.id,
            'is-active': tab.id === activeStripTabId
          }"
          :data-tab-kind="tab.kind"
          @contextmenu="openTabMenu(tab.id, $event)"
          @auxclick.middle.prevent="closeStripTab(tab)"
          @dragover="showTabDropTarget($event, tab.id)"
          @drop="dropTab($event, tab.id)"
        >
          <button
            :id="`browser-tab-${tab.id}`"
            type="button"
            role="tab"
            :aria-selected="tab.id === activeStripTabId"
            :tabindex="tab.id === activeStripTabId || (!activeStripTabId && index === 0) ? 0 : -1"
            aria-controls="browser-viewport"
            aria-haspopup="menu"
            :aria-description="t('browser.reorderTabsHint')"
            :aria-expanded="tabMenuOpen && tabMenuTargetId === tab.id"
            class="BrowserTabStrip-TabButton flex h-full min-w-0 flex-1 items-center gap-2 pl-3 pr-1 outline-none"
            :title="tab.title"
            :draggable="!tabMovePending"
            @dragstart="startTabDrag(tab.id, $event)"
            @dragend="resetTabDrag"
            @click="activateOrOpenTab(tab)"
            @keydown="tabKeydown($event, index)"
          >
            <span
              class="BrowserTabStrip-TabIcon inline-flex h-4 w-4 flex-none items-center justify-center"
              :class="tab.icon"
              aria-hidden="true"
            />
            <span class="BrowserTabStrip-TabTitle truncate">{{ tab.title }}</span>
          </button>
          <TxIconButton
            icon="i-ri-close-line"
            size="xs"
            shape="circle"
            class="BrowserTabStrip-CloseBtn flex-none"
            :label="t('browser.closeTab', { title: tab.title })"
            @click="closeStripTab(tab)"
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
      <TxSkeleton
        v-if="!isSpaceScope && connecting && !state"
        :width="132"
        :height="32"
        :radius="16"
      />
      <div class="BrowserTabStrip-AddGroup" :class="{ 'is-open': addTabMenuOpen }">
        <TxIconButton
          icon="i-ri-add-line"
          size="sm"
          shape="circle"
          :label="primaryAddLabel"
          :disabled="primaryAddDisabled"
          class="BrowserTabStrip-AddBtn flex-none"
          @click="handlePrimaryAddClick"
          @contextmenu.prevent="openAddTabMenu"
        />
        <span class="BrowserTabStrip-AddDivider" aria-hidden="true" />
        <TxDropdownMenu
          v-model="addTabMenuOpenModel"
          placement="bottom-start"
          :min-width="232"
          :panel-card="SHELL_MENU_CARD"
          panel-background="refraction"
          :disabled="addControlsDisabled"
        >
          <template #trigger>
            <button
              type="button"
              class="BrowserTabStrip-AddMenuBtn"
              :class="{ 'is-open': addTabMenuOpen }"
              :disabled="addControlsDisabled"
              :title="t('browser.addTabMenu')"
              :aria-label="t('browser.addTabMenu')"
              data-testid="browser-add-tab-menu-trigger"
            >
              <span
                class="i-ri-arrow-down-s-line BrowserTabStrip-AddMenuChevron"
                aria-hidden="true"
              />
            </button>
          </template>

          <template v-if="isHerdrScope">
            <TxDropdownItem
              data-testid="herdr-add-menu-new-session"
              :disabled="creatingHerdrSession || !herdr.isConnected.value"
              @select="openNewHerdrSession"
            >
              <span class="BrowserTabStrip-AddMenuItem">
                <span
                  class="i-ri-terminal-box-line BrowserTabStrip-AddMenuIcon"
                  aria-hidden="true"
                />
                <span>{{ t('herdr.sidebar.newSession') }}</span>
              </span>
            </TxDropdownItem>

            <TxDropdownItem v-if="state" data-testid="space-add-menu-new-web" @select="openNewTab">
              <span class="BrowserTabStrip-AddMenuItem">
                <span class="i-ri-global-line BrowserTabStrip-AddMenuIcon" aria-hidden="true" />
                <span>{{ t('browser.addSpaceWebTab') }}</span>
              </span>
            </TxDropdownItem>

            <template v-if="hiddenHerdrSessions.length > 0">
              <div class="BrowserTabStrip-AddMenuDivider" role="separator" />
              <div class="BrowserTabStrip-AddMenuSection">
                {{ t('herdr.space.reopenTerminals') }}
              </div>
              <TxDropdownItem
                v-for="item in hiddenHerdrSessions"
                :key="item.address"
                data-testid="herdr-add-menu-reopen"
                @select="reopenHerdrSession(item.address)"
              >
                <span class="BrowserTabStrip-AddMenuItem">
                  <span :class="item.icon" class="BrowserTabStrip-AddMenuIcon" aria-hidden="true" />
                  <span class="BrowserTabStrip-AddMenuLabel">{{ item.title }}</span>
                </span>
              </TxDropdownItem>
            </template>
          </template>

          <template v-else-if="isSpaceScope">
            <TxDropdownItem
              data-testid="space-add-menu-new-chat"
              @select="openSpaceConversationDraft(displayedScopeKey)"
            >
              <span class="BrowserTabStrip-AddMenuItem">
                <span class="i-ri-chat-3-line BrowserTabStrip-AddMenuIcon" aria-hidden="true" />
                <span>{{ t('shell.newChat') }}</span>
              </span>
            </TxDropdownItem>

            <TxDropdownItem v-if="state" data-testid="space-add-menu-new-web" @select="openNewTab">
              <span class="BrowserTabStrip-AddMenuItem">
                <span class="i-ri-global-line BrowserTabStrip-AddMenuIcon" aria-hidden="true" />
                <span>{{ t('browser.addSpaceWebTab') }}</span>
              </span>
            </TxDropdownItem>
          </template>

          <template v-else>
            <TxDropdownItem data-testid="browser-add-menu-new-tab" @select="openNewTab">
              <span class="BrowserTabStrip-AddMenuItem">
                <span class="i-ri-global-line BrowserTabStrip-AddMenuIcon" aria-hidden="true" />
                <span>{{ t('browser.newTab') }}</span>
              </span>
              <template #right>
                <span class="BrowserTabStrip-MenuRight">
                  <TxKbd
                    v-for="key in shortcutKeys('T')"
                    :key="key"
                    class="BrowserTabStrip-MenuKbd"
                  >
                    {{ key }}
                  </TxKbd>
                </span>
              </template>
            </TxDropdownItem>

            <TxDropdownItem
              v-if="activeBrowserTab"
              data-testid="browser-add-menu-duplicate"
              @select="duplicateActiveTab"
            >
              <span class="BrowserTabStrip-AddMenuItem">
                <span class="i-ri-file-copy-line BrowserTabStrip-AddMenuIcon" aria-hidden="true" />
                <span>{{ t('browser.tabMenu.duplicate') }}</span>
              </span>
            </TxDropdownItem>
          </template>

          <template v-if="quickSavedPages.length > 0 && state">
            <div class="BrowserTabStrip-AddMenuDivider" role="separator" />
            <div class="BrowserTabStrip-AddMenuSection">
              {{ t('browser.addTabQuickOpen') }}
            </div>
            <TxDropdownItem
              v-for="page in quickSavedPages"
              :key="page.url"
              @select="openSavedPage(page.url)"
            >
              <span class="BrowserTabStrip-AddMenuItem">
                <span
                  :class="page.bookmarked ? 'i-ri-bookmark-line' : 'i-ri-history-line'"
                  class="BrowserTabStrip-AddMenuIcon"
                  aria-hidden="true"
                />
                <span class="BrowserTabStrip-AddMenuLabel">{{ page.title || page.url }}</span>
              </span>
            </TxDropdownItem>
          </template>
        </TxDropdownMenu>
      </div>
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
      :class="{ 'BrowserTabStrip-NoDrag': hasTrailingActions }"
    >
      <template v-if="onBrowserRoute">
        <BrowserPluginToolbar active @overlay-change="onPluginToolbarOverlay" />
        <ShellAccountAvatar key="browser-avatar" @overlay-change="onAccountOverlay" />
      </template>
      <template v-else-if="activeStageActions">
        <button
          v-if="stageCanBranch || stageBranching"
          class="BrowserTabStrip-ActionBtn"
          type="button"
          :disabled="stageBranching || undefined"
          :aria-busy="stageBranching || undefined"
          :aria-label="t('home.workspace.fork.conversation')"
          :title="t('home.workspace.fork.conversation')"
          data-testid="tabstrip-branch-btn"
          @click="activeStageActions.branch?.()"
        >
          <span
            :class="
              stageBranching ? 'i-ri-loader-4-line BrowserTabStrip-Spin' : 'i-ri-git-branch-line'
            "
          />
        </button>
        <div v-if="stageShowTurnInfo" class="BrowserTabStrip-MenuSlot">
          <HomeTurnInfoMenu :turn="stageTurn" :message-count="stageMessageCount">
            <template #trigger="{ open }">
              <button
                class="BrowserTabStrip-ActionBtn"
                type="button"
                aria-haspopup="menu"
                :aria-expanded="open"
                :aria-label="t('home.moreActions')"
                :title="t('home.moreActions')"
                data-testid="tabstrip-more-btn"
              >
                <span class="i-ri-more-line" />
              </button>
            </template>
          </HomeTurnInfoMenu>
        </div>
        <ShellAccountAvatar v-if="onHomeRoute" key="home-avatar" />
        <button
          class="BrowserTabStrip-ActionBtn"
          :class="{ 'is-active': stagePanelOpen }"
          type="button"
          :aria-pressed="stagePanelOpen"
          :aria-label="stagePanelOpen ? t('home.closePanel') : t('home.openPanel')"
          :title="stagePanelOpen ? t('home.closePanel') : t('home.openPanel')"
          data-testid="tabstrip-panel-toggle"
          @click="activeStageActions.togglePanel()"
        >
          <span class="i-ri-layout-right-line" />
          <MetaHintBadge v-if="onHomeRoute" command="toggle-panel" placement="below" />
        </button>
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
    :width="248"
    :panel-card="SHELL_MENU_CARD"
    :activation-feedback="false"
  >
    <template #menu>
      <template v-if="tabMenuTarget?.kind === 'herdr'">
        <TxContextMenuItem
          data-testid="herdr-tab-menu-mode-chat"
          @select="selectHerdrTabViewMode('chat')"
        >
          {{ t('herdr.stage.modeChat') }}
          <template #right>
            <span class="BrowserTabStrip-MenuRight">
              <span
                v-if="tabMenuHerdrViewMode === 'chat'"
                class="BrowserTabStrip-MenuHintIcon i-ri-check-line text-[var(--shell-primary)]"
                aria-hidden="true"
              />
              <span class="BrowserTabStrip-MenuHintIcon i-ri-chat-3-line" aria-hidden="true" />
            </span>
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          data-testid="herdr-tab-menu-mode-terminal"
          @select="selectHerdrTabViewMode('terminal')"
        >
          {{ t('herdr.stage.modeTerminal') }}
          <template #right>
            <span class="BrowserTabStrip-MenuRight">
              <span
                v-if="tabMenuHerdrViewMode === 'terminal'"
                class="BrowserTabStrip-MenuHintIcon i-ri-check-line text-[var(--shell-primary)]"
                aria-hidden="true"
              />
              <span
                class="BrowserTabStrip-MenuHintIcon i-ri-terminal-box-line"
                aria-hidden="true"
              />
            </span>
          </template>
        </TxContextMenuItem>
        <TxContextMenuDivider />
        <TxContextMenuItem data-testid="herdr-tab-menu-refresh" @select="runHerdrTabRefresh">
          {{ t('herdr.conversation.refresh') }}
          <template #right>
            <span class="BrowserTabStrip-MenuRight">
              <span class="BrowserTabStrip-MenuHintIcon i-ri-refresh-line" aria-hidden="true" />
            </span>
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          v-if="tabMenuHerdrLive"
          data-testid="herdr-tab-menu-interrupt"
          @select="runHerdrTabInterrupt"
        >
          {{ t('herdr.actions.interrupt') }}
          <template #right>
            <span class="BrowserTabStrip-MenuRight">
              <span class="BrowserTabStrip-MenuHintIcon i-ri-stop-circle-line" aria-hidden="true" />
            </span>
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          data-testid="herdr-tab-menu-toggle-panel"
          @select="runHerdrTabTogglePanel"
        >
          {{ tabMenuHerdrPanelOpen ? t('home.closePanel') : t('home.openPanel') }}
          <template #right>
            <span class="BrowserTabStrip-MenuRight">
              <span
                class="BrowserTabStrip-MenuHintIcon i-ri-layout-right-line"
                aria-hidden="true"
              />
            </span>
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          data-testid="herdr-tab-menu-toggle-terminal"
          @select="runHerdrTabToggleTerminal"
        >
          {{ t('shortcuts.commands.toggleTerminal') }}
          <template #right>
            <span class="BrowserTabStrip-MenuRight">
              <span
                class="BrowserTabStrip-MenuHintIcon i-ri-terminal-window-line"
                aria-hidden="true"
              />
            </span>
          </template>
        </TxContextMenuItem>
        <template v-if="tabMenuHerdrLive">
          <TxContextMenuDivider />
          <TxContextMenuItem danger data-testid="herdr-tab-menu-kill" @select="runHerdrTabKill">
            {{ t('terminal.herdr.kill') }}
            <template #right>
              <span class="BrowserTabStrip-MenuRight">
                <span class="BrowserTabStrip-MenuHintIcon i-ri-shut-down-line" aria-hidden="true" />
              </span>
            </template>
          </TxContextMenuItem>
        </template>
        <TxContextMenuDivider />
      </template>

      <template v-else>
        <TxContextMenuItem
          :disabled="tabMenuTarget?.kind !== 'browser' || !tabMenuTarget.browserTab?.url"
          @select="selectTabMenuAction('reload')"
        >
          {{ t('browser.tabMenu.reload') }}
          <template #right>
            <span class="BrowserTabStrip-MenuRight">
              <TxKbd v-for="key in shortcutKeys('R')" :key="key" class="BrowserTabStrip-MenuKbd">
                {{ key }}
              </TxKbd>
              <span class="BrowserTabStrip-MenuHintIcon i-ri-refresh-line" aria-hidden="true" />
            </span>
          </template>
        </TxContextMenuItem>
        <TxContextMenuItem
          :disabled="tabMenuTarget?.kind !== 'browser'"
          @select="selectTabMenuAction('duplicate')"
        >
          {{ t('browser.tabMenu.duplicate') }}
          <template #right>
            <span class="BrowserTabStrip-MenuRight">
              <span class="BrowserTabStrip-MenuHintIcon i-ri-file-copy-line" aria-hidden="true" />
            </span>
          </template>
        </TxContextMenuItem>
        <TxContextMenuDivider />
      </template>
      <TxContextMenuItem :disabled="!tabMenuTarget" @select="selectTabMenuAction('close')">
        {{ t('browser.tabMenu.close') }}
        <template #right>
          <span class="BrowserTabStrip-MenuRight">
            <TxKbd v-for="key in shortcutKeys('W')" :key="key" class="BrowserTabStrip-MenuKbd">
              {{ key }}
            </TxKbd>
            <span class="BrowserTabStrip-MenuHintIcon i-ri-close-line" aria-hidden="true" />
          </span>
        </template>
      </TxContextMenuItem>
      <TxContextMenuItem
        :disabled="!tabMenuTarget || displayedTabs.length < 2"
        @select="selectTabMenuAction('close-others')"
      >
        {{ t('browser.tabMenu.closeOthers') }}
        <template #right>
          <span class="BrowserTabStrip-MenuRight">
            <span v-if="otherTabsCount > 0" class="BrowserTabStrip-MenuCount">
              {{ otherTabsCount }}
            </span>
            <span class="BrowserTabStrip-MenuHintIcon i-ri-close-circle-line" aria-hidden="true" />
          </span>
        </template>
      </TxContextMenuItem>
      <TxContextMenuItem :disabled="tabMenuIndex <= 0" @select="selectTabMenuAction('close-left')">
        {{ t('browser.tabMenu.closeLeft') }}
        <template #right>
          <span class="BrowserTabStrip-MenuRight">
            <span v-if="leftTabsCount > 0" class="BrowserTabStrip-MenuCount">
              {{ leftTabsCount }}
            </span>
            <span class="BrowserTabStrip-MenuHintIcon i-ri-skip-left-line" aria-hidden="true" />
          </span>
        </template>
      </TxContextMenuItem>
      <TxContextMenuItem
        :disabled="!tabMenuTarget || tabMenuIndex >= displayedTabs.length - 1"
        @select="selectTabMenuAction('close-right')"
      >
        {{ t('browser.tabMenu.closeRight') }}
        <template #right>
          <span class="BrowserTabStrip-MenuRight">
            <span v-if="rightTabsCount > 0" class="BrowserTabStrip-MenuCount">
              {{ rightTabsCount }}
            </span>
            <span class="BrowserTabStrip-MenuHintIcon i-ri-skip-right-line" aria-hidden="true" />
          </span>
        </template>
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
  position: relative;
  z-index: 2;
  background: var(--shell-surface, var(--tx-fill-color-lighter));
  border-bottom: 1px solid
    color-mix(in srgb, var(--shell-border, var(--tx-border-color-lighter)) 75%, transparent);
  -webkit-app-region: drag;
  user-select: none;
}

.BrowserTabStrip-MenuSlot {
  display: inline-flex;
  flex: none;
}

.BrowserTabStrip-ActionBtn {
  display: inline-flex;
  position: relative;
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

  &:hover:not(:disabled),
  &.is-active {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }

  &:disabled {
    cursor: progress;
  }
}

.BrowserTabStrip-Spin {
  animation: browser-tabstrip-spin 0.9s linear infinite;
}

@keyframes browser-tabstrip-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .BrowserTabStrip-Spin {
    animation: none;
  }
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

.BrowserTabStrip-AddGroup {
  @include tab-capsule-g2;
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 2px;
  background: color-mix(in srgb, var(--tx-fill-color) 42%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-lighter) 70%, transparent);

  &:hover,
  &.is-open {
    box-shadow: inset 0 0 0 1px var(--tx-border-color-light);
  }
}

.BrowserTabStrip-AddBtn {
  @include pill-control-g2;
  --tx-icon-button-size: 28px;
  --tx-icon-button-radius: 999px;
  --tx-icon-button-color: var(--tx-text-color-regular);
  --tx-icon-button-bg: transparent;
  --tx-icon-button-bg-hover: color-mix(in srgb, var(--tx-fill-color) 90%, transparent);

  :deep(.tx-icon-button__icon) {
    font-size: 1rem;
  }

  &:hover:not(.is-disabled) {
    --tx-icon-button-color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}

.BrowserTabStrip-AddDivider {
  width: 1px;
  height: 14px;
  background: color-mix(in srgb, var(--tx-border-color) 65%, transparent);
}

.BrowserTabStrip-AddMenuBtn {
  @include pill-control-g2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--tx-text-color-secondary);
  cursor: pointer;

  &:hover:not(:disabled),
  &.is-open {
    background: color-mix(in srgb, var(--tx-fill-color) 90%, transparent);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.BrowserTabStrip-AddMenuChevron {
  font-size: 14px;
  transition: transform 160ms var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  .BrowserTabStrip-AddMenuBtn.is-open & {
    transform: rotate(180deg);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.BrowserTabStrip-AddMenuItem {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}

.BrowserTabStrip-AddMenuIcon {
  flex: none;
  font-size: 14px;
  color: var(--tx-text-color-secondary);
}

.BrowserTabStrip-AddMenuLabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.BrowserTabStrip-AddMenuDivider {
  height: 1px;
  margin: 4px 6px;
  background: color-mix(in srgb, var(--tx-border-color-lighter) 80%, transparent);
}

.BrowserTabStrip-AddMenuSection {
  padding: 4px 10px 2px;
  color: var(--tx-text-color-placeholder);
  font-size: 11px;
  font-weight: 500;
}

.BrowserTabStrip-MenuRight {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--tx-text-color-secondary);
}

.BrowserTabStrip-MenuKbd {
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  font-size: 11px;
}

.BrowserTabStrip-MenuHintIcon {
  font-size: 14px;
  opacity: 0.72;
}

.BrowserTabStrip-MenuCount {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-fill-color) 85%, transparent);
  color: var(--tx-text-color-secondary);
  font-size: 10.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  text-align: center;
}
</style>
