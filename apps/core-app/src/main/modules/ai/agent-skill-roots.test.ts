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
    expect(ids.has('cursor')).toBe(true)
    expect(ids.has('gemini')).toBe(true)
    expect(ids.has('opencode')).toBe(true)
    expect(ids.has('pi')).toBe(true)
    expect(ids.has('oh-my-pi')).toBe(true)

    const claudeRoot = roots.find((r) => r.id === 'claude')
    expect(claudeRoot?.path).toBe('/home/testuser/.claude/skills')

    const ccSwitchRoot = roots.find((r) => r.id === 'cc-switch')
    expect(ccSwitchRoot?.path).toBe('/home/testuser/.cc-switch/skills')
  })

  it('honors environment variable overrides when absolute', () => {
    const roots = agentSkillRoots('/home/testuser', {
      CODEX_HOME: '/custom/codex'
    })

    const codexRoot = roots.find((r) => r.id === 'codex')
    expect(codexRoot?.path).toBe('/custom/codex/skills')
  })

  it('filters by existing directories', async () => {
    // With a non-existent fake home, none of the directories exist
    const present = await existingAgentSkillRoots('/nonexistent/directory/12345', {})
    expect(present).toEqual([])
  })
})
