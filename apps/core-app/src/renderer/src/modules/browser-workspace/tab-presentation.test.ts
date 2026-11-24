import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ri from '@iconify-json/ri/icons.json'
import simpleIcons from '@iconify-json/simple-icons/icons.json'
import { describe, expect, it } from 'vitest'
import {
  BROWSER_TAB_ICON_CLASSES,
  formatSiteHost,
  localIcon,
  localIconColor,
  shortcuts,
  tabIcon
} from './tab-presentation'

describe('browser tab presentation & shortcut icons', () => {
  it('exposes the 6 top shortcuts in the expected order', () => {
    expect(shortcuts.map((site) => site.title)).toEqual([
      'Google',
      'GitHub',
      'Figma',
      'Claude',
      'ChatGPT',
      'Gemini'
    ])
  })

  it('resolves icons and brand colors for shortcuts, known history hosts, and fallback URLs', () => {
    expect(localIcon('https://www.google.com/search?q=tuff')).toBe('i-simple-icons-google')
    expect(localIconColor('https://www.google.com/')).toBe('#4285F4')
    expect(localIcon('https://claude.ai/new')).toBe('i-simple-icons-claude')
    expect(localIconColor('https://claude.ai/new')).toBe('#D97757')
    expect(localIcon('https://chatgpt.com/')).toBe('i-simple-icons-openai')
    expect(localIcon('https://gemini.google.com/app')).toBe('i-simple-icons-googlegemini')
    expect(localIcon('https://www.youtube.com/watch?v=1')).toBe('i-simple-icons-youtube')
    expect(localIconColor('https://www.youtube.com/watch?v=1')).toBe('#FF0000')
    expect(localIcon('https://www.zhihu.com/signin')).toBe('i-simple-icons-zhihu')
    expect(localIcon('https://unknown.example.com')).toBe('i-ri-global-line')
    expect(localIconColor('https://unknown.example.com')).toBeUndefined()

    expect(formatSiteHost('https://www.zhihu.com/signin?next=/')).toBe('zhihu.com')
    expect(formatSiteHost('not-a-url')).toBe('not-a-url')

    expect(
      tabIcon({
        id: 't1',
        url: 'tuff://settings',
        title: 'Settings',
        favicon: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        error: null
      })
    ).toBe('i-ri-settings-3-line')
  })

  it('registers every icon class in UnoCSS safelist and uses real iconify glyphs', () => {
    const riIcons = ri.icons as Record<string, unknown>
    const simpleIconMap = simpleIcons.icons as Record<string, unknown>

    for (const iconClass of BROWSER_TAB_ICON_CLASSES) {
      if (iconClass.startsWith('i-simple-icons-')) {
        const name = iconClass.slice('i-simple-icons-'.length)
        expect(simpleIconMap[name], `Missing simple-icons glyph: ${iconClass}`).toBeTruthy()
      } else if (iconClass.startsWith('i-ri-')) {
        const name = iconClass.slice('i-ri-'.length)
        expect(riIcons[name], `Missing ri glyph: ${iconClass}`).toBeTruthy()
      } else {
        throw new Error(`Unexpected icon collection in BROWSER_TAB_ICON_CLASSES: ${iconClass}`)
      }
    }

    const unoConfig = readFileSync(resolve(__dirname, '../../../../../uno.config.ts'), 'utf8')
    expect(unoConfig).toContain('BROWSER_TAB_ICON_CLASSES')
    expect(unoConfig).toContain('BROWSER_TAB_PRESENTATION_MODULE')
  })
})
