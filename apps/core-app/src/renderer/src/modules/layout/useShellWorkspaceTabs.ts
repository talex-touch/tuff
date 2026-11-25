import type { BrowserTabState } from '@talex-touch/utils/transport/sdk/domains/browser'
import { computed, ref } from 'vue'
import { parseBrowserFilePreviewUrl } from '~/modules/browser-workspace/preview-url'

export const BROWSER_SCOPE_KEY = 'browser'
export const TEMPORARY_SPACE_KEY = 'space:temporary'

const STORAGE_KEY = 'tuff:shell-workspace-tabs:v1'
const MAX_TABS_PER_SPACE = 24

export type SpaceWorkspaceTab =
  | {
      id: string
      kind: 'conversation'
      conversationId: string
      spaceKey: string
    }
  | {
      id: string
      kind: 'draft'
      spaceKey: string
    }
  | {
      id: string
      kind: 'browser'
      browserTabId: string
      spaceKey: string
      conversationId?: string
    }

interface BrowserTabScopeBinding {
  spaceKey: string
  conversationId?: string
}

interface PersistedWorkspaceTabs {
  lastScope?: string
  spaceTabs?: Record<string, SpaceWorkspaceTab[]>
  browserTabBindings?: Record<string, BrowserTabScopeBinding>
}

export function isDeprecatedInternalBrowserUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const normalized = url.trim().toLowerCase()
  return normalized.startsWith('tuff://store') || normalized.startsWith('tuff://setting')
}

export function projectSpaceKey(projectId: string | null | undefined): string {
  const trimmed = typeof projectId === 'string' ? projectId.trim() : ''
  return trimmed ? `space:project:${trimmed}` : TEMPORARY_SPACE_KEY
}

export function isSpaceScopeKey(scopeKey: string): boolean {
  return scopeKey.startsWith('space:')
}

export function projectIdFromSpaceKey(scopeKey: string): string | null {
  if (!scopeKey.startsWith('space:project:')) return null
  const id = scopeKey.slice('space:project:'.length).trim()
  return id || null
}

export function conversationTabId(conversationId: string): string {
  return `conv:${conversationId}`
}

export function draftTabId(spaceKey: string): string {
  return `draft:${spaceKey}`
}

export function spaceBrowserTabId(browserTabId: string): string {
  return `browser:${browserTabId}`
}

function isValidPersistedTab(candidate: unknown, spaceKey: string): candidate is SpaceWorkspaceTab {
  if (!candidate || typeof candidate !== 'object') return false
  const tab = candidate as Record<string, unknown>
  if (tab.kind === 'conversation' && typeof tab.conversationId === 'string' && tab.conversationId) {
    return true
  }
  if (tab.kind === 'draft') {
    return true
  }
  if (tab.kind === 'browser' && typeof tab.browserTabId === 'string' && tab.browserTabId) {
    return typeof tab.spaceKey === 'string' ? tab.spaceKey === spaceKey : true
  }
  return false
}

function loadPersistedState(): {
  lastScope: string
  spaceTabs: Record<string, SpaceWorkspaceTab[]>
  browserTabBindings: Record<string, BrowserTabScopeBinding>
} {
  const fallback = {
    lastScope: BROWSER_SCOPE_KEY,
    spaceTabs: {} as Record<string, SpaceWorkspaceTab[]>,
    browserTabBindings: {} as Record<string, BrowserTabScopeBinding>
  }
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as PersistedWorkspaceTabs
    const spaceTabs: Record<string, SpaceWorkspaceTab[]> = {}
    if (parsed.spaceTabs && typeof parsed.spaceTabs === 'object') {
      for (const [spaceKey, list] of Object.entries(parsed.spaceTabs)) {
        if (!isSpaceScopeKey(spaceKey) || !Array.isArray(list)) continue
        const seen = new Set<string>()
        const clean: SpaceWorkspaceTab[] = []
        for (const item of list) {
          if (!isValidPersistedTab(item, spaceKey)) continue
          const normalized: SpaceWorkspaceTab =
            item.kind === 'conversation'
              ? {
                  id: conversationTabId(item.conversationId),
                  kind: 'conversation',
                  conversationId: item.conversationId,
                  spaceKey
                }
              : item.kind === 'draft'
                ? {
                    id: draftTabId(spaceKey),
                    kind: 'draft',
                    spaceKey
                  }
                : {
                    id: spaceBrowserTabId(item.browserTabId),
                    kind: 'browser',
                    browserTabId: item.browserTabId,
                    spaceKey,
                    ...(typeof item.conversationId === 'string' && item.conversationId
                      ? { conversationId: item.conversationId }
                      : {})
                  }
          if (seen.has(normalized.id)) continue
          seen.add(normalized.id)
          clean.push(normalized)
          if (clean.length >= MAX_TABS_PER_SPACE) break
        }
        if (clean.length > 0) spaceTabs[spaceKey] = clean
      }
    }

    const browserTabBindings: Record<string, BrowserTabScopeBinding> = {}
    if (parsed.browserTabBindings && typeof parsed.browserTabBindings === 'object') {
      for (const [tabId, binding] of Object.entries(parsed.browserTabBindings)) {
        if (
          tabId &&
          binding &&
          typeof binding.spaceKey === 'string' &&
          isSpaceScopeKey(binding.spaceKey)
        ) {
          browserTabBindings[tabId] = {
            spaceKey: binding.spaceKey,
            ...(typeof binding.conversationId === 'string' && binding.conversationId
              ? { conversationId: binding.conversationId }
              : {})
          }
        }
      }
    }

    const lastScope =
      typeof parsed.lastScope === 'string' &&
      (parsed.lastScope === BROWSER_SCOPE_KEY || isSpaceScopeKey(parsed.lastScope))
        ? parsed.lastScope
        : BROWSER_SCOPE_KEY

    return { lastScope, spaceTabs, browserTabBindings }
  } catch {
    return fallback
  }
}

