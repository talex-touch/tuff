import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPiCliModels, resetPiModelCatalogCache } from './pi-model-catalog'

/**
 * Real directories on purpose: the module's whole job is reading files pi
 * owns, and a stubbed fs would only test the stub (the same stance as
 * skill-local-sources.test.ts).
 */

const mocks = vi.hoisted(() => ({
  warn: vi.fn()
}))

vi.mock('../../../utils/logger', () => ({
  createLogger: () => ({
    child: () => ({ info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() })
  })
}))

/** A value that must never escape the module, wherever it rides in the file. */
const FAKE_KEY = 'sk-fake-credential-must-not-leak'

let agentDir: string
let previousAgentDir: string | undefined

/** Distinct mtimes even when writes land in the same millisecond. */
let clock = 1_700_000_000
function writeCatalog(name: string, content: string): void {
  const path = join(agentDir, name)
  writeFileSync(path, content)
  clock += 10
  utimesSync(path, clock, clock)
}

function writeDefaultFixtures(): void {
  writeCatalog(
    'models.json',
    JSON.stringify({
      providers: {
        Custom: {
          baseUrl: 'https://example.invalid',
          apiKey: FAKE_KEY,
          models: [{ id: 'model-b', name: 'Model B' }, { id: 'model-a' }, { notAnId: true }]
        },
        '': { models: [{ id: 'nameless-provider-model' }] },
        Broken: 'not an object'
      }
    })
  )
  writeCatalog(
    'models-store.json',
    JSON.stringify({
      anthropic: { models: [{ id: 'claude-x' }, { missing: 'id' }], checkedAt: 1 },
      Custom: { models: [{ id: 'model-b' }] }
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  agentDir = mkdtempSync(join(tmpdir(), 'pi-agent-'))
  previousAgentDir = process.env.PI_CODING_AGENT_DIR
  process.env.PI_CODING_AGENT_DIR = agentDir
  resetPiModelCatalogCache()
})

afterEach(() => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir
  rmSync(agentDir, { recursive: true, force: true })
})

describe('listPiCliModels', () => {
  it('merges both catalogue files into sorted provider/id patterns', () => {
    writeDefaultFixtures()

    expect(listPiCliModels()).toEqual(['anthropic/claude-x', 'Custom/model-a', 'Custom/model-b'])
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  it('lists one pattern once when both files declare it', () => {
    writeDefaultFixtures()

    const duplicates = listPiCliModels().filter((pattern) => pattern === 'Custom/model-b')
    expect(duplicates).toHaveLength(1)
  })

  it('returns nothing for a machine without an agent dir, silently', () => {
    process.env.PI_CODING_AGENT_DIR = join(agentDir, 'does-not-exist')

    expect(listPiCliModels()).toEqual([])
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  it('degrades a corrupt file to an absent source and warns once for the run', () => {
    writeCatalog('models.json', '{ definitely not json')
    writeCatalog('models-store.json', '[1, 2, 3]')

    expect(listPiCliModels()).toEqual([])
    expect(mocks.warn).toHaveBeenCalledTimes(1)

    // Still degraded on the next read, still only the one warning.
    resetPiModelCatalogCacheKeepWarn()
    expect(listPiCliModels()).toEqual([])
    expect(mocks.warn).toHaveBeenCalledTimes(1)
  })

  it('keeps the healthy file when the other is corrupt', () => {
    writeCatalog('models.json', '{ broken')
    writeCatalog('models-store.json', JSON.stringify({ xai: { models: [{ id: 'grok-x' }] } }))

    expect(listPiCliModels()).toEqual(['xai/grok-x'])
  })

  it('serves the memoised list until a file changes on disk', () => {
    writeDefaultFixtures()
    const first = listPiCliModels()
    expect(listPiCliModels()).toBe(first)

    writeCatalog(
      'models-store.json',
      JSON.stringify({ anthropic: { models: [{ id: 'claude-y' }] } })
    )
    expect(listPiCliModels()).toEqual(['anthropic/claude-y', 'Custom/model-a', 'Custom/model-b'])
  })

  it('never lets a credential out — not in patterns, not in warnings', () => {
    writeDefaultFixtures()
    // Provoke the warn path too, with the key riding in the corrupt content.
    writeCatalog('models-store.json', `{"apiKey": "${FAKE_KEY}", "broken": `)

    const serialized = JSON.stringify(listPiCliModels())
    const warnings = mocks.warn.mock.calls.flat().map(String).join('\n')

    expect(serialized).not.toContain(FAKE_KEY)
    expect(warnings).not.toContain(FAKE_KEY)
  })
})

/** Drops the cache but keeps the warn-once marker — mirrors two reads in one app run. */
function resetPiModelCatalogCacheKeepWarn(): void {
  const path = join(agentDir, 'models.json')
  clock += 10
  utimesSync(path, clock, clock)
}
