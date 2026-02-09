import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const browserPlugin = loadPluginModule(new URL('../../../../plugins/touch-browser-open/index.js', import.meta.url))
const { __test: browserTest } = browserPlugin

describe('browser open plugin', () => {
  it('normalizes url input', () => {
    expect(browserTest.normalizeUrlInput('example.com')).toBe('https://example.com/')
    expect(browserTest.normalizeUrlInput('https://example.com/path')).toBe('https://example.com/path')
    expect(browserTest.normalizeUrlInput('not a url')).toBeNull()
  })

  it('builds windows open scripts', () => {
    const defaultScript = browserTest.buildWindowsOpenScript('default-open', {
      url: 'https://example.com',
    })
    const browserScript = browserTest.buildWindowsOpenScript('open-browser', {
      url: 'https://example.com',
      target: 'chrome.exe',
    })

    expect(defaultScript).toContain('Start-Process')
    expect(defaultScript).toContain('https://example.com')
    expect(browserScript).toContain('chrome.exe')
    expect(browserScript).toContain('-ArgumentList')
  })

  it('merges recent browsers with availability', () => {
    const now = Date.now()
    const available = [
      { id: 'chrome', name: 'Chrome', target: 'chrome.exe' },
      { id: 'edge', name: 'Edge', target: 'msedge.exe' },
    ]
    const recent = [
      { id: 'firefox', name: 'Firefox', target: 'firefox.exe', lastUsedAt: now - 1000 },
      { id: 'edge', name: 'Edge', target: 'msedge.exe', lastUsedAt: now - 500 },
      { id: 'chrome', name: 'Chrome', target: 'chrome.exe', lastUsedAt: now - 200 },
    ]

    const merged = browserTest.mergeRecentBrowsers(available, recent)
    expect(merged.length).toBe(2)
    expect(merged[0].id).toBe('chrome')
    expect(merged[1].id).toBe('edge')
  })

  it('keeps grouped layout order', () => {
    const order = browserTest.resolveGroupOrder({
      quickActions: [1],
      recommendedItems: [1],
      recentItems: [1],
      tips: [1],
    })

    expect(order).toEqual(['quick', 'recommended', 'recent', 'tips'])
  })
})
