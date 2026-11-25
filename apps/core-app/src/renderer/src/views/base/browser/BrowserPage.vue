<script setup lang="ts">
import type {
  BrowserSavedPage,
  BrowserViewportRequest
} from '@talex-touch/utils/transport/sdk/domains/browser'
import { createBrowserSdk } from '@talex-touch/utils/transport/sdk/domains/browser'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { TxButton, TxIconButton } from '@talex-touch/tuffex/button'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch
} from 'vue'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import {
  formatSiteHost,
  localIcon,
  localIconColor,
  shortcuts,
  tabIcon
} from '~/modules/browser-workspace/tab-presentation'
import {
  buildBrowserFilePreviewUrl,
  parseBrowserFilePreviewUrl
} from '~/modules/browser-workspace/preview-url'
import { useBrowserWorkspace } from '~/modules/browser-workspace/useBrowserWorkspace'
import WorkspaceFileViewer from '~/components/preview/WorkspaceFileViewer.vue'
import {
  isOpenableBrowserUrl,
  useBrowserConnection
} from '~/modules/browser-connection/useBrowserConnection'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { themeStyle } from '~/modules/storage/theme-style'
import { registerMainWindowCommandHandlers } from '~/modules/shortcuts/main-window-shortcuts'
import { commandModifierHeld } from '~/modules/shortcuts/shortcut-chord'
import Store from '~/views/base/Store.vue'
import HomePage from '../home/HomePage.vue'
import BrowserSettingsTab from './BrowserSettingsTab.vue'
import ChromeBookmarkDialog from './ChromeBookmarkDialog.vue'
import ChromeLibraryPanel from './ChromeLibraryPanel.vue'
import ChromeCookieDialog from './ChromeCookieDialog.vue'
import { describeBrowserError } from './browser-errors'

const { t, locale } = useI18n()
const route = useRoute()
const { isMac } = useRendererPlatform()
const sdk = createBrowserSdk(useTuffTransport())
const {
  state,
  connecting,
  error,
  tabMenuOpen,
  addTabMenuOpen,
  pluginToolbarOpen,
  accountOpen,
  command,
  retryWorkspace
} = useBrowserWorkspace()
const address = ref('')
const addressFocused = ref(false)
const addressInput = ref<HTMLInputElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const surfaceActive = ref(true)
const panel = ref<'history' | 'bookmarks' | 'chrome' | null>(null)
const overlayOpen = ref(false)
// Floating layers outside this template's DOM observer reach: the shell avatar (popover and the
// account dialog) and the "save to Chrome" form. Both report synchronously so the guest hides first.
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
const previewTarget = computed(() => parseBrowserFilePreviewUrl(activeTab.value?.url))
const isPreviewTab = computed(() => Boolean(previewTarget.value))
const previewRefreshToken = ref(0)
const previewHistory = ref<Record<string, string[]>>({})
const canGoBackPreview = computed(() => {
  const tabId = activeTab.value?.id
  return Boolean(tabId && (previewHistory.value[tabId]?.length ?? 0) > 0)
})
let previewNavPending = false
const localPage = computed(
  () => isLandingTab.value || isStoreTab.value || isSettingsTab.value || isPreviewTab.value
)
const hasStoreTab = computed(
  () => state.value?.tabs.some((tab) => tab.url.startsWith('tuff://store')) ?? false
)
const hasSettingsTab = computed(
  () =>
    state.value?.tabs.some(
      (tab) => tab.url.startsWith('tuff://setting') || tab.url.startsWith('tuff://settings')
    ) ?? false
)
const storeMounted = ref(false)
const settingsMounted = ref(false)
const tabDirection = ref<'forward' | 'backward'>('forward')
const landingReplay = ref<{ style: 'forward' | 'back' | 'fade' | 'zoom'; phase: 'a' | 'b' } | null>(
  null
)
let lastActiveTabIndex = -1
let lastActiveTabWasLanding = false

