import { describe, expect, it, vi } from 'vitest'
import { isPluginFacingEvent } from '../transport/security/plugin-facing-events'
import { createMcpServersSdk, MCP_SECRET_MASK, McpServerEvents } from '../transport/sdk/domains/mcp-servers'
import { createSkillLocalSdk, SkillLocalEvents } from '../transport/sdk/domains/skill-local'
import { aiAgentLabel, isKnownAiAgentId, KNOWN_AI_AGENT_IDS } from '../types/ai-orchestrator'

/** A transport that records what each SDK call sends, as `[event name, payload]`. */
function recordingTransport() {
  const sent: Array<[string, unknown]> = []
  const send = vi.fn(async (event: { toEventName: () => string }, payload?: unknown) => {
    sent.push([event.toEventName(), payload])
    return {}
  })
  return { transport: { send } as never, sent }
}

/**
 * The resource-inventory contract main and renderer share: wire names, SDK mapping, and the
 * guarantee that none of these handlers is reachable from a plugin.
 */
describe('skill-local domain', () => {
  it('keeps the wire names the settings page already sends', () => {
    // The renderer still carries its own copy of the first four until it switches to this file;
    // a rename here would leave that copy calling a handler that no longer exists.
    expect(Object.values(SkillLocalEvents).map(event => event.toEventName())).toEqual([
      'ai:skill-local:list',
      'ai:skill-local:add-dir',
      'ai:skill-local:remove-dir',
      'ai:skill-local:set-enabled',
      'ai:skill-local:inventory',
    ])
  })

  it('sends each call through its own event', async () => {
    const { transport, sent } = recordingTransport()
    const sdk = createSkillLocalSdk(transport)

    await sdk.list()
    await sdk.addDir('/skills')
    await sdk.removeDir('/skills')
    await sdk.setEnabled('local:abc', false)
    await sdk.inventory()

    expect(sent).toEqual([
      ['ai:skill-local:list', undefined],
      ['ai:skill-local:add-dir', { path: '/skills' }],
      ['ai:skill-local:remove-dir', { path: '/skills' }],
      ['ai:skill-local:set-enabled', { id: 'local:abc', enabled: false }],
      ['ai:skill-local:inventory', undefined],
    ])
  })
})

describe('mcp-servers domain', () => {
  it('adds the inventory and the per-server switch beside the existing calls', async () => {
    const { transport, sent } = recordingTransport()
    const sdk = createMcpServersSdk(transport)

    await sdk.inventory()
    await sdk.setServerEnabled('mcp:key', true)

    expect(sent).toEqual([
      ['mcp-servers:api:inventory', undefined],
      ['mcp-servers:api:set-server-enabled', { key: 'mcp:key', enabled: true }],
    ])
    expect(MCP_SECRET_MASK).not.toMatch(/\w/)
  })
})

describe('resource inventory is host-only', () => {
  it('binds none of its events to the plugin channel', () => {
    const names = [...Object.values(SkillLocalEvents), ...Object.values(McpServerEvents)].map(
      event => event.toEventName(),
    )
    // Positive control: the allowlist answers yes for something plugins do reach.
    expect(isPluginFacingEvent('intelligence:api:invoke')).toBe(true)
    expect(names).toHaveLength(9)
    for (const name of names) expect(isPluginFacingEvent(name)).toBe(false)
  })
})

describe('agent ids', () => {
  it('labels a known agent by brand and an unknown one by its id', () => {
    expect(aiAgentLabel('claude')).toBe('Claude Code')
    expect(aiAgentLabel('oh-my-pi')).toBe('Oh My Pi')
    expect(aiAgentLabel('newcomer')).toBe('newcomer')
    expect(isKnownAiAgentId('cc-switch')).toBe(false)
    expect(isKnownAiAgentId('agents')).toBe(false)
    expect(KNOWN_AI_AGENT_IDS.every(id => isKnownAiAgentId(id) && aiAgentLabel(id) !== id)).toBe(true)
  })
})
