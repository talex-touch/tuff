// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  clampSidePanelWidth,
  HOME_BODY_MIN_WIDTH,
  resolveWorkspaceTabTitle,
  SIDE_PANEL_DEFAULT_WIDTH,
  SIDE_PANEL_MAX_WIDTH,
  SIDE_PANEL_MIN_WIDTH,
  useHomeSidePanel
} from './useHomeSidePanel'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('clampSidePanelWidth', () => {
  it('enforces minimum, maximum, and conversation-body minimum width bounds', () => {
    expect(clampSidePanelWidth(100, 1440)).toBe(SIDE_PANEL_MIN_WIDTH)
    expect(clampSidePanelWidth(1200, 1440)).toBe(SIDE_PANEL_MAX_WIDTH)
    // Typical 1440px window minus 260px left sidebar = 1180px shared between chat and side panel.
    expect(clampSidePanelWidth(900, 1180)).toBe(1180 - HOME_BODY_MIN_WIDTH)
    // Minimum 1100px window minus 260px left sidebar = 840px -> reserves HOME_BODY_MIN_WIDTH.
    expect(clampSidePanelWidth(700, 840)).toBe(840 - HOME_BODY_MIN_WIDTH)
    // Narrower than HOME_BODY_MIN_WIDTH + SIDE_PANEL_MIN_WIDTH still floors at SIDE_PANEL_MIN_WIDTH.
    expect(clampSidePanelWidth(700, 740)).toBe(SIDE_PANEL_MIN_WIDTH)
    expect(clampSidePanelWidth(Number.NaN, 1440)).toBe(SIDE_PANEL_DEFAULT_WIDTH)
    expect(clampSidePanelWidth(Number.NaN, 840)).toBe(840 - HOME_BODY_MIN_WIDTH)
  })
})