watch(
  [isStoreTab, hasStoreTab],
  ([active, exists]) => {
    if (active) storeMounted.value = true
    else if (!exists) storeMounted.value = false
  },
  { immediate: true }
)
watch(
  [isSettingsTab, hasSettingsTab],
  ([active, exists]) => {
    if (active) settingsMounted.value = true
    else if (!exists) settingsMounted.value = false
  },
  { immediate: true }
)
watch(
  () => [state.value?.activeTabId, state.value?.tabs] as const,
  ([id, tabs], previous) => {
    const previousId = previous?.[0]
    const nextIndex = id && tabs ? tabs.findIndex((tab) => tab.id === id) : -1
    const nextTab = nextIndex >= 0 && tabs ? tabs[nextIndex] : undefined
    const nextIsLanding = Boolean(nextTab && !nextTab.url)
    if (previousId && id && id !== previousId) {
      if (lastActiveTabIndex >= 0 && nextIndex >= 0 && nextIndex !== lastActiveTabIndex) {
        tabDirection.value = nextIndex < lastActiveTabIndex ? 'backward' : 'forward'
      }
      if (lastActiveTabWasLanding && nextIsLanding && !panel.value) {
        const routeStyle = themeStyle.value?.theme?.transition?.route ?? 'slide'
        const style: 'forward' | 'back' | 'fade' | 'zoom' =
          routeStyle === 'fade'
            ? 'fade'
            : routeStyle === 'zoom'
              ? 'zoom'
              : tabDirection.value === 'backward'
                ? 'back'
                : 'forward'
        landingReplay.value = {
          style,
          phase: landingReplay.value?.phase === 'a' ? 'b' : 'a'
        }
      }
    }
    if (nextIndex >= 0) lastActiveTabIndex = nextIndex
    lastActiveTabWasLanding = nextIsLanding
  },
  { immediate: true }
)

const tabTransitionName = computed(() => {
  const style = themeStyle.value?.theme?.transition?.route ?? 'slide'
  if (style === 'fade') return 'browser-tab-fade'
  if (style === 'zoom') return 'browser-tab-zoom'
  return tabDirection.value === 'backward' ? 'browser-tab-slide-back' : 'browser-tab-slide-forward'
})