const initial = loadPersistedState()
const lastWorkspaceScope = ref<string>(initial.lastScope)
const spaceTabsMap = ref<Record<string, SpaceWorkspaceTab[]>>(initial.spaceTabs)
const browserTabBindings = ref<Record<string, BrowserTabScopeBinding>>(initial.browserTabBindings)

function persistState(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const payload: PersistedWorkspaceTabs = {
      lastScope: lastWorkspaceScope.value,
      spaceTabs: spaceTabsMap.value,
      browserTabBindings: browserTabBindings.value
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Storage quota or private mode: in-memory state still drives the UI cleanly.
  }
}

function setSpaceList(spaceKey: string, tabs: SpaceWorkspaceTab[]): void {
  const next = { ...spaceTabsMap.value }
  if (tabs.length === 0) {
    delete next[spaceKey]
  } else {
    next[spaceKey] = tabs.slice(-MAX_TABS_PER_SPACE)
  }
  spaceTabsMap.value = next
  persistState()
}

export function setLastWorkspaceScope(scopeKey: string): void {
  if (scopeKey !== BROWSER_SCOPE_KEY && !isSpaceScopeKey(scopeKey)) return
  if (lastWorkspaceScope.value === scopeKey) return
  lastWorkspaceScope.value = scopeKey
  persistState()
}

export function getSpaceTabs(spaceKey: string): SpaceWorkspaceTab[] {
  return spaceTabsMap.value[spaceKey] ?? []
}

export function ensureDraftTab(spaceKey: string): SpaceWorkspaceTab {
  const id = draftTabId(spaceKey)
  const existingList = getSpaceTabs(spaceKey)
  const found = existingList.find((tab) => tab.id === id)
  if (found) return found
  const tab: SpaceWorkspaceTab = { id, kind: 'draft', spaceKey }
  setSpaceList(spaceKey, [...existingList, tab])
  return tab
}

export function ensureConversationTab(
  spaceKey: string,
  conversationId: string,
  options: { promoteDraft?: boolean } = {}
): SpaceWorkspaceTab {
  const id = conversationTabId(conversationId)

  // If this conversation previously lived under a tentative space (e.g. before history loaded),
  // move its tab cleanly into its authoritative space so it never duplicates across spaces.
  let migrated = false
  const nextMap: Record<string, SpaceWorkspaceTab[]> = { ...spaceTabsMap.value }
  for (const [otherSpace, list] of Object.entries(nextMap)) {
    if (otherSpace === spaceKey) continue
    const filtered = list.filter(
      (tab) => !(tab.kind === 'conversation' && tab.conversationId === conversationId)
    )
    if (filtered.length !== list.length) {
      migrated = true
      if (filtered.length === 0) delete nextMap[otherSpace]
      else nextMap[otherSpace] = filtered
    }
  }
  if (migrated) {
    spaceTabsMap.value = nextMap
  }

  const currentList = getSpaceTabs(spaceKey)
  const existing = currentList.find((tab) => tab.id === id)
  if (existing) {
    if (migrated) persistState()
    return existing
  }

  const created: SpaceWorkspaceTab = {
    id,
    kind: 'conversation',
    conversationId,
    spaceKey
  }

  if (options.promoteDraft) {
    const draftIndex = currentList.findIndex((tab) => tab.kind === 'draft')
    if (draftIndex >= 0) {
      const updated = currentList.slice()
      updated[draftIndex] = created
      setSpaceList(spaceKey, updated)
      return created
    }
  }

  setSpaceList(spaceKey, [...currentList, created])
  return created
}

