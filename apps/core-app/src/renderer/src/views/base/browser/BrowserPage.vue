<script setup lang="ts">
import type {
  BrowserSavedPage,
  BrowserTabState,
  BrowserViewportRequest,
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
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
  watch
} from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import ShellAccountAvatar from '~/components/shell/ShellAccountAvatar.vue'
import {
  isOpenableBrowserUrl,
  useBrowserConnection
} from '~/modules/browser-connection/useBrowserConnection'
import Store from '~/views/base/Store.vue'
import HomePage from '../home/HomePage.vue'
import BrowserPluginToolbar from './BrowserPluginToolbar.vue'
import BrowserSettingsTab from './BrowserSettingsTab.vue'
import ChromeBookmarkDialog from './ChromeBookmarkDialog.vue'
import ChromeLibraryPanel from './ChromeLibraryPanel.vue'
import ChromeCookieDialog from './ChromeCookieDialog.vue'
import type { BrowserTabMenuAction } from './tab-actions'
import { runBrowserTabAction } from './tab-actions'

const { t, locale } = useI18n()
const route = useRoute()
const sdk = createBrowserSdk(useTuffTransport())
const state = shallowRef<BrowserWorkspaceState | null>(null)
const error = ref('')
const connecting = ref(true)
const address = ref('')
const addressFocused = ref(false)
const addressInput = ref<HTMLInputElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const surfaceActive = ref(true)
const panel = ref<'history' | 'bookmarks' | 'chrome' | null>(null)
const overlayOpen = ref(false)
const tabMenu = ref<InstanceType<typeof TxContextMenu> | null>(null)
const tabMenuOpen = ref(false)
const tabMenuTargetId = ref('')
const draggedTabId = ref<string | null>(null)
const tabDropTarget = ref<{ id: string | null; before: boolean } | null>(null)
const tabMovePending = ref(false)
const pluginToolbarOpen = ref(false)
// Floating layers outside this template's DOM observer reach: the shell avatar (popover and the
// account dialog) and the "save to Chrome" form. Both report synchronously so the guest hides first.
const accountOpen = ref(false)
const chromeSaveOpen = ref(false)
const cookieDialogOpen = ref(false)
const syncingCookies = ref(false)
const {
  activeProfile: chromeProfile,
  importCookies: importChromeCookies,
  describeError: describeChromeError
} = useBrowserConnection()
const isChromeConnected = computed(() => chromeProfile.value?.status === 'connected')
const onRoute = computed(() => surfaceActive.value && route.path === '/browser')
const tabMenuIndex = computed(
  () => state.value?.tabs.findIndex((tab) => tab.id === tabMenuTargetId.value) ?? -1
)
const tabMenuTarget = computed(() => state.value?.tabs[tabMenuIndex.value])
const activeTab = computed(() =>
  state.value?.tabs.find((tab) => tab.id === state.value?.activeTabId)
)
const isStoreTab = computed(() => activeTab.value?.url?.startsWith('tuff://store') ?? false)
const isSettingsTab = computed(
  () =>
    (activeTab.value?.url?.startsWith('tuff://setting') ||
      activeTab.value?.url?.startsWith('tuff://settings')) ??
    false
)
const isLandingTab = computed(() => Boolean(activeTab.value && !activeTab.value.url))
const localPage = computed(() => isLandingTab.value || isStoreTab.value || isSettingsTab.value)

function tabIcon(tab: BrowserTabState): string {
  if (tab.loading) return 'i-ri-loader-4-line'
  if (!tab.url) return 'i-ri-global-line'
  if (tab.url.startsWith('tuff://store')) return 'i-ri-store-2-line'
  if (tab.url.startsWith('tuff://setting')) return 'i-ri-settings-3-line'
  return localIcon(tab.url)
}