const landingReplayClass = computed(() =>
  landingReplay.value
    ? `is-landing-replay-${landingReplay.value.style}-${landingReplay.value.phase}`
    : ''
)

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
    for (const id of Object.keys(snapshots.value)) {
      if (!openIds.has(id)) delete snapshots.value[id]
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
    if (route.path !== '/browser') return
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
    addTabMenuOpen.value ||
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
      if (!disposed && res?.snapshot && state.value?.tabs.some((tab) => tab.id === tabId)) {
        snapshots.value[tabId] = res.snapshot
      }
    })
  }
})
function retry(): void {
  lastViewport = ''
  retryWorkspace()
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

function focusAddress(): void {
  if (!onRoute.value) return
  if (addressInput.value) {
    addressInput.value.focus()
    addressInput.value.select()
    return
  }
  void nextTick(() => {
    if (!onRoute.value || isSettingsTab.value || isStoreTab.value || isPreviewTab.value) return
    addressInput.value?.focus()
    addressInput.value?.select()
  })
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

async function navigatePreviewFile(payload: { path: string; displayPath: string }): Promise<void> {
  const tab = activeTab.value
  if (!tab || previewNavPending) return
  const tabId = tab.id
  const previousUrl = tab.url
  const nextUrl = buildBrowserFilePreviewUrl({
    path: payload.path,
    conversationId: previewTarget.value?.conversationId
  })
  if (nextUrl === previousUrl) return
  previewNavPending = true
  try {
    const accepted = await command(() => sdk.navigate(tabId, nextUrl))
    if (!accepted) return
    const liveTab = state.value?.tabs.find((item) => item.id === tabId)
    if (!liveTab || !parseBrowserFilePreviewUrl(liveTab.url)) return
    const nextStack = [...(previewHistory.value[tabId] ?? []), previousUrl].slice(-50)
    previewHistory.value = { ...previewHistory.value, [tabId]: nextStack }
  } finally {
    previewNavPending = false
  }
}

async function goBackPreview(): Promise<void> {
  const tab = activeTab.value
  if (!tab || previewNavPending) return
  const tabId = tab.id
  const stack = previewHistory.value[tabId]
  const previousUrl = stack?.[stack.length - 1]
  if (!previousUrl) return
  previewNavPending = true
  try {
    const accepted = await command(() => sdk.navigate(tabId, previousUrl))
    if (!accepted) return
    const currentStack = previewHistory.value[tabId] ?? []
    const remaining = currentStack.slice(0, -1)
    if (remaining.length > 0) {
      previewHistory.value = { ...previewHistory.value, [tabId]: remaining }
    } else {
      const next = { ...previewHistory.value }
      delete next[tabId]
      previewHistory.value = next
    }
  } finally {
    previewNavPending = false
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
let unsubscribeFocus: (() => void) | undefined
let disposeFocusCommand: (() => void) | undefined
let surfaceListenersAttached = false
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

function hasBlockingOverlay(): boolean {
  return Boolean(
    overlayOpen.value ||
    tabMenuOpen.value ||
    addTabMenuOpen.value ||
    pluginToolbarOpen.value ||
    accountOpen.value ||
    chromeSaveOpen.value ||
    cookieDialogOpen.value
  )
}

function measureViewport(): void {
  viewportFrame = 0
  if (
    !onRoute.value ||
    document.hidden ||
    localPage.value ||
    !activeTab.value?.url ||
    activeTab.value.error ||
    error.value ||
    panel.value ||
    hasBlockingOverlay() ||
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
    localPage.value ||
    hasBlockingOverlay() ||
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
    event.repeat ||
    event.isComposing ||
    event.keyCode === 229 ||
    hasBlockingOverlay()
  )
    return
  const modifier = commandModifierHeld(event, isMac.value) && !event.altKey
  const key = event.key.toLowerCase()
  if (modifier && !event.shiftKey && (event.code === 'KeyL' || key === 'l')) {
    if (isSettingsTab.value || isStoreTab.value) return
    event.preventDefault()
    focusAddress()
  } else if (modifier && !event.shiftKey && (event.code === 'KeyT' || key === 't')) {
    event.preventDefault()
    panel.value = null
    void command(() => sdk.createTab()).then((accepted) => {
      if (accepted) focusAddress()
    })
  } else if (
    modifier &&
    !event.shiftKey &&
    (event.code === 'KeyW' || key === 'w') &&
    activeTab.value
  ) {
    event.preventDefault()
    panel.value = null
    void command(() => sdk.closeTab(activeTab.value!.id))
  } else if (modifier && (event.code === 'KeyR' || key === 'r') && activeTab.value?.url) {
    event.preventDefault()
    if (isPreviewTab.value) {
      previewRefreshToken.value += 1
    } else {
      void command(() => sdk.reload(activeTab.value!.id))
    }
  } else if (event.key === 'Escape' && panel.value) {
    event.preventDefault()
    panel.value = null
  }
}

watch(
  () => [activeTab.value?.id, activeTab.value?.url],
  ([id], [previousId]) => {
    if (!addressFocused.value || id !== previousId) address.value = activeTab.value?.url ?? ''
    scheduleViewport()
  }
)
watch(
  () => state.value?.tabs,
  (tabs) => {
    const entries = Object.entries(previewHistory.value)
    if (entries.length === 0) return
    const livePreviewIds = new Set(
      (tabs ?? [])
        .filter((tab) => Boolean(parseBrowserFilePreviewUrl(tab.url)))
        .map((tab) => tab.id)
    )
    let changed = false
    const pruned: Record<string, string[]> = {}
    for (const [tabId, stack] of entries) {
      if (livePreviewIds.has(tabId)) {
        pruned[tabId] = stack
      } else {
        changed = true
      }
    }
    if (changed) previewHistory.value = pruned
  }
)
watch(
  [
    onRoute,
    panel,
    overlayOpen,
    tabMenuOpen,
    addTabMenuOpen,
    pluginToolbarOpen,
    accountOpen,
    chromeSaveOpen,
    cookieDialogOpen,
    error,
    () => activeTab.value?.error
  ],
  scheduleViewport,
  {
    flush: 'sync'
  }
)
// While the Browser landing tab hosts HomePage, ⌘L / Ctrl+L belongs to the browser address bar
// rather than the embedded chat composer. Register post-flush so it overrides HomePage's binding.
watch(
  () =>
    onRoute.value &&
    isLandingTab.value &&
    !panel.value &&
    !overlayOpen.value &&
    !tabMenuOpen.value &&
    !addTabMenuOpen.value &&
    !pluginToolbarOpen.value &&
    !accountOpen.value &&
    !chromeSaveOpen.value &&
    !cookieDialogOpen.value,
  (active) => {
    disposeFocusCommand?.()
    disposeFocusCommand = active
      ? registerMainWindowCommandHandlers([
          {
            id: 'focus-composer',
            enabled: () =>
              onRoute.value && !isSettingsTab.value && !isStoreTab.value && !hasBlockingOverlay(),
            run: focusAddress
          }
        ])
      : undefined
  },
  { immediate: true, flush: 'post' }
)
// A revoked or deselected profile unmounts the save form; its open flag must not keep the guest hidden.
watch(chromeProfile, (profile) => {
  if (!profile) chromeSaveOpen.value = false
})

function attachSurfaceListeners(): void {
  if (surfaceListenersAttached || disposed) return
  surfaceListenersAttached = true
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleViewport)
    if (viewport.value) resizeObserver.observe(viewport.value)
  }
  if (typeof MutationObserver !== 'undefined') {
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
                (node.matches(overlayMutationSelector) ||
                  node.querySelector(overlayMutationSelector))
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
  }
  updateOverlays()
  window.addEventListener('resize', scheduleViewport)
  window.addEventListener('scroll', scheduleViewport, true)
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('visibilitychange', scheduleViewport)
}

function detachSurfaceListeners(): void {
  if (!surfaceListenersAttached) return
  surfaceListenersAttached = false
  resizeObserver?.disconnect()
  resizeObserver = null
  overlayObserver?.disconnect()
  overlayObserver = null
  window.removeEventListener('resize', scheduleViewport)
  window.removeEventListener('scroll', scheduleViewport, true)
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('visibilitychange', scheduleViewport)
}

onMounted(() => {
  unsubscribeFocus = sdk.onFocusAddress(focusAddress)
  unsubscribeSnapshot = sdk.onSnapshot(({ tabId, snapshot }) => {
    if (!disposed && state.value?.tabs.some((tab) => tab.id === tabId)) {
      snapshots.value[tabId] = snapshot
    }
  })
  attachSurfaceListeners()
})
onActivated(() => {
  surfaceActive.value = true
  lastViewport = ''
  attachSurfaceListeners()
  void nextTick(scheduleViewport)
})
onDeactivated(() => {
  surfaceActive.value = false
  tabMenuOpen.value = false
  addTabMenuOpen.value = false
  pluginToolbarOpen.value = false
  chromeSaveOpen.value = false
  cookieDialogOpen.value = false
  disposeFocusCommand?.()
  disposeFocusCommand = undefined
  detachSurfaceListeners()
  hideViewport()
})
onBeforeUnmount(() => {
  disposed = true
  surfaceActive.value = false
  disposeFocusCommand?.()
  disposeFocusCommand = undefined
  hideViewport()
  unsubscribeFocus?.()
  unsubscribeSnapshot?.()
  detachSurfaceListeners()
  snapshots.value = {}
  autoSyncedTabDomains.clear()
  lastAutoSyncTimes.clear()
})
</script>

<template>
  <section
    class="flex h-full min-h-0 min-w-0 flex-col text-[var(--tx-text-color-primary)]"
    :aria-label="t('browser.label')"
    style="-webkit-app-region: no-drag; background: var(--tx-bg-color)"
  >
    <div
      v-if="!isSettingsTab && !isStoreTab && !isPreviewTab"
      class="BrowserPage-Toolbar flex h-12 flex-none items-center gap-1 px-3"
    >
      <TxIconButton
        icon="i-ri-arrow-left-line"
        size="sm"
        shape="circle"
        class="BrowserPage-ToolbarBtn"
        :label="t('browser.back')"
        :disabled="!activeTab?.canGoBack"
        @click="runActive('back')"
      />
      <TxIconButton
        icon="i-ri-arrow-right-line"
        size="sm"
        shape="circle"
        class="BrowserPage-ToolbarBtn"
        :label="t('browser.forward')"
        :disabled="!activeTab?.canGoForward"
        @click="runActive('forward')"
      />
      <TxIconButton
        :icon="activeTab?.loading ? 'i-ri-close-line' : 'i-ri-refresh-line'"
        size="sm"
        shape="circle"
        class="BrowserPage-ToolbarBtn"
        :label="t(activeTab?.loading ? 'browser.stop' : 'browser.reload')"
        :disabled="!activeTab?.url"
        @click="runActive('refresh')"
      />
      <label
        class="BrowserPage-AddressBox mx-1.5 flex h-8.5 min-w-0 flex-1 items-center gap-2 px-3.5"
      >
        <span
          class="flex-none text-sm"
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
          class="h-full w-full min-w-0 border-0 bg-transparent text-[13px] text-[var(--tx-text-color-primary)] outline-none placeholder:text-[var(--tx-text-color-secondary)]"
          @focus="onAddressFocus"
          @blur="addressFocused = false"
          @keydown="navigateAddress"
        />
      </label>
      <TxIconButton
        :icon="bookmarked ? 'i-ri-star-fill' : 'i-ri-star-line'"
        size="sm"
        shape="circle"
        class="BrowserPage-ToolbarBtn"
        :label="t(bookmarked ? 'browser.removeBookmark' : 'browser.addBookmark')"
        :pressed="bookmarked"
        :disabled="!activeTab?.url"
        @click="runActive('bookmark')"
      />
      <TxIconButton
        icon="i-ri-chrome-line"
        size="sm"
        shape="circle"
        class="BrowserPage-ToolbarBtn"
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
        class="BrowserPage-CookiePill flex items-center gap-0.5 px-1 py-0.5"
      >
        <TxIconButton
          icon="i-ri-key-line"
          size="sm"
          shape="circle"
          class="BrowserPage-ToolbarBtn"
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
          class="flex h-6 w-5 items-center justify-center rounded-full text-xs text-[var(--tx-text-color-secondary)] hover:text-[var(--tx-text-color-primary)] cursor-pointer"
          :title="t('browser.cookies.modalTitle')"
          @click="cookieDialogOpen = true"
        >
          <span class="i-ri-more-2-line text-xs" />
        </button>
      </div>
      <div
        class="BrowserPage-EgoChip flex h-7.5 items-center gap-1.5 px-2.5 text-xs text-[var(--tx-text-color-regular)] select-none"
        :title="t('browser.egoIndicator') || 'Ego 自动化助手已就绪'"
      >
        <span class="i-ri-flashlight-line text-[var(--tx-color-primary)]" />
        <span class="font-medium text-[var(--tx-text-color-primary)]">Ego</span>
      </div>
      <TxIconButton
        icon="i-ri-layout-right-line"
        size="sm"
        shape="circle"
        class="BrowserPage-ToolbarBtn"
        :label="t('browser.library')"
        :pressed="Boolean(panel)"
        @click="panel = panel ? null : 'history'"
      />
    </div>

    <!-- Route-gated so a leaving page drops its copy at once; the tab strip shows it elsewhere. -->
    <div
      v-if="error && onRoute"
      role="alert"
      class="flex flex-none items-center gap-3 bg-[var(--tx-color-danger-light-9)] px-5 py-3 text-sm"
    >
      <span class="min-w-0 flex-1 break-words">{{
        t('browser.actionFailedWithReason', { reason: describeBrowserError(error, t) })
      }}</span>
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
      <Transition :name="tabTransitionName">
        <div
          v-if="state"
          v-show="isLandingTab && !panel"
          class="BrowserPage-Surface BrowserPage-Surface--landing"
          :class="landingReplayClass"
        >
          <HomePage
            browser-landing
            :browser-active="onRoute && isLandingTab && !panel"
            :browser-navigate="navigate"
            style="--home-chat-lane-width: min(760px, calc(100% - 64px))"
          >
            <template #browser-footer>
              <div class="BrowserLanding-Footer">
                <!-- Top Sites / 快捷常用站点 -->
                <nav class="BrowserLanding-Shortcuts" :aria-label="t('browser.shortcuts')">
                  <button
                    v-for="site in shortcuts"
                    :key="site.url"
                    type="button"
                    class="BrowserLanding-ShortcutItem group"
                    :title="site.url"
                    @click="navigate(site.url).catch(() => {})"
                  >
                    <span class="BrowserLanding-ShortcutTile">
                      <span
                        class="BrowserLanding-ShortcutIcon"
                        :class="site.icon"
                        :style="{ color: site.color !== 'currentColor' ? site.color : undefined }"
                        aria-hidden="true"
                      />
                    </span>
                    <span class="BrowserLanding-ShortcutLabel">
                      {{ site.title }}
                    </span>
                  </button>
                </nav>

                <!-- 继续上次工作现场 / 历史现场 -->
                <section class="BrowserLanding-Recent" :aria-label="t('browser.recent')">
                  <div class="BrowserLanding-RecentHeader">
                    <div class="BrowserLanding-RecentHeading">
                      <span
                        class="i-ri-history-line BrowserLanding-RecentHeadingIcon"
                        aria-hidden="true"
                      />
                      <h2 class="BrowserLanding-RecentTitle">
                        {{ t('browser.recentWorkspaces') || t('browser.recent') }}
                      </h2>
                    </div>
                    <button
                      v-if="state.recent.length"
                      type="button"
                      class="BrowserLanding-ShowAll"
                      @click="panel = 'history'"
                    >
                      <span>{{ t('browser.showAll') }}</span>
                      <span class="i-ri-arrow-right-s-line text-sm" aria-hidden="true" />
                    </button>
                  </div>
                  <div v-if="state.recent.length" class="BrowserLanding-RecentGrid">
                    <button
                      v-for="page in state.recent.slice(0, 4)"
                      :key="page.url"
                      type="button"
                      class="BrowserLanding-RecentCard group"
                      :title="page.url"
                      @click="openSaved(page)"
                    >
                      <span class="BrowserLanding-RecentIcon">
                        <span
                          class="BrowserLanding-RecentGlyph"
                          :class="localIcon(page.url)"
                          :style="{ color: localIconColor(page.url) }"
                          aria-hidden="true"
                        />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="BrowserLanding-RecentCardTitle">
                          {{ page.title || formatSiteHost(page.url) }}
                        </span>
                        <span class="BrowserLanding-RecentCardMeta">
                          <span class="truncate">{{ formatSiteHost(page.url) }}</span>
                          <span aria-hidden="true">·</span>
                          <span class="shrink-0">{{ dateLabel(page) }}</span>
                        </span>
                      </span>
                      <span
                        class="BrowserLanding-RecentChevron i-ri-arrow-right-s-line"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  <div v-else class="BrowserLanding-RecentEmpty">
                    <span class="i-ri-compass-3-line text-lg opacity-50" aria-hidden="true" />
                    <span>{{ t('browser.recentEmpty') }}</span>
                  </div>
                </section>
              </div>
            </template>
          </HomePage>
        </div>
      </Transition>

      <!-- 插件商店 Tab -->
      <Transition :name="tabTransitionName">
        <div
          v-if="state && storeMounted"
          v-show="isStoreTab && !panel"
          class="BrowserPage-Surface overflow-y-auto"
        >
          <Store />
        </div>
      </Transition>

      <!-- 设置中心 Tab -->
      <Transition :name="tabTransitionName">
        <div
          v-if="state && settingsMounted"
          v-show="isSettingsTab && !panel"
          class="BrowserPage-Surface overflow-hidden"
        >
          <BrowserSettingsTab />
        </div>
      </Transition>

      <!-- 本地文件预览 Tab (`tuff://preview`) -->
      <Transition :name="tabTransitionName">
        <div
          v-if="state && isPreviewTab && previewTarget && !panel"
          class="BrowserPage-Surface overflow-hidden"
        >
          <WorkspaceFileViewer
            :file-path="previewTarget.path"
            :display-path="previewTarget.path"
            :conversation-id="previewTarget.conversationId ?? null"
            :line="previewTarget.line"
            :refresh-token="previewRefreshToken"
            :can-go-back="canGoBackPreview"
            :show-open-in-browser="false"
            @back="goBackPreview"
            @navigate="navigatePreviewFile"
          />
        </div>
      </Transition>
      <Transition name="browser-panel">
        <section
          v-if="panel"
          class="BrowserPage-Panel absolute inset-0 z-10 overflow-y-auto bg-[var(--tx-bg-color)] px-6 py-5"
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
                  :style="{ color: localIconColor(page.url) }"
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
      </Transition>
      <div
        v-if="!panel && activeTab?.error"
        role="alert"
        class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[var(--tx-bg-color)] px-8 text-center"
      >
        <span class="i-ri-error-warning-line inline-flex h-8 w-8" aria-hidden="true" />
        <h1 class="m-0 text-xl font-semibold">{{ t('browser.pageFailed') }}</h1>
        <p class="m-0 max-w-lg break-words text-sm text-[var(--tx-text-color-regular)]">
          {{ describeBrowserError(activeTab.error, t) }}
        </p>
        <TxButton icon="i-ri-refresh-line" @click="runActive('reload')">{{
          t('browser.retry')
        }}</TxButton>
      </div>
      <div
        v-else-if="!panel && activeTab?.loading && !localPage"
        role="status"
        class="pointer-events-none absolute inset-x-0 top-0"
      >
        <span class="sr-only">{{ t('browser.loading') }}</span>
        <TxSkeleton width="100%" :height="3" :radius="0" />
      </div>
    </div>
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

<style lang="scss" scoped>
@mixin browser-g2-capsule {
  border-radius: 999px;

  @supports (corner-shape: superellipse(2)) {
    border-radius: calc(12px * var(--tx-corner-smooth-scale, 1.6)) / 50%;
    corner-shape: var(--tx-corner-smooth-shape, superellipse(1.777));
  }
}

@mixin browser-g2-squircle($radius) {
  border-radius: $radius;

  @supports (corner-shape: superellipse(2)) {
    border-radius: calc(#{$radius} * var(--tx-corner-smooth-scale, 1.6));
    corner-shape: var(--tx-corner-smooth-shape, superellipse(1.777));
  }
}

.BrowserPage-Toolbar {
  border-bottom: 1px solid
    color-mix(in srgb, var(--shell-border, var(--tx-border-color-light)) 65%, transparent);
}

.BrowserPage-ToolbarBtn {
  --tx-icon-button-size: 32px;
  --tx-icon-button-radius: 999px;

  @supports (corner-shape: superellipse(2)) {
    corner-shape: var(--tx-corner-smooth-shape, superellipse(1.777));
  }

  :deep(.tx-icon-button__icon) {
    font-size: 1rem;
  }
}

.BrowserPage-AddressBox {
  @include browser-g2-capsule;
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-lighter) 80%, transparent);

  &:hover:not(:focus-within) {
    background: var(--tx-fill-color-light);
    box-shadow: inset 0 0 0 1px var(--tx-border-color-light);
  }

  &:focus-within {
    background: var(--tx-bg-color);
    box-shadow:
      inset 0 0 0 1.5px var(--tx-color-primary),
      0 0 0 3px color-mix(in srgb, var(--tx-color-primary) 16%, transparent);
  }
}

.BrowserPage-CookiePill,
.BrowserPage-EgoChip {
  @include browser-g2-capsule;
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-lighter) 80%, transparent);
}

