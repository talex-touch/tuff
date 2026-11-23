import { describe, expect, it } from 'vitest'
import { agentSkillRoots, existingAgentSkillRoots } from './agent-skill-roots'

describe('agent skill roots', () => {
  it('defines roots for major coding agents and cc-switch', () => {
    const roots = agentSkillRoots('/home/testuser', {})
    const ids = new Set(roots.map((root) => root.id))

    expect(ids.has('codex')).toBe(true)
    expect(ids.has('claude')).toBe(true)
    expect(ids.has('cc-switch')).toBe(true)
    expect(ids.has('agents')).toBe(true)
    expect(ids.has('antigravity')).toBe(true)
    expect(ids.has('cursor')).toBe(true)
    expect(ids.has('gemini')).toBe(true)
    expect(ids.has('kiro')).toBe(true)
    expect(ids.has('windsurf')).toBe(true)
    expect(ids.has('opencode')).toBe(true)
    expect(ids.has('pi')).toBe(true)
    expect(ids.has('oh-my-pi')).toBe(true)

    const claudeRoot = roots.find((r) => r.id === 'claude')
    expect(claudeRoot?.path).toBe('/home/testuser/.claude/skills')

    const ccSwitchRoot = roots.find((r) => r.id === 'cc-switch')
    expect(ccSwitchRoot?.path).toBe('/home/testuser/.cc-switch/skills')

    const antigravityRoots = roots.filter((r) => r.id === 'antigravity').map((r) => r.path)
    expect(antigravityRoots).toEqual([
      '/home/testuser/.gemini/antigravity/skills',
      '/home/testuser/.gemini/config/skills'
    ])
    // Builtin internal skills are not user skills and must never be scanned as a user root.
    expect(roots.map((r) => r.path)).not.toContain(
      '/home/testuser/.gemini/antigravity/builtin/skills'
    )

    const windsurfRoot = roots.find((r) => r.id === 'windsurf')
    expect(windsurfRoot?.path).toBe('/home/testuser/.codeium/windsurf/skills')
  })

  it('honors environment variable overrides when absolute', () => {
    const roots = agentSkillRoots('/home/testuser', {
      CODEX_HOME: '/custom/codex'
    })

    const codexRoot = roots.find((r) => r.id === 'codex')
    expect(codexRoot?.path).toBe('/custom/codex/skills')
  })

  it('deduplicates identical resolved paths without collapsing distinct roots of one agent', () => {
    const roots = agentSkillRoots('/home/testuser', {
      CODEX_HOME: '/home/testuser/.claude'
    })
    const claudePathMatches = roots.filter((r) => r.path === '/home/testuser/.claude/skills')
    expect(claudePathMatches).toHaveLength(1)
    expect(roots.filter((r) => r.id === 'antigravity')).toHaveLength(2)
  })

  it('filters by existing directories', async () => {
    // With a non-existent fake home, none of the directories exist
    const present = await existingAgentSkillRoots('/nonexistent/directory/12345', {})
    expect(present).toEqual([])
  })
})