function tabTitle(tab: BrowserTabState): string {
  if (!tab.url) return t('browser.newTab')
  if (tab.url.startsWith('tuff://store')) return t('shell.store')
  if (tab.url.startsWith('tuff://setting')) return t('shell.setting')
  return tab.title || tab.url
}
// Tuff's local bookmarks only; Chrome bookmarks are a separate library written back to Chrome.
const bookmarked = computed(
  () => state.value?.bookmarks.some((page) => page.url === activeTab.value?.url) ?? false
)
const currentPage = computed(() =>
  activeTab.value?.url ? { title: activeTab.value.title, url: activeTab.value.url } : null
)
const canSaveToChrome = computed(
  () => Boolean(chromeProfile.value) && isOpenableBrowserUrl(currentPage.value?.url)
)
const savedPages = computed(() =>
  panel.value === 'bookmarks' ? (state.value?.bookmarks ?? []) : (state.value?.recent ?? [])
)
const currentDomain = computed(() => {
  const url = activeTab.value?.url
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
})
const canSyncCookies = computed(() => {
  const url = activeTab.value?.url
  if (!url || !isOpenableBrowserUrl(url)) return false
  return url.startsWith('http://') || url.startsWith('https://')
})
async function syncCurrentCookies(): Promise<void> {
  const profile = chromeProfile.value
  const url = activeTab.value?.url
  const tabId = activeTab.value?.id
  if (!profile || !url || syncingCookies.value) return
  if (!isChromeConnected.value) {
    toast.warning(t('browser.cookies.chromeOfflineHint'))
    cookieDialogOpen.value = true
    return
  }
  syncingCookies.value = true
  try {
    const domain = currentDomain.value
    if (tabId && domain) {
      autoSyncedTabDomains.set(tabId, domain)
      lastAutoSyncTimes.set(domain, Date.now())
    }
    const result = await importChromeCookies(profile.id, { url, domain })
    if (result.importedCount > 0) {
      toast.success(t('browser.syncCookiesSuccess', { count: result.importedCount, domain }))
      void runActive('reload')
    } else {
      toast.info(t('browser.syncCookiesEmpty', { domain }))
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(t('browser.syncCookiesFailed', { error: describeChromeError(message) }))
  } finally {
    syncingCookies.value = false
  }
}
function onCookieSyncSuccess(count: number, domain: string): void {
  const tabId = activeTab.value?.id
  if (tabId && domain) {
    autoSyncedTabDomains.set(tabId, domain)
    lastAutoSyncTimes.set(domain, Date.now())
  }
  toast.success(t('browser.syncCookiesSuccess', { count, domain }))
  void runActive('reload')
}
const AUTO_SYNC_STORAGE_KEY = 'tuff-browser-cookie-auto-sync-sites'
const autoSyncedTabDomains = new Map<string, string>()
const lastAutoSyncTimes = new Map<string, number>()

watch(
  () => state.value?.tabs,
  (tabs) => {
    if (!tabs) return
    const openIds = new Set(tabs.map((t) => t.id))
    for (const id of autoSyncedTabDomains.keys()) {
      if (!openIds.has(id)) autoSyncedTabDomains.delete(id)
    }
  }
)

watch(
  () =>
    [
      activeTab.value?.id,
      activeTab.value?.url,
      chromeProfile.value?.id,
      activeTab.value?.loading,
      isChromeConnected.value
    ] as const,
  async ([tabId, newUrl, profileId, loading, connected]) => {
    if (!onRoute.value || loading || !tabId || !newUrl || !profileId || !connected) return
    if (syncingCookies.value) return
    if (!canSyncCookies.value) return
    const domain = currentDomain.value
    if (!domain) return
    if (autoSyncedTabDomains.get(tabId) === domain) return
    const lastTime = lastAutoSyncTimes.get(domain) ?? 0
    if (Date.now() - lastTime < 60_000) {
      autoSyncedTabDomains.set(tabId, domain)
      return
    }
    try {
      const raw = localStorage.getItem(AUTO_SYNC_STORAGE_KEY)
      const sites: string[] = raw ? JSON.parse(raw) : []
      if (!sites.includes(domain)) return

      autoSyncedTabDomains.set(tabId, domain)
      lastAutoSyncTimes.set(domain, Date.now())
      syncingCookies.value = true

      const res = await importChromeCookies(profileId as string, { url: newUrl as string, domain })
      if (res && res.importedCount > 0) {
        toast.success(t('browser.syncCookiesSuccess', { count: res.importedCount, domain }))
        void runActive('reload')
      }
    } catch {
      // silent background auto-sync failure
    } finally {
      syncingCookies.value = false
    }
  }
)

watch(
  () => [route.query.category, route.query.tab] as const,
  async ([category, tab]) => {
    if (category) {
      const s = state.value ?? (await sdk.getState().catch(() => null))
      if (s) {
        const existing = s.tabs.find((t) => t.url.startsWith('tuff://setting'))
        if (existing) {
          if (existing.id !== s.activeTabId) await sdk.activateTab(existing.id)
        } else {
          await sdk.createTab('tuff://settings')
        }
      }
    } else if (tab === 'store') {
      const s = state.value ?? (await sdk.getState().catch(() => null))
      if (s) {
        const existing = s.tabs.find((t) => t.url.startsWith('tuff://store'))
        if (existing) {
          if (existing.id !== s.activeTabId) await sdk.activateTab(existing.id)
        } else {
          await sdk.createTab('tuff://store')
        }
      }
    }
  },
  { immediate: true }
)
const snapshots = ref<Record<string, string>>({})
const currentSnapshot = computed(() => {
  const tabId = activeTab.value?.id
  return tabId ? snapshots.value[tabId] || null : null
})
const isSuspended = computed(() => {
  return Boolean(
    !onRoute.value ||
    document.hidden ||
    overlayOpen.value ||
    tabMenuOpen.value ||
    pluginToolbarOpen.value ||
    accountOpen.value ||
    chromeSaveOpen.value ||
    cookieDialogOpen.value ||
    Boolean(panel.value)
  )
})
let unsubscribeSnapshot: (() => void) | undefined
watch(isSuspended, (suspended) => {
  if (suspended && activeTab.value?.id) {
    const tabId = activeTab.value.id
    void sdk.captureSnapshot(tabId).then((res) => {
      if (res?.snapshot) {
        snapshots.value[tabId] = res.snapshot
      }
    })
  }
})
const shortcuts = [
  {
    title: 'Google',
    url: 'https://www.google.com',
    icon: 'i-simple-icons-google',
    color: '#4285F4'
  },
  {
    title: 'GitHub',
    url: 'https://github.com',
    icon: 'i-simple-icons-github',
    color: 'currentColor'
  },
  { title: 'Figma', url: 'https://www.figma.com', icon: 'i-simple-icons-figma', color: '#F24E1E' },
  {
    title: 'Notion',
    url: 'https://www.notion.so',
    icon: 'i-simple-icons-notion',
    color: 'currentColor'
  },
  { title: '知乎', url: 'https://www.zhihu.com', icon: 'i-simple-icons-zhihu', color: '#0066FF' },
  {
    title: 'YouTube',
    url: 'https://www.youtube.com',
    icon: 'i-simple-icons-youtube',
    color: '#FF0000'
  }
]
let retryAction: (() => Promise<BrowserWorkspaceState>) | null = null

// The push listener is installed before getState. Both command replies and the first read may
// arrive behind a newer push, so Main's revision is the sole ordering authority.
function applyState(next: BrowserWorkspaceState): void {
  if (state.value && next.revision <= state.value.revision) return
  state.value = next
  connecting.value = false
}

async function refreshState(): Promise<void> {
  connecting.value = true
  error.value = ''
  try {
    applyState(await sdk.getState())
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    connecting.value = false
  }
}

async function command(action: () => Promise<BrowserWorkspaceState>): Promise<boolean> {
  error.value = ''
  try {
    applyState(await action())
    retryAction = null
    return true
  } catch (failure) {
    retryAction = action
    error.value = failure instanceof Error ? failure.message : String(failure)
    return false
  }
}

function retry(): void {
  lastViewport = ''
  if (retryAction) void command(retryAction)
  else void refreshState()
}

function runActive(action: 'back' | 'forward' | 'reload' | 'stop' | 'bookmark' | 'refresh'): void {
  const tab = activeTab.value
  if (!tab) return
  void command(() => {
    if (action === 'bookmark') return sdk.toggleBookmark(tab.id)
    if (action === 'refresh') return tab.loading ? sdk.stop(tab.id) : sdk.reload(tab.id)
    return sdk[action](tab.id)
  })
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
  void command(() => runBrowserTabAction(sdk, action, tabId))
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
      if (onRoute.value) {
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
    !onRoute.value ||
    tabMenuOpen.value ||
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

function focusAddress(): void {
  if (!onRoute.value) return
  addressInput.value?.focus()
  addressInput.value?.select()
}

function onAddressFocus(): void {
  addressFocused.value = true
  addressInput.value?.select()
}

async function navigate(input: string): Promise<void> {
  const tab = activeTab.value
  if (!tab || !input.trim()) return
  const accepted = await command(() => sdk.navigate(tab.id, input.trim()))
  if (!accepted) throw new Error(error.value)
}

function navigateAddress(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter') {
    event.preventDefault()
    void navigate(address.value).catch(() => {})
    addressInput.value?.blur()
  } else if (event.key === 'Escape') {
    address.value = activeTab.value?.url ?? ''
    addressInput.value?.blur()
  }
}

function localIcon(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '')
    return (
      shortcuts.find((site) => new URL(site.url).hostname.replace(/^www\./, '') === hostname)
        ?.icon ?? 'i-ri-global-line'
    )
  } catch {
    return 'i-ri-global-line'
  }
}

