import type { StreamMarkdownCodePreview } from '@talex-touch/tuffex/stream-markdown'
import type { Ref } from 'vue'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, ref, watch } from 'vue'
import { basenameOfPath } from '~/modules/browser-workspace/preview-url'

export type SidePanelWorkspaceKind =
  | 'git'
  | 'review'
  | 'terminal'
  | 'outputs'
  | 'sources'
  | 'work'
  | 'context'
  | 'plugins'

export type SidePanelTab =
  | {
      id: string
      kind: 'file'
      title: string
      path: string
      displayPath: string
      line?: number
      refreshToken: number
    }
  | {
      id: string
      kind: 'web'
      title: string
      url: string
      favicon?: string | null
    }
  | {
      id: string
      kind: 'code'
      title: string
      lang: string
      srcdoc: string
    }
  | {
      id: string
      kind: SidePanelWorkspaceKind
      title: string
    }

export type SidePanelRecentItem =
  | {
      id: string
      kind: 'file'
      title: string
      path: string
      displayPath: string
      updatedAt: number
    }
  | {
      id: string
      kind: 'web'
      title: string
      url: string
      updatedAt: number
    }

export const SIDE_PANEL_DEFAULT_WIDTH = 460
export const SIDE_PANEL_MIN_WIDTH = 320
export const SIDE_PANEL_MAX_WIDTH = 840
/**
 * Minimum width reserved for the conversation column beside the docked side panel so the header,
 * message lane, and composer toolbar never get crushed or push controls out of the composer box.
 */
export const HOME_BODY_MIN_WIDTH = 480
const WIDTH_STORAGE_KEY = 'tuff.home.sidePanelWidth'
const STATE_STORAGE_KEY = 'tuff.home.sidePanelState.v1'
const RECENTS_STORAGE_KEY = 'tuff.home.sidePanelRecents.v1'
const MAX_PERSISTED_TABS = 20
const MAX_RECENT_ITEMS = 8
const TITLE_PATTERN = /<title[^>]*>([^<]*)<\/title>/i

const WORKSPACE_KINDS = new Set<SidePanelWorkspaceKind>([
  'git',
  'review',
  'terminal',
  'outputs',
  'sources',
  'work',
  'context',
  'plugins'
])

function isWorkspaceKind(value: unknown): value is SidePanelWorkspaceKind {
  return typeof value === 'string' && WORKSPACE_KINDS.has(value as SidePanelWorkspaceKind)
}

interface StoredSidePanelState {
  panelOpen: boolean
  activeTabId: string | null
  tabs: SidePanelTab[]
}

function sanitizeStoredTab(raw: unknown): SidePanelTab | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const title = typeof item.title === 'string' ? item.title.trim() : ''
  const kind = item.kind
  if (!id || !title || typeof kind !== 'string') return null

  if (kind === 'file') {
    const filePath = typeof item.path === 'string' ? item.path.trim() : ''
    if (!filePath) return null
    const displayPath =
      typeof item.displayPath === 'string' && item.displayPath.trim()
        ? item.displayPath.trim()
        : filePath
    const line = typeof item.line === 'number' && Number.isFinite(item.line) ? item.line : undefined
    return {
      id,
      kind: 'file',
      title,
      path: filePath,
      displayPath,
      ...(line !== undefined ? { line } : {}),
      refreshToken: 0
    }
  }

  if (kind === 'web') {
    const url = typeof item.url === 'string' ? item.url.trim() : ''
    const favicon = typeof item.favicon === 'string' ? item.favicon : null
    return {
      id,
      kind: 'web',
      title,
      url,
      favicon
    }
  }

  if (isWorkspaceKind(kind)) {
    return {
      id,
      kind,
      title
    }
  }

  return null
}

