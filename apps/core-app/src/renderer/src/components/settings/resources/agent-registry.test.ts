import type { AgentPresence } from '@talex-touch/utils/types/ai-orchestrator'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { KNOWN_AI_AGENT_IDS } from '@talex-touch/utils/types/ai-orchestrator'
import { describe, expect, it } from 'vitest'
import { AGENT_BRAND_ICONS, AGENT_ICON_CLASSES } from './agent-icons'
import {
  agentBrand,
  agentCountsFrom,
  agentIconClass,
  agentMonogram,
  agentMonogramTone
} from './agent-registry'

/** Resolves from this file, so the set is the one installed for core-app. */
const nodeRequire = createRequire(import.meta.url)

function installedSimpleIcons(): Set<string> {
  const set = JSON.parse(
    readFileSync(nodeRequire.resolve('@iconify-json/simple-icons/icons.json'), 'utf8')
  ) as { icons: Record<string, unknown>; aliases?: Record<string, unknown> }
  return new Set([...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})])
}

function presence(
  agentId: string,
  label: string,
  counts: { skill?: number | null; mcp?: number | null }
): AgentPresence {
  return {
    agentId,
    label,
    skillCount: counts.skill ?? null,
    mcpServerCount: counts.mcp ?? null
  }
}

describe('agentBrand', () => {
  it.each([
    ['claude', 'Claude Code', 'i-simple-icons-claude'],
    // Codex is OpenAI's CLI; the set has no Codex mark of its own.
    ['codex', 'Codex', 'i-simple-icons-openai'],
    ['gemini', 'Gemini CLI', 'i-simple-icons-googlegemini'],
    ['cursor', 'Cursor', 'i-simple-icons-cursor'],
    ['opencode', 'OpenCode', 'i-simple-icons-opencode'],
    ['pi', 'Pi', 'i-simple-icons-pi'],
    ['oh-my-pi', 'Oh My Pi', 'i-simple-icons-pi']
  ])('draws %s with its brand glyph and name', (agentId, label, iconClass) => {
    expect(agentBrand(agentId)).toMatchObject({ agentId, label, iconClass })
  })

  it.each([
    ['kiro', 'K'],
    ['qoder', 'Q'],
    ['codebuddy', 'C'],
    ['factory', 'F'],
    ['reasonix', 'R'],
    ['kilocode', 'KC'],
    ['devin', 'D']
  ])('badges %s, which the icon set does not carry, with %s', (agentId, monogram) => {
    const brand = agentBrand(agentId)
    expect(brand.iconClass).toBeNull()
    expect(brand.monogram).toBe(monogram)
  })

  it('names an agent this build has never heard of by its id instead of dropping it', () => {
    expect(agentBrand('windsurf')).toMatchObject({
      label: 'windsurf',
      iconClass: null,
      monogram: 'W'
    })
  })

  it('prefers the label the inventory sent, and ignores a blank one', () => {
    expect(agentBrand('claude', 'Claude').label).toBe('Claude')
    expect(agentBrand('claude', '   ').label).toBe('Claude Code')
  })

  it('does not treat prototype members as agents', () => {
    expect(agentIconClass('constructor')).toBeNull()
    expect(agentIconClass('toString')).toBeNull()
    expect(agentIconClass('__proto__')).toBeNull()
  })

  it('covers every agent the shared contract knows, with a glyph or a monogram', () => {
    for (const agentId of KNOWN_AI_AGENT_IDS) {
      const brand = agentBrand(agentId)
      expect(brand.label.length).toBeGreaterThan(0)
      expect(brand.iconClass !== null || brand.monogram.length > 0).toBe(true)
    }
  })
})

describe('agentMonogram', () => {
  it('takes the first two initials of a multi-word name and one letter otherwise', () => {
    expect(agentMonogram('Kilo Code')).toBe('KC')
    expect(agentMonogram('Kiro')).toBe('K')
    expect(agentMonogram('my-agent')).toBe('MA')
  })

  it('takes whole code points and keeps a non-Latin initial', () => {
    expect(agentMonogram('🚀 relay')).toBe('🚀R')
    expect(agentMonogram('内网代理')).toBe('内')
  })

  it('has something to draw for an empty name', () => {
    expect(agentMonogram('')).toBe('?')
    expect(agentMonogram('   ')).toBe('?')
  })
})

