import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildTdsDesignArtifactPrompt,
  shouldInjectTdsDesignPrompt,
  TDS_DESIGN_PROMPT_MAX_BYTES,
  tdsDesignArtifactPrompt,
} from '../tds-design-prompt'
import {
  buildTdsDesignArtifactPrompt as buildFromPromptSubpath,
  tdsDesignArtifactPrompt as constantFromPromptSubpath,
  shouldInjectTdsDesignPrompt as detectFromPromptSubpath,
} from '../prompt'

interface TdsTokensCatalog {
  themes: {
    light: { shell: Record<string, string> }
    dark: { shell: Record<string, string> }
    highContrastLight: { shell: Record<string, string> }
    highContrastDark: { shell: Record<string, string> }
  }
  scales: {
    radius: { shell: Record<string, string> }
    spacing: { shell: Record<string, string> }
    chrome: {
      shell: Record<string, string>
      nonMacOverride: { tokens: Record<string, string> }
    }
    motion: { shell: Record<string, string> }
  }
  typography: {
    sizes: { shell: Record<string, string> }
    families: { shell: Record<string, string> }
    weights: { shell: Record<string, string> }
  }
}

const TOKENS_JSON_PATH = resolve(__dirname, '../../../../../../docs/design/tds/tokens.json')

describe('tds-design-prompt', () => {
  it('stays strictly under the 1200-byte UTF-8 budget and caches once per process', () => {
    const first = buildTdsDesignArtifactPrompt()
    const second = buildTdsDesignArtifactPrompt()

    expect(Object.is(first, second)).toBe(true)
    expect(Object.is(first, tdsDesignArtifactPrompt)).toBe(true)
    expect(Object.is(first, buildFromPromptSubpath())).toBe(true)
    expect(Object.is(first, constantFromPromptSubpath)).toBe(true)
    expect(detectFromPromptSubpath).toBe(shouldInjectTdsDesignPrompt)

    const byteLength = Buffer.byteLength(first, 'utf8')
    expect(byteLength).toBeGreaterThan(200)
    expect(byteLength).toBeLessThan(1200)
    expect(byteLength).toBeLessThan(TDS_DESIGN_PROMPT_MAX_BYTES)
    expect(new TextEncoder().encode(first).length).toBe(byteLength)
  })

  it('aligns every referenced --shell-* token and canvas hex with docs/design/tds/tokens.json', () => {
    const catalog = JSON.parse(readFileSync(TOKENS_JSON_PATH, 'utf8')) as TdsTokensCatalog
    const catalogShellTokens = new Set<string>([
      ...Object.keys(catalog.themes.light.shell),
      ...Object.keys(catalog.themes.dark.shell),
      ...Object.keys(catalog.themes.highContrastLight.shell),
      ...Object.keys(catalog.themes.highContrastDark.shell),
      ...Object.keys(catalog.scales.radius.shell),
      ...Object.keys(catalog.scales.spacing.shell),
      ...Object.keys(catalog.scales.chrome.shell),
      ...Object.keys(catalog.scales.chrome.nonMacOverride.tokens),
      ...Object.keys(catalog.scales.motion.shell),
      ...Object.keys(catalog.typography.sizes.shell),
      ...Object.keys(catalog.typography.families.shell),
      ...Object.keys(catalog.typography.weights.shell),
    ])

    const prompt = buildTdsDesignArtifactPrompt()
    const referencedTokens = [...new Set(prompt.match(/--shell-[a-z0-9-]+/g) ?? [])]
    expect(referencedTokens.length).toBeGreaterThanOrEqual(6)

    for (const token of referencedTokens) {
      expect(catalogShellTokens.has(token), `Unknown token in prompt: ${token}`).toBe(true)
    }

    for (const requiredToken of [
      '--shell-bg',
      '--shell-surface',
      '--shell-text-primary',
      '--shell-text-secondary',
      '--shell-border',
      '--shell-primary',
    ]) {
      expect(prompt).toContain(requiredToken)
    }

    // Single-source canvas neutrals from tokens.json
    expect(catalog.themes.dark.shell['--shell-bg']).toBe('#141414')
    expect(catalog.themes.light.shell['--shell-bg']).toBe('#ffffff')
    expect(prompt).toContain('#141414')
    expect(prompt).toContain('#000000')
    expect(prompt).toContain('#ffffff')
  })

  it('encodes offline-safe asset, layout hygiene, contrast, and anti-slop rules', () => {
    const prompt = buildTdsDesignArtifactPrompt()

    // Offline-safe assets
    expect(prompt).toContain('http://')
    expect(prompt).toContain('https://')
    expect(prompt).toContain('<svg>')
    expect(prompt.toLowerCase()).toContain('system font')

    // Layout & contrast hygiene
    expect(prompt).toContain('100vh')
    expect(prompt).toContain('100vw')
    expect(prompt).toContain('100%')
    expect(prompt).toContain('4.5:1')
    expect(prompt).toContain('tabular-nums')

    // Anti-slop craft
    expect(prompt.toLowerCase()).toContain('gradient')
    expect(prompt.toLowerCase()).toContain('glow')
    expect(prompt).toContain('border-width >= 3px')
    expect(prompt.toLowerCase()).toContain('placeholder metrics')
    expect(prompt).toContain('Card-in-Card')
  })
})