.BrowserLanding-Footer {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: var(--home-chat-lane-width, min(760px, calc(100% - 64px)));
  max-width: 100%;
  margin: 12px auto 0;
  padding-bottom: 24px;
  box-sizing: border-box;
}

.BrowserLanding-Shortcuts {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

@media (max-width: 560px) {
  .BrowserLanding-Shortcuts {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.BrowserLanding-ShortcutItem {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--tx-text-color-regular);
  cursor: pointer;
  outline: none;

  &:focus-visible .BrowserLanding-ShortcutTile {
    box-shadow:
      inset 0 0 0 1.5px var(--tx-color-primary),
      0 0 0 2px color-mix(in srgb, var(--tx-color-primary) 18%, transparent);
  }
}

.BrowserLanding-ShortcutTile {
  @include browser-g2-squircle(14px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 78%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-lighter) 85%, transparent);
  transition: transform 160ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));

  .BrowserLanding-ShortcutItem:hover & {
    background: var(--tx-fill-color);
    box-shadow:
      inset 0 0 0 1px var(--tx-border-color-light),
      var(--tx-elevation-1);
    transform: translateY(-2px);
  }

  .BrowserLanding-ShortcutItem:active & {
    transform: translateY(0) scale(0.97);
  }
}

.BrowserLanding-ShortcutIcon {
  display: inline-flex;
  width: 22px;
  height: 22px;
  font-size: 22px;
  color: var(--tx-text-color-primary);
}

