// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import {
  clampSidePanelWidth,
  HOME_BODY_MIN_WIDTH,
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
})