describe('agentMonogramTone', () => {
  it('gives one agent the same tint every time', () => {
    for (const agentId of ['kiro', 'qoder', 'devin', 'windsurf']) {
      expect(agentMonogramTone(agentId)).toBe(agentMonogramTone(agentId))
    }
  })

  it('never tints an agent as an error', () => {
    for (const agentId of [...KNOWN_AI_AGENT_IDS, 'windsurf', 'x', '']) {
      expect(['primary', 'success', 'warning', 'info']).toContain(agentMonogramTone(agentId))
    }
  })
})

describe('agentCountsFrom', () => {
  const inventoryPresence = [
    presence('claude', 'Claude Code', { mcp: 8 }),
    presence('codex', 'Codex', { mcp: 5 }),
    presence('pi', 'Pi', { mcp: 0 }),
    presence('cursor', 'Cursor', { skill: 3 })
  ]

  it('keeps only agents holding at least one of the resource, in the order main sent', () => {
    expect(agentCountsFrom(inventoryPresence, 'mcp')).toEqual([
      { agentId: 'claude', label: 'Claude Code', count: 8 },
      { agentId: 'codex', label: 'Codex', count: 5 }
    ])
    expect(agentCountsFrom(inventoryPresence, 'skill')).toEqual([
      { agentId: 'cursor', label: 'Cursor', count: 3 }
    ])
  })

  it('reads a count main did not take (null) as no rows, not as an error', () => {
    expect(agentCountsFrom([presence('claude', 'Claude Code', {})], 'mcp')).toEqual([])
  })
})

/**
 * The classes live in a `.ts` module, which UnoCSS never scans, so they reach the stylesheet only
 * through the safelist in `uno.config.ts` — the same trap `model-source-icons` and
 * `model-family-icons` guard against.
 */
describe('AGENT_ICON_CLASSES', () => {
  it('names only glyphs the installed simple-icons set has', () => {
    const installed = installedSimpleIcons()
    for (const className of AGENT_ICON_CLASSES) {
      expect(className.startsWith('i-simple-icons-')).toBe(true)
      expect(installed.has(className.slice('i-simple-icons-'.length))).toBe(true)
    }
  })

  it('lists exactly the classes the table can render, de-duplicated', () => {
    expect(AGENT_ICON_CLASSES).toEqual([...new Set(Object.values(AGENT_BRAND_ICONS))])
  })

  it('is spread into the UnoCSS safelist and watched by the dev server, not copied there', () => {
    // Read as text: evaluating the config would pull the icon collections and presets into a unit
    // test, and resolving those is the dev server's job, not vitest's.
    const unoConfig = readFileSync(
      path.resolve(__dirname, '../../../../../../uno.config.ts'),
      'utf8'
    )
    expect(unoConfig).toMatch(
      /import \{ AGENT_ICON_CLASSES \} from '\.\/src\/renderer\/src\/components\/settings\/resources\/agent-icons'/
    )
    expect(unoConfig).toMatch(/safelist: \[[^\]]*\.\.\.AGENT_ICON_CLASSES/)
    const binding =
      /const (\w+) = fileURLToPath\(\s*new URL\('\.\/src\/renderer\/src\/components\/settings\/resources\/agent-icons\.ts', import\.meta\.url\)\s*\)/.exec(
        unoConfig
      )?.[1]
    expect(binding).toBeDefined()
    expect(unoConfig).toMatch(new RegExp(`configDeps: \\[[^\\]]*\\b${binding}\\b`))
    // A literal copy would be the drift the import exists to prevent. `i-simple-icons-claude` and
    // friends also back other tables, so only the agent-only marks are checked for literals.
    for (const className of [
      'i-simple-icons-cursor',
      'i-simple-icons-opencode',
      'i-simple-icons-pi'
    ]) {
      expect(unoConfig).not.toContain(`'${className}'`)
    }
  })

  it('keeps its module free of runtime imports, so the config loader can evaluate it', () => {
    const source = readFileSync(path.resolve(__dirname, 'agent-icons.ts'), 'utf8')
    expect(source).not.toMatch(/^import\s(?!type\b)/m)
  })
})