.BrowserLanding-ShortcutLabel {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tx-text-color-regular);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;

  .BrowserLanding-ShortcutItem:hover & {
    color: var(--tx-text-color-primary);
  }
}

.BrowserLanding-Recent {
  width: 100%;
  padding-top: 20px;
  border-top: 1px solid
    color-mix(in srgb, var(--shell-border, var(--tx-border-color-lighter)) 55%, transparent);
}

.BrowserLanding-RecentHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.BrowserLanding-RecentHeading {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.BrowserLanding-RecentHeadingIcon {
  flex: none;
  font-size: 14px;
  color: var(--tx-text-color-secondary);
}

.BrowserLanding-RecentTitle {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.BrowserLanding-ShowAll {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tx-text-color-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  cursor: pointer;
  outline: none;

  &:hover {
    background: color-mix(in srgb, var(--tx-fill-color) 70%, transparent);
    color: var(--tx-text-color-primary);
  }

  &:focus-visible {
    box-shadow: inset 0 0 0 1.5px var(--tx-color-primary);
  }
}

.BrowserLanding-RecentGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 600px) {
  .BrowserLanding-RecentGrid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.BrowserLanding-RecentCard {
  @include browser-g2-squircle(14px);
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 0;
  background: color-mix(in srgb, var(--tx-fill-color-light) 55%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-lighter) 80%, transparent);
  text-align: left;
  cursor: pointer;
  outline: none;

  &:hover {
    background: var(--tx-fill-color-light);
    box-shadow:
      inset 0 0 0 1px var(--tx-border-color-light),
      var(--tx-elevation-1);
  }

  &:focus-visible {
    box-shadow:
      inset 0 0 0 1.5px var(--tx-color-primary),
      0 0 0 2px color-mix(in srgb, var(--tx-color-primary) 18%, transparent);
  }
}

.BrowserLanding-RecentIcon {
  @include browser-g2-squircle(9px);
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--tx-bg-color);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-lighter) 85%, transparent);
  color: var(--tx-text-color-primary);
}

