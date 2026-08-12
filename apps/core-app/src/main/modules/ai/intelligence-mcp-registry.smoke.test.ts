import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

// The registry only touches Electron through the secure store's root-path
// resolution; a bare stub keeps the real client code on the real transport.
vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
vi.mock('../../utils/secure-store', () => ({
  isSecureStoreAvailable: () => false,
  getSecureStoreValue: async () => null
}))

import { IntelligenceMcpRegistry } from './intelligence-mcp-registry'

/**
 * S6 smoke: the real MCP client against a real server over real stdio —
 * @modelcontextprotocol/server-filesystem via npx, no mocks. This is the leg
 * unit tests cannot vouch for: process spawn, initialize handshake, tool
 * listing and a round-tripped call.
 */
describe('intelligenceMcpRegistry against a live filesystem server', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tuff-mcp-smoke-'))
  const registry = new IntelligenceMcpRegistry()

  afterAll(async () => {
    await registry.closeAll()
    rmSync(dir, { recursive: true, force: true })
  })

  // Opt-in: spawns npx and may hit the network on a cold cache — run with
  // TUFF_MCP_SMOKE=1 (S6 acceptance evidence: green 2026-08-06, 15.2s).
  it.runIf(process.env.TUFF_MCP_SMOKE)(
    'connects, lists tools and reads a file end to end',
    { timeout: 120_000 },
    async () => {
      writeFileSync(join(dir, 'hello.txt'), 'tuff mcp smoke')

      registry.registerProfile({
        id: 'fs-smoke',
        name: 'fs-smoke',
        enabled: true,
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', dir]
        }
      })

      const tools = await registry.listStructuredTools(['fs-smoke'])
      expect(tools.length).toBeGreaterThan(0)
      const names = tools.map((tool) => tool.name)
      expect(names.some((name) => name.includes('read'))).toBe(true)

      const result = await registry.callTool('fs-smoke', 'read_text_file', {
        path: join(dir, 'hello.txt')
      })
      expect(JSON.stringify(result)).toContain('tuff mcp smoke')
    }
  )
})