function dateLabel(page: BrowserSavedPage): string {
  return new Date(page.visitedAt).toLocaleDateString(locale.value, {
    month: 'short',
    day: 'numeric'
  })
}

async function openSaved(page: BrowserSavedPage): Promise<void> {
  if (await command(() => sdk.createTab(page.url))) panel.value = null
}

/** An explicit copy of a Chrome page in Tuff's own session (its own website sign-ins). */
async function openCopyInTuff(url: string): Promise<boolean> {
  const opened = await command(() => sdk.createTab(url))
  if (opened) panel.value = null
  return opened
}

// A guest view is above renderer DOM, regardless of z-index. DOM overlays therefore suspend it,
// and the reserved viewport is the only geometry ever handed to Main (never the entire window).
const overlaySelector =
  '[role="dialog"], [role="menu"], [role="listbox"], dialog[open], .tx-base-anchor.is-open, .dialog-mask'
const overlayMutationSelector =
  '[role="dialog"], [role="menu"], [role="listbox"], dialog, .tx-base-anchor, .dialog-mask'
function updateOverlays(): void {
  overlayOpen.value = Array.from(document.querySelectorAll<HTMLElement>(overlaySelector)).some(
    (element) => {
      if (element.closest('[inert], [aria-hidden="true"]')) return false
      const style = getComputedStyle(element)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        element.getClientRects().length > 0
      )
    }
  )
}

let viewportFrame = 0
let viewportEpoch = 0
let viewportQueue: Promise<void> = Promise.resolve()
let lastViewport = ''
let resizeObserver: ResizeObserver | null = null
let overlayObserver: MutationObserver | null = null
let unsubscribe: (() => void) | undefined
let unsubscribeFocus: (() => void) | undefined
let disposed = false