function readStoredPanelState(): StoredSidePanelState {
  if (!hasWindow()) return { panelOpen: false, activeTabId: null, tabs: [] }
  try {
    const raw = window.localStorage.getItem(STATE_STORAGE_KEY)
    if (!raw) return { panelOpen: false, activeTabId: null, tabs: [] }
    const parsed = JSON.parse(raw) as Partial<StoredSidePanelState> | null
    if (!parsed || typeof parsed !== 'object') {
      return { panelOpen: false, activeTabId: null, tabs: [] }
    }

    const seenIds = new Set<string>()
    const tabs: SidePanelTab[] = []
    if (Array.isArray(parsed.tabs)) {
      for (const candidate of parsed.tabs) {
        const clean = sanitizeStoredTab(candidate)
        if (!clean || seenIds.has(clean.id)) continue
        seenIds.add(clean.id)
        tabs.push(clean)
        if (tabs.length >= MAX_PERSISTED_TABS) break
      }
    }

    const rawActiveId = typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null
    const activeTabId = rawActiveId && seenIds.has(rawActiveId) ? rawActiveId : null
    const panelOpen = parsed.panelOpen === true

    return { panelOpen, activeTabId, tabs }
  } catch {
    return { panelOpen: false, activeTabId: null, tabs: [] }
  }
}

function writeStoredPanelState(state: StoredSidePanelState): void {
  if (!hasWindow()) return
  try {
    const serializableTabs = state.tabs
      .filter((tab) => tab.kind !== 'code')
      .slice(0, MAX_PERSISTED_TABS)
    const activeTabId =
      state.activeTabId && serializableTabs.some((tab) => tab.id === state.activeTabId)
        ? state.activeTabId
        : null
    window.localStorage.setItem(
      STATE_STORAGE_KEY,
      JSON.stringify({
        panelOpen: state.panelOpen,
        activeTabId,
        tabs: serializableTabs
      })
    )
  } catch {
    // ignore storage failures
  }
}

function readStoredRecents(): SidePanelRecentItem[] {
  if (!hasWindow()) return []
  try {
    const raw = window.localStorage.getItem(RECENTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    const recents: SidePanelRecentItem[] = []
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const item = entry as Record<string, unknown>
      const updatedAt =
        typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : 0
      if (item.kind === 'file') {
        const filePath = typeof item.path === 'string' ? item.path.trim() : ''
        if (!filePath) continue
        const key = `file:${filePath}`
        if (seen.has(key)) continue
        seen.add(key)
        const displayPath =
          typeof item.displayPath === 'string' && item.displayPath.trim()
            ? item.displayPath.trim()
            : filePath
        const title =
          typeof item.title === 'string' && item.title.trim()
            ? item.title.trim()
            : basenameOfPath(displayPath)
        recents.push({ id: key, kind: 'file', title, path: filePath, displayPath, updatedAt })
      } else if (item.kind === 'web') {
        const url = typeof item.url === 'string' ? item.url.trim() : ''
        if (!url) continue
        const key = `web:${url}`
        if (seen.has(key)) continue
        seen.add(key)
        const title =
          typeof item.title === 'string' && item.title.trim()
            ? item.title.trim()
            : formatHostTitle(url)
        recents.push({ id: key, kind: 'web', title, url, updatedAt })
      }
      if (recents.length >= MAX_RECENT_ITEMS) break
    }
    return recents
  } catch {
    return []
  }
}

function writeStoredRecents(items: SidePanelRecentItem[]): void {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(
      RECENTS_STORAGE_KEY,
      JSON.stringify(items.slice(0, MAX_RECENT_ITEMS))
    )
  } catch {
    // ignore storage failures
  }
}

function computeInitialSequence(tabs: SidePanelTab[]): number {
  let maxSeq = 0
  for (const tab of tabs) {
    const match = /^side-(?:file|web|code)-(\d+)$/.exec(tab.id)
    if (match?.[1]) {
      const value = Number(match[1])
      if (Number.isFinite(value) && value > maxSeq) maxSeq = value
    }
  }
  return maxSeq
}

export function clampSidePanelWidth(value: number, containerWidth?: number): number {
  const hasContainer =
    typeof containerWidth === 'number' && Number.isFinite(containerWidth) && containerWidth > 0
  const maxByContainer = hasContainer
    ? Math.max(
        SIDE_PANEL_MIN_WIDTH,
        Math.min(
          Math.floor(containerWidth * 0.68),
          Math.floor(containerWidth - HOME_BODY_MIN_WIDTH)
        )
      )
    : SIDE_PANEL_MAX_WIDTH
  const upper = Math.min(SIDE_PANEL_MAX_WIDTH, maxByContainer)
  if (!Number.isFinite(value)) return Math.min(SIDE_PANEL_DEFAULT_WIDTH, upper)
  return Math.max(SIDE_PANEL_MIN_WIDTH, Math.min(upper, Math.round(value)))
}

