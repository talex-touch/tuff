import type { AiImportedConfigItem } from '@talex-touch/tuff-intelligence'
import { describe, expect, it } from 'vitest'
import {
  isManualMcpServer,
  parseCommandArgs,
  parseKeyValueLines,
  resolveMcpTransport
} from './setting-skills-mcp-display'

function makeItem(overrides: Partial<AiImportedConfigItem> = {}): AiImportedConfigItem {
  return {
    id: 'item-1',
    candidateId: 'codex:mcp:filesystem',
    sourceId: 'codex-global',
    provider: 'codex',
    sourceScope: 'global',
    targetScope: 'global',
    kind: 'mcp',
    name: 'filesystem',
    sourceKey: 'mcp.filesystem',
    secrets: [],
    state: 'active',
    revisionId: 'rev-1',
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  } as AiImportedConfigItem
}

describe('setting-skills-mcp-display', () => {
  it('summarises a stdio profile as its full command line', () => {
    const item = makeItem({
      normalizedProjection: {
        mcpProfiles: [
          {
            id: 'p1',
            name: 'filesystem',
            transport: {
              type: 'stdio',
              command: 'npx',
              args: ['@modelcontextprotocol/server-filesystem', '/tmp']
            }
          }
        ]
      }
    })

    expect(resolveMcpTransport(item)).toEqual({
      kind: 'stdio',
      detail: 'npx @modelcontextprotocol/server-filesystem /tmp'
    })
  })

  it('summarises an http profile as its url', () => {
    const item = makeItem({
      normalizedProjection: {
        mcpProfiles: [
          { id: 'p1', transport: { type: 'streamable-http', url: 'https://mcp.example.com/sse' } }
        ]
      }
    })

    expect(resolveMcpTransport(item)).toEqual({
      kind: 'streamable-http',
      detail: 'https://mcp.example.com/sse'
    })
  })

  it('falls back to unknown when the projection carries no usable profile', () => {
    expect(resolveMcpTransport(makeItem())).toEqual({ kind: 'unknown', detail: '' })
    expect(
      resolveMcpTransport(makeItem({ normalizedProjection: { mcpProfiles: 'nope' } }))
    ).toEqual({ kind: 'unknown', detail: '' })
  })

  it('tells hand-entered servers from imported ones', () => {
    expect(isManualMcpServer(makeItem())).toBe(false)
    expect(isManualMcpServer(makeItem({ sourceId: 'manual' }))).toBe(true)
    expect(isManualMcpServer(makeItem({ sourceId: 'manual:local' }))).toBe(true)
    expect(isManualMcpServer(makeItem({ candidateId: 'manual:filesystem' }))).toBe(true)
  })

  it('keeps quoted runs together when splitting arguments', () => {
    expect(parseCommandArgs('  npx  server "/Users/me/My Files" --port 3000 ')).toEqual([
      'npx',
      'server',
      '/Users/me/My Files',
      '--port',
      '3000'
    ])
    expect(parseCommandArgs('')).toEqual([])
  })

  it('parses key/value lines with either separator and skips noise', () => {
    expect(
      parseKeyValueLines(
        ['API_KEY=sk-1234', '# comment', '', 'Authorization: Bearer a:b=c', 'broken'].join('\n')
      )
    ).toEqual({
      API_KEY: 'sk-1234',
      Authorization: 'Bearer a:b=c'
    })
  })
})