function enqueueViewport(request: BrowserViewportRequest): void {
  const epoch = ++viewportEpoch
  viewportQueue = viewportQueue.then(async () => {
    // A queued show must not survive a newer hide, route switch, resize or overlay opening.
    if (request.visible && epoch !== viewportEpoch) return
    const key = JSON.stringify(request)
    if (lastViewport === key) return
    try {
      await sdk.setViewport(request)
      lastViewport = key
    } catch (failure) {
      if (!disposed && onRoute.value)
        error.value = failure instanceof Error ? failure.message : String(failure)
    }
  })
}

function hideViewport(): void {
  if (viewportFrame) cancelAnimationFrame(viewportFrame)
  viewportFrame = 0
  enqueueViewport({ visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } })
}

function measureViewport(): void {
  viewportFrame = 0
  if (
    !onRoute.value ||
    document.hidden ||
    !activeTab.value?.url ||
    activeTab.value.error ||
    error.value ||
    panel.value ||
    overlayOpen.value ||
    tabMenuOpen.value ||
    pluginToolbarOpen.value ||
    accountOpen.value ||
    chromeSaveOpen.value ||
    !viewport.value
  ) {
    hideViewport()
    return
  }
  const bounds = viewport.value.getBoundingClientRect()
  const x = Math.max(0, Math.ceil(bounds.left))
  const y = Math.max(0, Math.ceil(bounds.top))
  const width = Math.max(0, Math.floor(Math.min(bounds.right, window.innerWidth)) - x)
  const height = Math.max(0, Math.floor(Math.min(bounds.bottom, window.innerHeight)) - y)
  enqueueViewport({ visible: width > 0 && height > 0, bounds: { x, y, width, height } })
}

function scheduleViewport(): void {
  if (
    !onRoute.value ||
    document.hidden ||
    overlayOpen.value ||
    tabMenuOpen.value ||
    pluginToolbarOpen.value ||
    accountOpen.value ||
    chromeSaveOpen.value ||
    panel.value ||
    !activeTab.value?.url ||
    activeTab.value.error ||
    error.value
  ) {
    hideViewport()
    return
  }
  if (!viewportFrame) viewportFrame = requestAnimationFrame(measureViewport)
}

function onKeydown(event: KeyboardEvent): void {
  if (
    !onRoute.value ||
    event.isComposing ||
    event.keyCode === 229 ||
    overlayOpen.value ||
    tabMenuOpen.value ||
    pluginToolbarOpen.value ||
    accountOpen.value ||
    chromeSaveOpen.value
  )
    return
  const modifier = event.metaKey || event.ctrlKey
  if (modifier && !event.shiftKey && event.key.toLowerCase() === 'l') {
    event.preventDefault()
    addressInput.value?.focus()
    addressInput.value?.select()
  } else if (modifier && !event.shiftKey && event.key.toLowerCase() === 't') {
    event.preventDefault()
    void command(() => sdk.createTab())
  } else if (modifier && !event.shiftKey && event.key.toLowerCase() === 'w' && activeTab.value) {
    event.preventDefault()
    void command(() => sdk.closeTab(activeTab.value!.id))
  } else if (modifier && event.key.toLowerCase() === 'r' && activeTab.value?.url) {
    event.preventDefault()
    void command(() => sdk.reload(activeTab.value!.id))
  } else if (event.key === 'Escape' && panel.value) {
    event.preventDefault()
    panel.value = null
  }
}

function tabKeydown(event: KeyboardEvent, index: number): void {
  const tabs = state.value?.tabs ?? []
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
  let target = index
  if (event.key === 'ArrowRight') target = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length
  else if (event.key === 'Home') target = 0
  else if (event.key === 'End') target = tabs.length - 1
  else return
  event.preventDefault()
  const tab = tabs[target]
  if (!tab) return
  void command(() => sdk.activateTab(tab.id)).then(() => {
    document.getElementById(`browser-tab-${tab.id}`)?.focus()
  })
}