export function attachBrowserTabToSpace(
  browserTabId: string,
  spaceKey: string,
  conversationId?: string | null
): SpaceWorkspaceTab {
  const normalizedConv =
    typeof conversationId === 'string' && conversationId.trim() ? conversationId.trim() : undefined
  const binding: BrowserTabScopeBinding = {
    spaceKey,
    ...(normalizedConv ? { conversationId: normalizedConv } : {})
  }
  browserTabBindings.value = {
    ...browserTabBindings.value,
    [browserTabId]: binding
  }

  // Ensure the browser tab is owned by only one space.
  const nextMap: Record<string, SpaceWorkspaceTab[]> = { ...spaceTabsMap.value }
  for (const [otherSpace, list] of Object.entries(nextMap)) {
    if (otherSpace === spaceKey) continue
    const filtered = list.filter(
      (tab) => !(tab.kind === 'browser' && tab.browserTabId === browserTabId)
    )
    if (filtered.length !== list.length) {
      if (filtered.length === 0) delete nextMap[otherSpace]
      else nextMap[otherSpace] = filtered
    }
  }
  spaceTabsMap.value = nextMap

  const id = spaceBrowserTabId(browserTabId)
  const currentList = getSpaceTabs(spaceKey)
  const existing = currentList.find((tab) => tab.id === id)
  if (existing) {
    persistState()
    return existing
  }

  const created: SpaceWorkspaceTab = {
    id,
    kind: 'browser',
    browserTabId,
    spaceKey,
    ...(normalizedConv ? { conversationId: normalizedConv } : {})
  }
  setSpaceList(spaceKey, [...currentList, created])
  return created
}

export function resolveBrowserTabSpaceKey(
  tab: Pick<BrowserTabState, 'id' | 'url'>,
  resolveConversationSpace?: (conversationId: string) => string | null
): string | null {
  const explicit = browserTabBindings.value[tab.id]
  if (explicit && isSpaceScopeKey(explicit.spaceKey)) {
    return explicit.spaceKey
  }
  const preview = parseBrowserFilePreviewUrl(tab.url)
  if (preview?.conversationId && resolveConversationSpace) {
    return resolveConversationSpace(preview.conversationId)
  }
  return null
}

export function syncBrowserTabsWithSpaces(
  liveTabs: readonly BrowserTabState[],
  resolveConversationSpace?: (conversationId: string) => string | null
): void {
  const liveIds = new Set(liveTabs.map((tab) => tab.id))
  let bindingsChanged = false
  const nextBindings: Record<string, BrowserTabScopeBinding> = {}

  for (const [tabId, binding] of Object.entries(browserTabBindings.value)) {
    if (liveIds.has(tabId)) {
      nextBindings[tabId] = binding
    } else {
      bindingsChanged = true
    }
  }

  // Auto-bind any live tuff://preview tab that carries a conversationId so reloads stay scoped.
  for (const tab of liveTabs) {
    if (isDeprecatedInternalBrowserUrl(tab.url)) continue
    if (nextBindings[tab.id]) continue
    const preview = parseBrowserFilePreviewUrl(tab.url)
    if (preview?.conversationId && resolveConversationSpace) {
      const inferredSpace = resolveConversationSpace(preview.conversationId)
      if (inferredSpace && isSpaceScopeKey(inferredSpace)) {
        nextBindings[tab.id] = {
          spaceKey: inferredSpace,
          conversationId: preview.conversationId
        }
        bindingsChanged = true
      }
    }
  }

  if (bindingsChanged) {
    browserTabBindings.value = nextBindings
  }

  let mapChanged = false
  const nextMap: Record<string, SpaceWorkspaceTab[]> = {}
  for (const [spaceKey, list] of Object.entries(spaceTabsMap.value)) {
    const filtered = list.filter((tab) => {
      if (tab.kind !== 'browser') return true
      if (!liveIds.has(tab.browserTabId)) return false
      const binding = nextBindings[tab.browserTabId]
      return !binding || binding.spaceKey === spaceKey
    })
    if (filtered.length !== list.length) mapChanged = true
    if (filtered.length > 0) nextMap[spaceKey] = filtered
  }

  // Ensure every space-bound live browser tab appears in its owning space tab list.
  for (const [browserTabId, binding] of Object.entries(nextBindings)) {
    const list = nextMap[binding.spaceKey] ?? []
    const id = spaceBrowserTabId(browserTabId)
    if (!list.some((tab) => tab.id === id)) {
      const appended: SpaceWorkspaceTab = {
        id,
        kind: 'browser',
        browserTabId,
        spaceKey: binding.spaceKey,
        ...(binding.conversationId ? { conversationId: binding.conversationId } : {})
      }
      nextMap[binding.spaceKey] = [...list, appended].slice(-MAX_TABS_PER_SPACE)
      mapChanged = true
    }
  }

  if (mapChanged) {
    spaceTabsMap.value = nextMap
  }
  if (bindingsChanged || mapChanged) {
    persistState()
  }
}

