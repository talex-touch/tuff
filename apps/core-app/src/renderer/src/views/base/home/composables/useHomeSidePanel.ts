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

export const SIDE_PANEL_DEFAULT_WIDTH = 460
export const SIDE_PANEL_MIN_WIDTH = 320
export const SIDE_PANEL_MAX_WIDTH = 840
/**
 * Minimum width reserved for the conversation column beside the docked side panel so the header,
 * message lane, and composer toolbar never get crushed or push controls out of the composer box.
 */
export const HOME_BODY_MIN_WIDTH = 480
const WIDTH_STORAGE_KEY = 'tuff.home.sidePanelWidth'
const TITLE_PATTERN = /<title[^>]*>([^<]*)<\/title>/i

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
  const panelOpen = ref(false)
  const panelWidth = ref<number>(readStoredWidth())
  const isResizing = ref(false)
  const tabs = ref<SidePanelTab[]>([])
  /** `null` displays the Launcher / New Tab hub inside the docked right sidebar. */
  const activeTabId = ref<string | null>(null)

  const codeNumbering = new Map<string, number>()
  let sequence = 0

  const activeTab = computed(() => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null)

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
    tabs.value = tabs.value.map((tab) => {
      if (tab.id !== id || tab.kind !== 'web') return tab
      const nextUrl = patch.url !== undefined ? patch.url : tab.url
      const nextTitle =
        patch.title !== undefined && patch.title.trim()
          ? patch.title.trim()
          : nextUrl
            ? formatHostTitle(nextUrl)
            : tab.title
      return {
        ...tab,
        url: nextUrl,
        title: nextTitle,
        favicon: patch.favicon !== undefined ? patch.favicon : tab.favicon
      }
    })
  }

  function updateFileTab(id: string, patch: { path: string; displayPath?: string }): void {
    const nextPath = patch.path.trim()
    if (!nextPath) return
    const displayPath = patch.displayPath?.trim() || nextPath
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

  watch(conversationId, (next, previous) => {
    if (next === previous) return
    // Conversation switch clears thread-bound preview tabs while keeping the sidebar width.
    tabs.value = tabs.value.filter((tab) => tab.kind === 'web' || tab.kind === 'plugins')
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