watch(
  () => [activeTab.value?.id, activeTab.value?.url],
  ([id], [previousId]) => {
    if (!addressFocused.value || id !== previousId) address.value = activeTab.value?.url ?? ''
    scheduleViewport()
    if (id !== previousId)
      void nextTick(() => {
        document
          .getElementById(`browser-tab-${id}`)
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
  }
)
watch(
  [
    onRoute,
    panel,
    overlayOpen,
    tabMenuOpen,
    pluginToolbarOpen,
    accountOpen,
    chromeSaveOpen,
    error,
    () => activeTab.value?.error
  ],
  scheduleViewport,
  {
    flush: 'sync'
  }
)
watch(tabMenuOpen, (open) => {
  if (open) return
  void nextTick(() => {
    if (!onRoute.value) return
    const tabId = tabMenuTarget.value?.id ?? activeTab.value?.id
    document.getElementById(`browser-tab-${tabId}`)?.focus()
  })
})
// A revoked or deselected profile unmounts the save form; its open flag must not keep the guest hidden.
watch(chromeProfile, (profile) => {
  if (!profile) chromeSaveOpen.value = false
})
onMounted(() => {
  unsubscribe = sdk.onChanged(applyState)
  unsubscribeFocus = sdk.onFocusAddress(focusAddress)
  unsubscribeSnapshot = sdk.onSnapshot(({ tabId, snapshot }) => {
    snapshots.value[tabId] = snapshot
  })
  void refreshState()
  resizeObserver = new ResizeObserver(scheduleViewport)
  if (viewport.value) resizeObserver.observe(viewport.value)
  overlayObserver = new MutationObserver((mutations) => {
    if (!onRoute.value) return
    if (
      mutations.some((mutation) => {
        const target = mutation.target instanceof Element ? mutation.target : null
        if (target?.matches(overlayMutationSelector) || target?.closest(overlayMutationSelector))
          return true
        return Array.from(mutation.addedNodes)
          .concat(Array.from(mutation.removedNodes))
          .some(
            (node) =>
              node instanceof Element &&
              (node.matches(overlayMutationSelector) || node.querySelector(overlayMutationSelector))
          )
      })
    )
      updateOverlays()
  })
  overlayObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'open', 'aria-hidden', 'inert']
  })
  updateOverlays()
  window.addEventListener('resize', scheduleViewport)
  window.addEventListener('scroll', scheduleViewport, true)
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('visibilitychange', scheduleViewport)
})
onActivated(() => {
  surfaceActive.value = true
  lastViewport = ''
  updateOverlays()
  void nextTick(scheduleViewport)
})
onDeactivated(() => {
  surfaceActive.value = false
  tabMenuOpen.value = false
  pluginToolbarOpen.value = false
  chromeSaveOpen.value = false
  resetTabDrag()
  hideViewport()
})
onBeforeUnmount(() => {
  disposed = true
  surfaceActive.value = false
  resetTabDrag()
  hideViewport()
  unsubscribe?.()
  unsubscribeFocus?.()
  unsubscribeSnapshot?.()
  resizeObserver?.disconnect()
  overlayObserver?.disconnect()
  window.removeEventListener('resize', scheduleViewport)
  window.removeEventListener('scroll', scheduleViewport, true)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', scheduleViewport)
})
</script>