.BrowserLanding-RecentGlyph {
  display: inline-flex;
  width: 18px;
  height: 18px;
  font-size: 18px;
}

.BrowserLanding-RecentCardTitle {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tx-text-color-primary);
  font-size: var(--shell-fs-body, 13px);
  font-weight: 500;
  line-height: 1.4;
}

.BrowserLanding-RecentCardMeta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.BrowserLanding-RecentChevron {
  flex: none;
  font-size: 16px;
  color: var(--tx-text-color-secondary);
  opacity: 0.35;
  transition:
    opacity 140ms ease,
    transform 160ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));

  .BrowserLanding-RecentCard:hover & {
    opacity: 0.85;
    transform: translateX(2px);
  }
}

.BrowserLanding-RecentEmpty {
  @include browser-g2-squircle(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 16px;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 35%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-border-color-lighter) 75%, transparent);
}

.BrowserPage-Surface {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: var(--tx-bg-color);
}

.BrowserPage-Surface--landing {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.browser-tab-slide-forward-enter-active,
.browser-tab-slide-back-enter-active,
.browser-tab-fade-enter-active,
.browser-tab-zoom-enter-active {
  z-index: 2;
  transition:
    opacity 200ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 230ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
  will-change: opacity, transform;
}

.browser-tab-slide-forward-leave-active,
.browser-tab-slide-back-leave-active,
.browser-tab-fade-leave-active,
.browser-tab-zoom-leave-active {
  z-index: 1;
  pointer-events: none;
  transition:
    opacity 150ms ease,
    transform 170ms ease;
  will-change: opacity, transform;
}

.browser-tab-slide-forward-enter-from {
  opacity: 0;
  transform: translate3d(28px, 0, 0);
}

.browser-tab-slide-forward-leave-to {
  opacity: 0;
  transform: translate3d(-18px, 0, 0);
}

.browser-tab-slide-back-enter-from {
  opacity: 0;
  transform: translate3d(-28px, 0, 0);
}

.browser-tab-slide-back-leave-to {
  opacity: 0;
  transform: translate3d(18px, 0, 0);
}

.browser-tab-fade-enter-from,
.browser-tab-fade-leave-to {
  opacity: 0;
}

.browser-tab-zoom-enter-from {
  opacity: 0;
  transform: scale(0.985);
}

.browser-tab-zoom-leave-to {
  opacity: 0;
  transform: scale(1.012);
}

@each $phase in (a, b) {
  @keyframes browser-landing-forward-#{$phase} {
    from {
      opacity: 0;
      transform: translate3d(24px, 0, 0);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @keyframes browser-landing-back-#{$phase} {
    from {
      opacity: 0;
      transform: translate3d(-24px, 0, 0);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @keyframes browser-landing-fade-#{$phase} {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }

  @keyframes browser-landing-zoom-#{$phase} {
    from {
      opacity: 0;
      transform: scale(0.988);
    }

    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .is-landing-replay-forward-#{$phase} {
    animation: browser-landing-forward-#{$phase}
      210ms
      var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
  }

  .is-landing-replay-back-#{$phase} {
    animation: browser-landing-back-#{$phase}
      210ms
      var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
  }

  .is-landing-replay-fade-#{$phase} {
    animation: browser-landing-fade-#{$phase} 180ms ease;
  }

  .is-landing-replay-zoom-#{$phase} {
    animation: browser-landing-zoom-#{$phase}
      200ms
      var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
  }
}

.browser-panel-enter-active {
  transition:
    opacity 180ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 200ms var(--tx-ease-out-strong, cubic-bezier(0.22, 1, 0.36, 1));
}

.browser-panel-leave-active {
  pointer-events: none;
  transition:
    opacity 140ms ease,
    transform 150ms ease;
}

.browser-panel-enter-from,
.browser-panel-leave-to {
  opacity: 0;
  transform: translate3d(0, 10px, 0);
}

@media (prefers-reduced-motion: reduce) {
  .browser-tab-slide-forward-enter-active,
  .browser-tab-slide-forward-leave-active,
  .browser-tab-slide-back-enter-active,
  .browser-tab-slide-back-leave-active,
  .browser-tab-fade-enter-active,
  .browser-tab-fade-leave-active,
  .browser-tab-zoom-enter-active,
  .browser-tab-zoom-leave-active,
  .browser-panel-enter-active,
  .browser-panel-leave-active {
    transition: none;
  }

  .BrowserLanding-ShortcutTile,
  .BrowserLanding-RecentChevron,
  .BrowserPage-Surface--landing {
    transition: none;
    animation: none !important;
  }
}
</style>