describe('useHomeSidePanel', () => {
  it('clamps resize drags and resets against getAvailableWidth without a dead zone', () => {
    window.localStorage.setItem('tuff.home.sidePanelWidth', '840')
    const conversationId = ref<string | null>('conv-1')
    const availableWidth = 1000 // leaves at most 1000 - 480 = 520px for the side panel
    const panel = useHomeSidePanel(conversationId, {
      getAvailableWidth: () => availableWidth
    })

    const down = new MouseEvent('pointerdown', { clientX: 500 }) as PointerEvent
    panel.startResize(down)
    // Immediately starts from the visually clamped width (520) rather than the oversized stored 840.
    expect(panel.panelWidth.value).toBe(availableWidth - HOME_BODY_MIN_WIDTH)

    // Dragging left (smaller clientX) cannot push the conversation column below HOME_BODY_MIN_WIDTH.
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 300 }))
    expect(panel.panelWidth.value).toBe(availableWidth - HOME_BODY_MIN_WIDTH)

    // Dragging right (larger clientX) shrinks immediately from 520 -> 470 without a dead zone.
    panel.startResize(new MouseEvent('pointerdown', { clientX: 500 }) as PointerEvent)
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 550 }))
    expect(panel.panelWidth.value).toBe(availableWidth - HOME_BODY_MIN_WIDTH - 50)

    // Reset respects available width as well.
    const tightPanel = useHomeSidePanel(conversationId, {
      getAvailableWidth: () => 840
    })
    tightPanel.resetWidth()
    expect(tightPanel.panelWidth.value).toBe(840 - HOME_BODY_MIN_WIDTH)
  })
  it('opens and deduplicates file tabs while incrementing refreshToken on re-open', () => {
    const conversationId = ref<string | null>('conv-1')
    const panel = useHomeSidePanel(conversationId)

    const id1 = panel.openFileTab({
      path: '/private/tmp/tuff-spaces/conv-1/login.html',
      displayPath: 'login.html'
    })
    expect(panel.panelOpen.value).toBe(true)
    expect(panel.activeTabId.value).toBe(id1)
    expect(panel.tabs.value).toHaveLength(1)
    expect(panel.tabs.value[0]).toMatchObject({
      kind: 'file',
      title: 'login.html',
      path: '/private/tmp/tuff-spaces/conv-1/login.html',
      refreshToken: 0
    })

    const id2 = panel.openFileTab({
      path: '/private/tmp/tuff-spaces/conv-1/login.html',
      displayPath: 'login.html',
      line: 12
    })
    expect(id2).toBe(id1)
    expect(panel.tabs.value).toHaveLength(1)
    expect(panel.tabs.value[0]).toMatchObject({
      kind: 'file',
      line: 12,
      refreshToken: 1
    })
  })

  it('opens web, tool, and launcher states cleanly and clears thread-bound tabs on conversation change', async () => {
    const conversationId = ref<string | null>('conv-1')
    const panel = useHomeSidePanel(conversationId)

    const fileId = panel.openFileTab({ path: '/tmp/a.html' })
    const webId = panel.openWebTab({ url: 'https://example.com/docs' })
    const reviewId = panel.openWorkspaceTab('review', 'Review')

    expect(panel.tabs.value.map((t) => t.id)).toEqual([fileId, webId, reviewId])
    expect(panel.activeTabId.value).toBe(reviewId)

    panel.openLauncher()
    expect(panel.activeTabId.value).toBeNull()
    expect(panel.panelOpen.value).toBe(true)

    panel.selectTab(webId)
    panel.updateWebTab(webId, { title: 'Example Docs', url: 'https://example.com/docs/v2' })
    expect(panel.activeTab.value).toMatchObject({
      kind: 'web',
      title: 'Example Docs',
      url: 'https://example.com/docs/v2'
    })

    conversationId.value = 'conv-2'
    await Promise.resolve()
    expect(panel.tabs.value.map((t) => t.id)).toEqual([webId])
    expect(panel.activeTabId.value).toBe(webId)

    panel.closeTab(webId)
    expect(panel.tabs.value).toEqual([])
    expect(panel.activeTabId.value).toBeNull()
  })

  it('persists panel open state, tabs, active launcher state, and recent items across reloads', async () => {
    const firstConv = ref<string | null>('conv-1')
    const first = useHomeSidePanel(firstConv)
    first.openWorkspaceTab('git', 'Git')
    first.openFileTab({ path: '/repo/README.md', displayPath: 'README.md' })
    first.openWebTab({ url: 'https://github.com/talex-touch/tuff', title: 'Tuff Repo' })
    first.openLauncher()

    expect(first.panelOpen.value).toBe(true)
    expect(first.activeTabId.value).toBeNull()
    expect(first.recentItems.value.map((item) => item.kind)).toEqual(['web', 'file'])

    // Simulate reload starting with conversationId = null before hydration to conv-1.
    const reloadedConv = ref<string | null>(null)
    const restored = useHomeSidePanel(reloadedConv)
    expect(restored.panelOpen.value).toBe(true)
    expect(restored.activeTabId.value).toBeNull()
    expect(restored.tabs.value.map((tab) => tab.kind)).toEqual(['git', 'file', 'web'])
    expect(restored.recentItems.value).toHaveLength(2)

    // Initial hydration from null -> conv-1 preserves restored tabs (including file + git).
    reloadedConv.value = 'conv-1'
    await Promise.resolve()
    expect(restored.tabs.value.map((tab) => tab.kind)).toEqual(['git', 'file', 'web'])

    // Switching to another conversation keeps workspace tools (`git`) and `web`.
    reloadedConv.value = 'conv-2'
    await Promise.resolve()
    expect(restored.tabs.value.map((tab) => tab.kind)).toEqual(['git', 'web'])

    restored.removeRecentItem('file:/repo/README.md')
    expect(restored.recentItems.value).toHaveLength(1)
    restored.clearRecentItems()
    expect(restored.recentItems.value).toEqual([])
  })

  it('never persists credential-bearing web URLs to localStorage tabs or recents', () => {
    const conv = ref<string | null>('conv-1')
    const panel = useHomeSidePanel(conv)

    panel.openWebTab({ url: 'https://alice:secret@example.com/private', title: 'Private' })
    panel.openWebTab({ url: 'https://example.com/public', title: 'Public' })

    // Credentialed tab stays usable in memory during the current session,
    // but is omitted from recents and never written to localStorage.
    expect(panel.tabs.value).toHaveLength(2)
    expect(panel.recentItems.value).toHaveLength(1)
    expect(panel.recentItems.value[0]).toMatchObject({ url: 'https://example.com/public' })

    const rawState = window.localStorage.getItem('tuff.home.sidePanelStateBySpace.v1') ?? ''
    const rawRecents = window.localStorage.getItem('tuff.home.sidePanelRecentsBySpace.v1') ?? ''
    expect(rawState).not.toContain('secret')
    expect(rawRecents).not.toContain('secret')

    // Pre-existing credentialed entries in storage are dropped on reload.
    window.localStorage.setItem(
      'tuff.home.sidePanelRecentsBySpace.v1',
      JSON.stringify({
        'space:default': [
          {
            id: 'web:https://bob:pw@example.com/admin',
            kind: 'web',
            title: 'Admin',
            url: 'https://bob:pw@example.com/admin',
            updatedAt: Date.now()
          }
        ]
      })
    )
    const reloaded = useHomeSidePanel(ref<string | null>('conv-1'))
    expect(reloaded.tabs.value).toHaveLength(1)
    expect(reloaded.tabs.value[0]).toMatchObject({ url: 'https://example.com/public' })
    expect(reloaded.recentItems.value).toEqual([])
  })

  it('isolates panel open state, tabs, active tab, and recent items per Space and supports pruning by kind', async () => {
    const conv = ref<string | null>('conv-proj')
    const spaceKey = ref('space:project:talex-touch')
    const panel = useHomeSidePanel(conv, { spaceKey })

    panel.openWorkspaceTab('git', 'Git')
    panel.openFileTab({ path: '/repo/TODO-AI.md', displayPath: 'docs/plan-prd/TODO-AI.md' })
    expect(panel.panelOpen.value).toBe(true)
    expect(panel.tabs.value.map((t) => t.kind)).toEqual(['git', 'file'])
    expect(panel.recentItems.value).toHaveLength(1)

    // Switch to Temporary Space: sidebar resets to Temporary Space's own empty/closed state.
    spaceKey.value = 'space:temporary'
    conv.value = 'conv-temp'
    await Promise.resolve()
    expect(panel.panelOpen.value).toBe(false)
    expect(panel.tabs.value).toEqual([])
    expect(panel.activeTabId.value).toBeNull()
    expect(panel.recentItems.value).toEqual([])

    // Opening a tab inside Temporary Space stays isolated from the project Space.
    panel.openWebTab({ url: 'https://example.com/temp', title: 'Temp Page' })
    expect(panel.panelOpen.value).toBe(true)
    expect(panel.tabs.value.map((t) => t.kind)).toEqual(['web'])
    expect(panel.recentItems.value.map((r) => r.title)).toEqual(['Temp Page'])

    // Switch back to project Space: restores its own Git + file tabs and recents without leakage.
    spaceKey.value = 'space:project:talex-touch'
    conv.value = 'conv-proj'
    await Promise.resolve()
    expect(panel.panelOpen.value).toBe(true)
    expect(panel.tabs.value.map((t) => t.kind)).toEqual(['git', 'file'])
    expect(panel.recentItems.value.map((r) => r.title)).toEqual(['TODO-AI.md'])

    // Pruning git tabs removes git while keeping other tabs intact.
    panel.closeTabsByKind('git')
    expect(panel.tabs.value.map((t) => t.kind)).toEqual(['file'])
  })

  it('clears thread-bound tabs on a conversation change even after a Space-only switch', async () => {
    const conv = ref<string | null>('conv-1')
    const spaceKey = ref('space:project:alpha')
    const panel = useHomeSidePanel(conv, { spaceKey })

    // Switch Space without changing conversationId.
    spaceKey.value = 'space:project:beta'
    await Promise.resolve()

    panel.openWorkspaceTab('files', 'Files')
    panel.openFileTab({ path: '/beta/README.md', displayPath: 'README.md' })
    expect(panel.tabs.value.map((t) => t.kind)).toEqual(['files', 'file'])

    // Later changing conversationId inside Space beta must still clear thread-bound file tabs.
    conv.value = 'conv-2'
    await Promise.resolve()
    expect(panel.tabs.value.map((t) => t.kind)).toEqual(['files'])
  })

  it('opens, titles, persists, and restores the canvas workspace tool cleanly', async () => {
    expect(resolveWorkspaceTabTitle('canvas', '')).toBe('Canvas')
    expect(resolveWorkspaceTabTitle('canvas', '  Design Canvas  ')).toBe('Design Canvas')

    const conv = ref<string | null>('conv-canvas-1')
    const panel = useHomeSidePanel(conv)

    // Empty title falls back to default workspace title; subsequent localized call updates it.
    const canvasId = panel.openWorkspaceTab('canvas', '')
    expect(canvasId).toBe('side-canvas')
    expect(panel.panelOpen.value).toBe(true)
    expect(panel.activeTabId.value).toBe('side-canvas')
    expect(panel.activeTab.value).toMatchObject({
      id: 'side-canvas',
      kind: 'canvas',
      title: 'Canvas'
    })

    const dedupId = panel.openWorkspaceTab('canvas', 'Design Canvas')
    expect(dedupId).toBe(canvasId)
    expect(panel.tabs.value).toHaveLength(1)
    expect(panel.activeTab.value).toMatchObject({
      id: 'side-canvas',
      kind: 'canvas',
      title: 'Design Canvas'
    })

    // Persists and restores cleanly across reload.
    const restored = useHomeSidePanel(ref<string | null>('conv-canvas-1'))
    expect(restored.panelOpen.value).toBe(true)
    expect(restored.activeTabId.value).toBe('side-canvas')
    expect(restored.tabs.value).toEqual([
      { id: 'side-canvas', kind: 'canvas', title: 'Design Canvas' }
    ])

    // Switching conversations inside the same Space keeps the canvas tab open so
    // HomeSideCanvasPane can swap to the new conversation's session canvas state.
    conv.value = 'conv-canvas-2'
    await Promise.resolve()
    expect(panel.tabs.value.map((t) => t.kind)).toEqual(['canvas'])
    expect(panel.activeTabId.value).toBe('side-canvas')
  })
})