<template>
  <section
    class="flex h-full min-h-0 min-w-0 flex-col text-[var(--tx-text-color-primary)]"
    :aria-label="t('browser.label')"
    style="-webkit-app-region: no-drag; background: var(--tx-bg-color)"
  >
    <div
      class="flex h-11 flex-none items-center gap-1 px-2 pt-1"
      data-browser-tabbar
      style="background: var(--tx-fill-color-light); -webkit-app-region: drag"
    >
      <div
        class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        role="tablist"
        :aria-label="t('browser.tabs')"
        style="-webkit-app-region: drag"
        @dragover.self="showTabDropTarget($event, null)"
        @drop.self="dropTab($event, null)"
      >
        <div
          v-for="(tab, index) in state?.tabs ?? []"
          :key="tab.id"
          class="relative flex min-w-32 max-w-56 items-center rounded-t-lg"
          :class="{ 'opacity-50': draggedTabId === tab.id }"
          style="-webkit-app-region: no-drag"
          :style="{ background: tab.id === state?.activeTabId ? 'var(--tx-bg-color)' : undefined }"
          @contextmenu="openTabMenu(tab.id, $event)"
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
            class="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-t-lg px-3 text-sm outline-offset-[-3px]"
            :title="tabTitle(tab)"
            :draggable="!tabMovePending"
            @dragstart="startTabDrag(tab.id, $event)"
            @dragend="resetTabDrag"
            @click="command(() => sdk.activateTab(tab.id))"
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
        <TxSkeleton v-if="connecting && !state" :width="150" :height="30" :radius="8" />
        <TxIconButton
          icon="i-ri-add-line"
          size="sm"
          :label="t('browser.addTab')"
          :disabled="!state"
          class="flex-none"
          style="-webkit-app-region: no-drag"
          @click="command(() => sdk.createTab())"
        />
      </div>
      <div
        data-browser-window-drag
        aria-hidden="true"
        :title="t('browser.dragWindow')"
        class="relative h-full w-12 flex-none"
        style="-webkit-app-region: drag"
        @dragover="showTabDropTarget($event, null)"
        @drop="dropTab($event, null)"
      >
        <span
          v-if="draggedTabId && tabDropTarget?.id === null"
          class="pointer-events-none absolute inset-y-1 left-0 w-0.5 bg-[var(--tx-color-primary)]"
        />
      </div>
      <div
        class="shell-chrome-safe-inline-end flex flex-none items-center gap-0.5"
        style="-webkit-app-region: no-drag"
      >
        <BrowserPluginToolbar :active="onRoute" @overlay-change="pluginToolbarOpen = $event" />
        <ShellAccountAvatar :active="onRoute" @overlay-change="accountOpen = $event" />
      </div>
    </div>

    <div
      v-if="!isSettingsTab && !isStoreTab"
      class="flex h-14 flex-none items-center gap-1 border-b border-[var(--tx-border-color-light)] px-3"
    >
      <TxIconButton
        icon="i-ri-arrow-left-line"
        :label="t('browser.back')"
        :disabled="!activeTab?.canGoBack"
        @click="runActive('back')"
      />
      <TxIconButton
        icon="i-ri-arrow-right-line"
        :label="t('browser.forward')"
        :disabled="!activeTab?.canGoForward"
        @click="runActive('forward')"
      />
      <TxIconButton
        :icon="activeTab?.loading ? 'i-ri-close-line' : 'i-ri-refresh-line'"
        :label="t(activeTab?.loading ? 'browser.stop' : 'browser.reload')"
        :disabled="!activeTab?.url"
        @click="runActive('refresh')"
      />
      <label
        class="mx-2 flex h-9.5 min-w-0 flex-1 items-center gap-2 rounded-xl border border-transparent bg-[var(--tx-fill-color-light)] px-3 transition-colors focus-within:border-[var(--tx-color-primary-light-5)] focus-within:bg-[var(--tx-bg-color)] focus-within:ring-2 focus-within:ring-[var(--tx-color-primary)]"
      >
        <span
          :class="
            activeTab?.url?.startsWith('tuff://')
              ? `${tabIcon(activeTab)} text-[var(--tx-color-primary)]`
              : activeTab?.url?.startsWith('https')
                ? 'i-ri-lock-2-line text-[var(--tx-color-success)]'
                : 'i-ri-global-line text-[var(--tx-text-color-secondary)]'
          "
          aria-hidden="true"
        />
        <input
          ref="addressInput"
          v-model="address"
          :aria-label="t('browser.address')"
          :placeholder="
            isStoreTab
              ? t('shell.store')
              : isSettingsTab
                ? t('shell.setting')
                : t('browser.addressPlaceholder')
          "
          :disabled="!activeTab"
          spellcheck="false"
          autocomplete="off"
          class="h-full w-full min-w-0 border-0 bg-transparent text-sm text-[var(--tx-text-color-primary)] outline-none placeholder:text-[var(--tx-text-color-regular)]"
          @focus="onAddressFocus"
          @blur="addressFocused = false"
          @keydown="navigateAddress"
        />
      </label>
      <TxIconButton
        :icon="bookmarked ? 'i-ri-star-fill' : 'i-ri-star-line'"
        :label="t(bookmarked ? 'browser.removeBookmark' : 'browser.addBookmark')"
        :pressed="bookmarked"
        :disabled="!activeTab?.url"
        @click="runActive('bookmark')"
      />
      <TxIconButton
        icon="i-ri-chrome-line"
        :label="
          chromeProfile
            ? t('browser.saveToChrome', { profile: chromeProfile.label })
            : t('browser.saveToChromeUnavailable')
        "
        :disabled="!canSaveToChrome"
        @click="chromeSaveOpen = true"
      />
      <div
        v-if="canSyncCookies"
        class="flex items-center gap-0.5 rounded-lg bg-[var(--tx-fill-color-light)] px-1 py-0.5"
      >
        <TxIconButton
          icon="i-ri-key-line"
          size="sm"
          :label="
            isChromeConnected
              ? t('browser.syncCookiesFromChrome', { profile: chromeProfile?.label })
              : t('browser.syncCookiesUnavailable')
          "
          :loading="syncingCookies"
          @click="syncCurrentCookies"
        />
        <button
          type="button"
          class="flex h-6 w-5 items-center justify-center rounded text-xs text-[var(--tx-text-color-secondary)] hover:text-[var(--tx-text-color-primary)] cursor-pointer"
          :title="t('browser.cookies.modalTitle')"
          @click="cookieDialogOpen = true"
        >
          <span class="i-ri-more-2-line text-xs" />
        </button>
      </div>
      <div
        class="flex items-center gap-1 rounded-lg border border-[var(--tx-border-color-light)] bg-[var(--tx-fill-color-light)]/80 px-2 py-1 text-xs text-[var(--tx-text-color-regular)] select-none"
        :title="t('browser.egoIndicator') || 'Ego 自动化助手已就绪'"
      >
        <span class="i-ri-flashlight-line text-[var(--tx-color-primary)]" />
        <span class="font-medium text-[var(--tx-text-color-primary)]">Ego</span>
      </div>
      <TxIconButton
        icon="i-ri-layout-right-line"
        :label="t('browser.library')"
        :pressed="Boolean(panel)"
        @click="panel = panel ? null : 'history'"
      />
    </div>

    <div
      v-if="error"
      role="alert"
      class="flex flex-none items-center gap-3 bg-[var(--tx-color-danger-light-9)] px-5 py-3 text-sm"
    >
      <span class="min-w-0 flex-1 break-words">{{ t('browser.actionFailed') }} {{ error }}</span>
      <TxButton size="sm" variant="ghost" @click="retry">{{ t('browser.retry') }}</TxButton>
    </div>

    <div
      id="browser-viewport"
      ref="viewport"
      role="tabpanel"
      :aria-labelledby="activeTab ? `browser-tab-${activeTab.id}` : undefined"
      :aria-busy="connecting || activeTab?.loading || undefined"
      class="relative min-h-0 min-w-0 flex-1 overflow-hidden"
    >
      <!-- Frozen snapshot layer: seamlessly shows the last frame when WebContentsView is suspended/hidden -->
      <div
        v-if="currentSnapshot && isSuspended"
        class="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        <img
          :src="currentSnapshot"
          class="h-full w-full object-cover select-none transition-all duration-200"
          :class="{
            'filter blur-md brightness-90 scale-[1.02]':
              overlayOpen ||
              cookieDialogOpen ||
              chromeSaveOpen ||
              panel ||
              accountOpen ||
              pluginToolbarOpen
          }"
        />
        <div
          v-if="
            overlayOpen ||
            cookieDialogOpen ||
            chromeSaveOpen ||
            panel ||
            accountOpen ||
            pluginToolbarOpen
          "
          class="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        />
      </div>
      <div
        v-if="connecting && !state"
        class="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-7 px-8"
        :aria-label="t('browser.loading')"
      >
        <TxSkeleton :width="58" :height="58" :radius="29" />
        <TxSkeleton :width="280" :height="32" :radius="8" />
        <TxSkeleton width="100%" :height="130" :radius="16" />
      </div>
      <HomePage
        v-if="state"
        v-show="isLandingTab && !panel"
        browser-landing
        :browser-active="onRoute && isLandingTab && !panel"
        :browser-navigate="navigate"
        style="--home-chat-lane-width: min(920px, calc(100% - 64px))"
      >
        <template #browser-footer>
          <!-- Top Sites / 快捷常用站点 -->
          <div
            class="mt-6 flex flex-wrap items-center justify-center gap-6"
            :aria-label="t('browser.shortcuts')"
          >
            <button
              v-for="site in shortcuts"
              :key="site.url"
              type="button"
              class="group flex flex-col items-center gap-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--tx-color-primary)] rounded-xl"
              @click="navigate(site.url).catch(() => {})"
            >
              <div
                class="flex h-13 w-13 items-center justify-center rounded-2xl border border-[var(--tx-border-color-light)] bg-[var(--tx-fill-color-light)] shadow-xs transition-all duration-200 group-hover:scale-105 group-hover:border-[var(--tx-color-primary-light-5)] group-hover:bg-[var(--tx-fill-color)] group-hover:shadow-md"
              >
                <span
                  class="inline-flex h-6 w-6 transition-transform group-hover:scale-110"
                  :class="site.icon"
                  :style="{ color: site.color !== 'currentColor' ? site.color : undefined }"
                  aria-hidden="true"
                />
              </div>
              <span
                class="text-xs font-medium text-[var(--tx-text-color-secondary)] transition-colors group-hover:text-[var(--tx-text-color-primary)]"
              >
                {{ site.title }}
              </span>
            </button>
          </div>

          <!-- 继续上次工作现场 / 历史现场 -->
          <section class="mt-9 w-full" :aria-label="t('browser.recent')">
            <div class="mb-3 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="i-ri-history-line text-sm text-[var(--tx-text-color-secondary)]" />
                <h2 class="m-0 text-sm font-medium text-[var(--tx-text-color-primary)]">
                  {{ t('browser.recentWorkspaces') || t('browser.recent') }}
                </h2>
              </div>
              <TxButton
                v-if="state.recent.length"
                variant="ghost"
                size="sm"
                @click="panel = 'history'"
                >{{ t('browser.showAll') }}</TxButton
              >
            </div>
            <div v-if="state.recent.length" class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <button
                v-for="page in state.recent.slice(0, 4)"
                :key="page.url"
                type="button"
                class="group flex min-w-0 items-center gap-3.5 rounded-xl border border-[var(--tx-border-color-light)] bg-[var(--tx-fill-color-light)]/50 p-3 text-left transition-all duration-150 hover:border-[var(--tx-border-color)] hover:bg-[var(--tx-fill-color-light)] hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--tx-color-primary)] cursor-pointer"
                :title="page.url"
                @click="openSaved(page)"
              >
                <span
                  class="inline-flex h-10 w-10 flex-none items-center justify-center rounded-lg border border-[var(--tx-border-color-light)] bg-[var(--tx-bg-color)] text-[var(--tx-color-primary)] shadow-2xs group-hover:scale-105 transition-transform"
                >
                  <span
                    class="inline-flex h-5 w-5"
                    :class="localIcon(page.url)"
                    aria-hidden="true"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span
                    class="block truncate text-sm font-medium text-[var(--tx-text-color-primary)] group-hover:text-[var(--tx-color-primary)] transition-colors"
                  >
                    {{ page.title || page.url }}
                  </span>
                  <span
                    class="mt-0.5 flex items-center gap-2 text-xs text-[var(--tx-text-color-regular)]"
                  >
                    <span class="truncate max-w-[180px]">{{ page.url }}</span>
                    <span>·</span>
                    <span class="shrink-0">{{ dateLabel(page) }}</span>
                  </span>
                </span>
                <span
                  class="i-ri-arrow-right-s-line flex-none text-lg text-[var(--tx-text-color-secondary)] opacity-40 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                />
              </button>
            </div>
            <div
              v-else
              class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--tx-border-color-light)] py-6 text-center text-xs text-[var(--tx-text-color-regular)]"
            >
              <span
                class="i-ri-compass-3-line mb-1 text-xl text-[var(--tx-text-color-secondary)]/50"
              />
              <span>{{ t('browser.recentEmpty') }}</span>
            </div>
          </section>
        </template>
      </HomePage>

      <!-- 插件商店 Tab -->
      <div
        v-if="state && isStoreTab && !panel"
        class="h-full w-full overflow-y-auto bg-[var(--tx-bg-color)]"
      >
        <Store />
      </div>

      <!-- 设置中心 Tab -->
      <div
        v-if="state && isSettingsTab && !panel"
        class="h-full w-full overflow-hidden bg-[var(--tx-bg-color)]"
      >
        <BrowserSettingsTab />
      </div>
      <section
        v-if="panel"
        class="absolute inset-0 overflow-y-auto bg-[var(--tx-bg-color)] px-6 py-5"
        :aria-label="
          t(
            panel === 'history'
              ? 'browser.history'
              : panel === 'chrome'
                ? 'browser.chromeLibrary'
                : 'browser.bookmarks'
          )
        "
      >
        <div class="mx-auto max-w-3xl">
          <div class="mb-5 flex items-center justify-between gap-3">
            <div class="flex gap-2">
              <TxButton
                :variant="panel === 'history' ? 'flat' : 'ghost'"
                :aria-pressed="panel === 'history'"
                icon="i-ri-history-line"
                @click="panel = 'history'"
                >{{ t('browser.history') }}</TxButton
              >
              <TxButton
                :variant="panel === 'bookmarks' ? 'flat' : 'ghost'"
                :aria-pressed="panel === 'bookmarks'"
                icon="i-ri-star-line"
                @click="panel = 'bookmarks'"
                >{{ t('browser.bookmarks') }}</TxButton
              >
              <TxButton
                :variant="panel === 'chrome' ? 'flat' : 'ghost'"
                :aria-pressed="panel === 'chrome'"
                icon="i-ri-chrome-line"
                @click="panel = 'chrome'"
                >{{ t('browser.chromeLibrary') }}</TxButton
              >
            </div>
            <TxIconButton
              icon="i-ri-close-line"
              :label="t('browser.closeLibrary')"
              @click="panel = null"
            />
          </div>
          <ChromeLibraryPanel
            v-if="panel === 'chrome'"
            :active="onRoute"
            :current-page="currentPage"
            :open-in-tuff="openCopyInTuff"
          />
          <p
            v-else-if="!savedPages.length"
            class="py-8 text-center text-sm text-[var(--tx-text-color-regular)]"
          >
            {{ t(panel === 'bookmarks' ? 'browser.bookmarksEmpty' : 'browser.recentEmpty') }}
          </p>
          <template v-else>
            <button
              v-for="page in savedPages"
              :key="page.url"
              type="button"
              class="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--tx-fill-color-light)] focus-visible:outline-2 focus-visible:outline-[var(--tx-color-primary)]"
              @click="openSaved(page)"
            >
              <span
                class="inline-flex h-5 w-5 flex-none"
                :class="localIcon(page.url)"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1"
                ><span class="block truncate text-sm">{{ page.title || page.url }}</span
                ><span class="block truncate text-xs text-[var(--tx-text-color-regular)]">{{
                  page.url
                }}</span></span
              >
              <span class="flex-none text-xs text-[var(--tx-text-color-regular)]">{{
                dateLabel(page)
              }}</span>
            </button>
          </template>
        </div>
      </section>
      <div
        v-else-if="activeTab?.error"
        role="alert"
        class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--tx-bg-color)] px-8 text-center"
      >
        <span class="i-ri-error-warning-line inline-flex h-8 w-8" aria-hidden="true" />
        <h1 class="m-0 text-xl font-semibold">{{ t('browser.pageFailed') }}</h1>
        <p class="m-0 max-w-lg break-words text-sm text-[var(--tx-text-color-regular)]">
          {{ activeTab.error }}
        </p>
        <TxButton icon="i-ri-refresh-line" @click="runActive('reload')">{{
          t('browser.retry')
        }}</TxButton>
      </div>
      <div
        v-else-if="activeTab?.loading && !localPage"
        role="status"
        class="pointer-events-none absolute inset-x-0 top-0"
      >
        <span class="sr-only">{{ t('browser.loading') }}</span>
        <TxSkeleton width="100%" :height="3" :radius="0" />
      </div>
    </div>
    <TxContextMenu
      ref="tabMenu"
      v-model="tabMenuOpen"
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
        <TxContextMenuItem
          :disabled="tabMenuIndex <= 0"
          @select="selectTabMenuAction('close-left')"
        >
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
    <ChromeBookmarkDialog
      v-if="chromeProfile"
      v-model="chromeSaveOpen"
      mode="save-page"
      :profile="chromeProfile"
      :page="currentPage"
    />
    <ChromeCookieDialog
      v-model="cookieDialogOpen"
      :url="activeTab?.url ?? ''"
      :domain="currentDomain"
      @sync-success="onCookieSyncSuccess"
    />
  </section>
</template>