describe('shouldInjectTdsDesignPrompt', () => {
  it('detects English and Chinese UI/HTML/SVG/prototype/design draft requests', () => {
    const positivePrompts = [
      'Build an HTML landing page for a developer tool',
      'Create a standalone SVG architecture diagram',
      'Design a mobile UI mockup for a podcast player',
      'Generate an interactive prototype for account settings',
      'Make a dark mode dashboard UI with tabular metrics',
      'Draft a wireframe and design draft for the onboarding flow',
      'Create a pricing card in HTML',
      'Draw an SVG badge icon for verified plugins',
      'Please fix the following TDS visual lint issues in `demo/page.html`',
      '帮我用 HTML 写一个产品落地页',
      '画一个 SVG 架构图展示数据流',
      '帮我设计一个移动端高保真原型',
      '生成一个暗黑模式的数据看板界面',
      '做一个简洁的登录页设计稿',
      '帮我生成一个交互原型和页面预览',
      '用 HTML 和 CSS 做一个仪表盘卡片',
      `${'Background context. '.repeat(220)}\nPlease design a standalone HTML mockup for this app.`,
    ]

    for (const text of positivePrompts) {
      expect(shouldInjectTdsDesignPrompt(text), `Expected true for: ${text.slice(0, 80)}`).toBe(true)
    }
  })

  it('stays silent on plain chat, git, math, and non-visual coding prompts', () => {
    const negativePrompts = [
      '',
      '   \n\t  ',
      'hello',
      '你好，今天怎么样？',
      'How do I rebase my feature branch onto origin/master?',
      'Why does git push --force-with-lease reject my commit?',
      'What is 2 + 2 * 10?',
      'Solve the quadratic equation x^2 - 5x + 6 = 0',
      'Explain TypeScript conditional types and infer keyword',
      'Fix the failing unit test in auth-service.test.ts',
      'Write a Python script to parse HTML and extract all links',
      'How do I strip HTML tags safely in JavaScript?',
      'Write a unit test for the dashboard store reducer',
      'Create an API endpoint for dashboard billing metrics',
      '帮我修一下 git rebase 冲突',
      '帮我写一个 Python 脚本解析 HTML 字符串',
      '写一个单元测试验证卡片排序逻辑',
      '解释一下 Rust 里的生命周期和借用检查器',
      '1+1 等于几？',
      'Plain non-visual server log line. '.repeat(220),
    ]

    for (const text of negativePrompts) {
      expect(shouldInjectTdsDesignPrompt(text), `Expected false for: ${text.slice(0, 80)}`).toBe(false)
    }
  })
})