export function removeSpaceTab(
  spaceKey: string,
  tabId: string
): { removed: SpaceWorkspaceTab | null; nextTab: SpaceWorkspaceTab | null } {
  const list = getSpaceTabs(spaceKey)
  const index = list.findIndex((tab) => tab.id === tabId)
  if (index < 0) return { removed: null, nextTab: null }

  const removed = list[index]!
  const remaining = list.filter((tab) => tab.id !== tabId)
  setSpaceList(spaceKey, remaining)

  if (removed.kind === 'browser' && browserTabBindings.value[removed.browserTabId]) {
    const nextBindings = { ...browserTabBindings.value }
    delete nextBindings[removed.browserTabId]
    browserTabBindings.value = nextBindings
    persistState()
  }

  const nextTab = remaining[index] ?? remaining[index - 1] ?? null
  return { removed, nextTab }
}

export function closeConversationTabEverywhere(conversationId: string): void {
  const targetId = conversationTabId(conversationId)
  let changed = false
  const nextMap: Record<string, SpaceWorkspaceTab[]> = {}
  for (const [spaceKey, list] of Object.entries(spaceTabsMap.value)) {
    const filtered = list.filter((tab) => tab.id !== targetId)
    if (filtered.length !== list.length) changed = true
    if (filtered.length > 0) nextMap[spaceKey] = filtered
  }
  if (changed) {
    spaceTabsMap.value = nextMap
    persistState()
  }
}

export function closeSpaceTabsBulk(
  spaceKey: string,
  targetTabId: string,
  mode: 'close-others' | 'close-left' | 'close-right'
): { removedBrowserTabIds: string[]; keptTabs: SpaceWorkspaceTab[] } {
  const list = getSpaceTabs(spaceKey)
  const index = list.findIndex((tab) => tab.id === targetTabId)
  if (index < 0) return { removedBrowserTabIds: [], keptTabs: list }

  const keptTabs: SpaceWorkspaceTab[] = []
  const removedBrowserTabIds: string[] = []

  list.forEach((tab, currentIndex) => {
    const remove =
      mode === 'close-others'
        ? currentIndex !== index
        : mode === 'close-left'
          ? currentIndex < index
          : currentIndex > index
    if (remove) {
      if (tab.kind === 'browser') removedBrowserTabIds.push(tab.browserTabId)
    } else {
      keptTabs.push(tab)
    }
  })

  if (keptTabs.length !== list.length) {
    setSpaceList(spaceKey, keptTabs)
    if (removedBrowserTabIds.length > 0) {
      const nextBindings = { ...browserTabBindings.value }
      for (const id of removedBrowserTabIds) delete nextBindings[id]
      browserTabBindings.value = nextBindings
      persistState()
    }
  }

  return { removedBrowserTabIds, keptTabs }
}

export function reorderSpaceTab(
  spaceKey: string,
  tabId: string,
  beforeTabId: string | null
): boolean {
  const list = getSpaceTabs(spaceKey)
  const fromIndex = list.findIndex((tab) => tab.id === tabId)
  if (fromIndex < 0) return false
  if (beforeTabId === tabId) return false

  const next = list.slice()
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return false

  if (beforeTabId === null) {
    next.push(moved)
  } else {
    const targetIndex = next.findIndex((tab) => tab.id === beforeTabId)
    if (targetIndex < 0) next.push(moved)
    else next.splice(targetIndex, 0, moved)
  }

  setSpaceList(spaceKey, next)
  return true
}

export function resetShellWorkspaceTabsForTests(): void {
  lastWorkspaceScope.value = BROWSER_SCOPE_KEY
  spaceTabsMap.value = {}
  browserTabBindings.value = {}
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }
}

export function useShellWorkspaceTabs() {
  return {
    lastWorkspaceScope: computed(() => lastWorkspaceScope.value),
    spaceTabsMap: computed(() => spaceTabsMap.value),
    browserTabBindings: computed(() => browserTabBindings.value),
    setLastWorkspaceScope,
    getSpaceTabs,
    ensureDraftTab,
    ensureConversationTab,
    attachBrowserTabToSpace,
    resolveBrowserTabSpaceKey,
    syncBrowserTabsWithSpaces,
    removeSpaceTab,
    closeConversationTabEverywhere,
    closeSpaceTabsBulk,
    reorderSpaceTab
  }
}
