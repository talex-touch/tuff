import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MCP_HOST_SETTINGS,
  MAX_MCP_HOST_PORT,
  MCP_HOST_DEFAULT_PORT,
  MIN_MCP_HOST_PORT,
  normalizeMcpHostSettings,
  resolveMcpHostPort
} from './mcp-host-settings'

describe('resolveMcpHostPort', () => {
  it.each([
    { case: 'one below the privileged-port floor', value: MIN_MCP_HOST_PORT - 1 },
    { case: 'one above the port ceiling', value: MAX_MCP_HOST_PORT + 1 },
    { case: 'a fraction', value: 43110.5 },
    { case: 'not a number at all', value: Number.NaN },
    { case: 'a negative port', value: -43110 }
  ])('falls back to the default for $case', ({ value }) => {
    expect(resolveMcpHostPort(value)).toBe(MCP_HOST_DEFAULT_PORT)
  })

  it('keeps a port a non-privileged process can actually bind', () => {
    expect(resolveMcpHostPort(MIN_MCP_HOST_PORT)).toBe(MIN_MCP_HOST_PORT)
    expect(resolveMcpHostPort(MAX_MCP_HOST_PORT)).toBe(MAX_MCP_HOST_PORT)
    expect(resolveMcpHostPort(51234)).toBe(51234)
  })
})

describe('normalizeMcpHostSettings', () => {
  it.each([
    { case: 'null', value: null },
    { case: 'a bare string', value: 'enabled' },
    { case: 'an array', value: [1, 2] },
    { case: 'a number', value: 7 }
  ])('falls back to the shipped defaults for $case', ({ value }) => {
    expect(normalizeMcpHostSettings(value)).toEqual(DEFAULT_MCP_HOST_SETTINGS)
  })

  it('lets only a real boolean true open the server', () => {
    expect(normalizeMcpHostSettings({ enabled: true }).enabled).toBe(true)
    expect(normalizeMcpHostSettings({ enabled: 'true' }).enabled).toBe(false)
    expect(normalizeMcpHostSettings({ enabled: 1 }).enabled).toBe(false)
  })

  /**
   * `apps/core-app/AGENTS.md` forbids writing a token to ordinary JSON, so the
   * credential moved to the secure store and this document must never carry one
   * again — including when it is handed a file written by the build that did
   * keep it here.
   */
  it('never carries a credential, not even one left by an earlier file', () => {
    const token = 'a1c3'.repeat(16)
    const normalized = normalizeMcpHostSettings({ enabled: true, token })

    expect(Object.hasOwn(normalized, 'token')).toBe(false)
    expect(JSON.stringify(normalized)).not.toContain(token)
  })

  it('bounds a hand-edited port like any other', () => {
    expect(normalizeMcpHostSettings({ port: MIN_MCP_HOST_PORT - 1 }).port).toBe(
      MCP_HOST_DEFAULT_PORT
    )
    expect(normalizeMcpHostSettings({ port: 51234 }).port).toBe(51234)
  })

  it('keeps boolean tool overrides and drops anything else', () => {
    const settings = normalizeMcpHostSettings({
      tools: { read_file: true, write_file: false, run_shell: 'yes', open_url: 1, '': true }
    })

    expect(settings.tools).toEqual({ read_file: true, write_file: false })
  })
})