function readStoredWidth(): number {
  if (!hasWindow()) return SIDE_PANEL_DEFAULT_WIDTH
  try {
    const raw = window.localStorage.getItem(WIDTH_STORAGE_KEY)
    if (!raw) return SIDE_PANEL_DEFAULT_WIDTH
    const parsed = Number(raw)
    return Number.isFinite(parsed)
      ? clampSidePanelWidth(parsed, window.innerWidth)
      : SIDE_PANEL_DEFAULT_WIDTH
  } catch {
    return SIDE_PANEL_DEFAULT_WIDTH
  }
}

function writeStoredWidth(width: number): void {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width))
  } catch {
    // ignore storage failures
  }
}

function formatHostTitle(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '') || url
  } catch {
    return url
  }
}

export interface UseHomeSidePanelOptions {
  /**
   * Combined horizontal width (px) shared by the conversation pane and the docked side panel.
   * Falls back to `window.innerWidth` when omitted or unavailable.
   */
  getAvailableWidth?: () => number | undefined
}

export function useHomeSidePanel(
  conversationId: Ref<string | null>,
  options: UseHomeSidePanelOptions = {}
) {
  const initialState = readStoredPanelState()
  const panelOpen = ref(initialState.panelOpen)
  const panelWidth = ref<number>(readStoredWidth())
  const isResizing = ref(false)
  const tabs = ref<SidePanelTab[]>(initialState.tabs)
  /** `null` displays the Launcher / New Tab hub inside the docked right sidebar. */
  const activeTabId = ref<string | null>(initialState.activeTabId)
  const recentItems = ref<SidePanelRecentItem[]>(readStoredRecents())

  const codeNumbering = new Map<string, number>()
  let sequence = computeInitialSequence(initialState.tabs)

  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null)

  function recordRecentFile(path: string, displayPath: string): void {
    const cleanPath = path.trim()
    if (!cleanPath) return
    const cleanDisplay = displayPath.trim() || cleanPath
    const entry: SidePanelRecentItem = {
      id: `file:${cleanPath}`,
      kind: 'file',
      title: basenameOfPath(cleanDisplay),
      path: cleanPath,
      displayPath: cleanDisplay,
      updatedAt: Date.now()
    }
    recentItems.value = [entry, ...recentItems.value.filter((item) => item.id !== entry.id)].slice(
      0,
      MAX_RECENT_ITEMS
    )
    writeStoredRecents(recentItems.value)
  }

  function recordRecentWeb(url: string, title?: string): void {
    const cleanUrl = url.trim()
    if (!cleanUrl) return
    const entry: SidePanelRecentItem = {
      id: `web:${cleanUrl}`,
      kind: 'web',
      title: title?.trim() || formatHostTitle(cleanUrl),
      url: cleanUrl,
      updatedAt: Date.now()
    }
    recentItems.value = [entry, ...recentItems.value.filter((item) => item.id !== entry.id)].slice(
      0,
      MAX_RECENT_ITEMS
    )
    writeStoredRecents(recentItems.value)
  }

  function removeRecentItem(id: string): void {
    recentItems.value = recentItems.value.filter((item) => item.id !== id)
    writeStoredRecents(recentItems.value)
  }

  function clearRecentItems(): void {
    recentItems.value = []
    writeStoredRecents([])
  }

  function resolveContainerWidth(): number | undefined {
    const width = options.getAvailableWidth?.()
    if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
      return width
    }
    return hasWindow() ? window.innerWidth : undefined
  }

  function openLauncher(): void {
    activeTabId.value = null
    panelOpen.value = true
  }

  function openFileTab(payload: { path: string; displayPath?: string; line?: number }): string {
    const normalizedPath = payload.path.trim()
    if (!normalizedPath) return ''
    const displayPath = payload.displayPath?.trim() || normalizedPath
    recordRecentFile(normalizedPath, displayPath)
    const existing = tabs.value.find(
      (tab): tab is Extract<SidePanelTab, { kind: 'file' }> =>
        tab.kind === 'file' && tab.path === normalizedPath
    )
    if (existing) {
      tabs.value = tabs.value.map((tab) =>
        tab.id === existing.id && tab.kind === 'file'
          ? {
              ...tab,
              displayPath,
              ...(payload.line !== undefined ? { line: payload.line } : {}),
              refreshToken: tab.refreshToken + 1
            }
          : tab
      )
      activeTabId.value = existing.id
      panelOpen.value = true
      return existing.id
    }
    const id = `side-file-${++sequence}`
    const title = basenameOfPath(displayPath)
    tabs.value = [
      ...tabs.value,
      {
        id,
        kind: 'file',
        title,
        path: normalizedPath,
        displayPath,
        ...(payload.line !== undefined ? { line: payload.line } : {}),
        refreshToken: 0
      }
    ]
    activeTabId.value = id
    panelOpen.value = true
    return id
  }

  function openWebTab(payload: { url: string; title?: string }): string {
    const url = payload.url.trim()
    if (!url) return ''
    recordRecentWeb(url, payload.title)
    const existing = tabs.value.find(
      (tab): tab is Extract<SidePanelTab, { kind: 'web' }> => tab.kind === 'web' && tab.url === url
    )
    if (existing) {
      activeTabId.value = existing.id
      panelOpen.value = true
      return existing.id
    }
    const id = `side-web-${++sequence}`
    tabs.value = [
      ...tabs.value,
      {
        id,
        kind: 'web',
        title: payload.title?.trim() || formatHostTitle(url),
        url,
        favicon: null
      }
    ]
    activeTabId.value = id
    panelOpen.value = true
    return id
  }

  function openBlankWebTab(title = 'Browser'): string {
    const existingBlank = tabs.value.find(
      (tab): tab is Extract<SidePanelTab, { kind: 'web' }> => tab.kind === 'web' && !tab.url
    )
    if (existingBlank) {
      activeTabId.value = existingBlank.id
      panelOpen.value = true
      return existingBlank.id
    }
    const id = `side-web-${++sequence}`
    tabs.value = [
      ...tabs.value,
      {
        id,
        kind: 'web',
        title,
        url: '',
        favicon: null
      }
    ]
    activeTabId.value = id
    panelOpen.value = true
    return id
  }

  function openCodeTab(preview: StreamMarkdownCodePreview): string {
    const existing = tabs.value.find(
      (tab): tab is Extract<SidePanelTab, { kind: 'code' }> =>
        tab.kind === 'code' && tab.lang === preview.lang && tab.srcdoc === preview.srcdoc
    )
    if (existing) {
      activeTabId.value = existing.id
      panelOpen.value = true
      return existing.id
    }
    const declared = TITLE_PATTERN.exec(preview.code)?.[1]?.trim()
    let title = declared
    if (!title) {
      const next = (codeNumbering.get(preview.lang) ?? 0) + 1
      codeNumbering.set(preview.lang, next)
      title = `${preview.lang.toUpperCase()} ${next}`
    }
    const id = `side-code-${++sequence}`
    tabs.value = [
      ...tabs.value,
      {
        id,
        kind: 'code',
        title,
        lang: preview.lang,
        srcdoc: preview.srcdoc
      }
    ]
    activeTabId.value = id
    panelOpen.value = true
    return id
  }

  function openWorkspaceTab(kind: SidePanelWorkspaceKind, title: string): string {
    const existing = tabs.value.find((tab) => tab.kind === kind)
    if (existing) {
      activeTabId.value = existing.id
      panelOpen.value = true
      return existing.id
    }
    const id = `side-${kind}`
    tabs.value = [...tabs.value, { id, kind, title }]
    activeTabId.value = id
    panelOpen.value = true
    return id
  }

  function updateWebTab(
    id: string,
    patch: { url?: string; title?: string; favicon?: string | null }
  ): void {
    let recordedUrl = ''
    let recordedTitle = ''
    tabs.value = tabs.value.map((tab) => {
      if (tab.id !== id || tab.kind !== 'web') return tab
      const nextUrl = patch.url !== undefined ? patch.url : tab.url
      const nextTitle =
        patch.title !== undefined && patch.title.trim()
          ? patch.title.trim()
          : nextUrl
            ? formatHostTitle(nextUrl)
            : tab.title
      if (nextUrl.trim()) {
        recordedUrl = nextUrl
        recordedTitle = nextTitle
      }
      return {
        ...tab,
        url: nextUrl,
        title: nextTitle,
        favicon: patch.favicon !== undefined ? patch.favicon : tab.favicon
      }
    })
    if (recordedUrl) {
      recordRecentWeb(recordedUrl, recordedTitle)
    }
  }

  function updateFileTab(id: string, patch: { path: string; displayPath?: string }): void {
    const nextPath = patch.path.trim()
    if (!nextPath) return
    const displayPath = patch.displayPath?.trim() || nextPath
    recordRecentFile(nextPath, displayPath)
    tabs.value = tabs.value.map((tab) => {
      if (tab.id !== id || tab.kind !== 'file') return tab
      return {
        ...tab,
        path: nextPath,
        displayPath,
        title: basenameOfPath(displayPath),
        line: undefined,
        refreshToken: tab.refreshToken + 1
      }
    })
  }

  function selectTab(id: string | null): void {
    if (id === null) {
      activeTabId.value = null
      return
    }
    if (tabs.value.some((tab) => tab.id === id)) {
      activeTabId.value = id
    }
  }

  function closeTab(id: string): void {
    const index = tabs.value.findIndex((tab) => tab.id === id)
    if (index < 0) return
    tabs.value = tabs.value.filter((tab) => tab.id !== id)
    if (activeTabId.value === id) {
      activeTabId.value = tabs.value[Math.min(index, tabs.value.length - 1)]?.id ?? null
    }
  }

  function closeOtherTabs(keepId: string): void {
    const kept = tabs.value.find((tab) => tab.id === keepId)
    if (!kept) return
    tabs.value = [kept]
    activeTabId.value = kept.id
  }

  function closeAllTabs(): void {
    tabs.value = []
    activeTabId.value = null
  }

  function resetWidth(): void {
    panelWidth.value = clampSidePanelWidth(SIDE_PANEL_DEFAULT_WIDTH, resolveContainerWidth())
    writeStoredWidth(panelWidth.value)
  }

  function startResize(event: PointerEvent): void {
    if (!hasWindow()) return
    event.preventDefault()
    isResizing.value = true

    const handle = event.currentTarget
    if (handle instanceof HTMLElement) {
      try {
        handle.setPointerCapture(event.pointerId)
      } catch {
        // best-effort pointer capture
      }
    }

    const startX = event.clientX
    // Start from the visually clamped width so dragging back after a container shrink has no dead zone.
    const startWidth = clampSidePanelWidth(panelWidth.value, resolveContainerWidth())
    panelWidth.value = startWidth
    let pendingX: number | null = null
    let frame: number | null = null

    const flush = (): void => {
      frame = null
      if (pendingX === null) return
      const delta = startX - pendingX
      panelWidth.value = clampSidePanelWidth(startWidth + delta, resolveContainerWidth())
    }

    const onMove = (moveEvent: PointerEvent): void => {
      pendingX = moveEvent.clientX
      if (frame === null) {
        frame = requestAnimationFrame(flush)
      }
    }

    const onEnd = (endEvent: PointerEvent): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      pendingX = null
      const delta = startX - endEvent.clientX
      panelWidth.value = clampSidePanelWidth(startWidth + delta, resolveContainerWidth())
      isResizing.value = false
      writeStoredWidth(panelWidth.value)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  watch(
    [panelOpen, activeTabId, tabs],
    ([open, activeId, currentTabs]) => {
      writeStoredPanelState({
        panelOpen: open,
        activeTabId: activeId,
        tabs: currentTabs
      })
    },
    { flush: 'sync' }
  )

  watch(conversationId, (next, previous) => {
    if (next === previous) return
    // Initial hydration (null -> first active conversation) preserves persisted tabs.
    if (previous === null) return
    // Switching conversations clears thread-bound preview tabs while preserving workspace tools,
    // web tabs, plugins, and sidebar layout.
    tabs.value = tabs.value.filter(
      (tab) =>
        tab.kind === 'web' ||
        tab.kind === 'plugins' ||
        tab.kind === 'git' ||
        tab.kind === 'terminal'
    )
    if (activeTabId.value && !tabs.value.some((tab) => tab.id === activeTabId.value)) {
      activeTabId.value = tabs.value[0]?.id ?? null
    }
    codeNumbering.clear()
  })

  return {
    panelOpen,
    panelWidth,
    isResizing,
    tabs,
    activeTabId,
    activeTab,
    recentItems,
    removeRecentItem,
    clearRecentItems,
    openLauncher,
    openFileTab,
    openWebTab,
    openBlankWebTab,
    openCodeTab,
    openWorkspaceTab,
    updateWebTab,
    updateFileTab,
    selectTab,
    closeTab,
    closeOtherTabs,
    closeAllTabs,
    startResize,
    resetWidth
  }
}
