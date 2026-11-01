import { describe, expect, it } from 'vitest'
import { RunRefused } from './errors'
import type { PreflightEnv, PreflightInput, PreflightItem } from './preflight'
import {
  assertRunnable,
  corpusLocationProblem,
  formatPreflight,
  refusals,
  runPreflight
} from './preflight'

const HOME = '/Users/x'

function env(overrides: Partial<PreflightEnv> = {}): PreflightEnv {
  const tools = new Set(['ps', 'lsof', 'pnpm', 'sample', 'sips', 'plutil'])
  return {
    platform: 'darwin',
    nodeVersion: 'v26.0.0',
    uid: 501,
    home: HOME,
    appDir: '/repo/apps/core-app',
    probes: { listProcesses: async () => [], portHasListener: async () => false },
    lock: async () => ({ state: 'free' }),
    allocatePorts: async () => ({ cdp: 51001, inspect: 51002, vite: 51003 }),
    checkWritable: async () => undefined,
    freeBytes: async () => 80 * 1024 ** 3,
    hasTool: async (name) => tools.has(name),
    fileExists: async () => true,
    ...overrides
  }
}

const input: PreflightInput = { embedding: 'off', plannedBytes: 20 * 1024 ** 2, appCount: 60 }

async function statusOf(
  id: string,
  overrides: Partial<PreflightEnv> = {},
  extra: Partial<PreflightInput> = {}
): Promise<PreflightItem | undefined> {
  return (await runPreflight({ ...input, ...extra }, env(overrides))).find((item) => item.id === id)
}

describe('runPreflight', () => {
  it('passes on a healthy machine', async () => {
    const items = await runPreflight(input, env())
    expect(refusals(items)).toEqual([])
    expect(items.filter((item) => item.status === 'warn')).toEqual([])
    expect(() => assertRunnable(items)).not.toThrow()
  })

  it('refuses another platform, an old Node and root', async () => {
    expect((await statusOf('platform', { platform: 'linux' }))?.status).toBe('refuse')
    expect((await statusOf('node', { nodeVersion: 'v20.11.0' }))?.status).toBe('refuse')
    expect((await statusOf('user', { uid: 0 }))?.status).toBe('refuse')
  })

  it("refuses while the boss's dev server or an Electron of this repo is running", async () => {
    const item = await statusOf('instances', {
      probes: {
        portHasListener: async (port) => port === 5173,
        listProcesses: async () => [
          {
            pid: 92617,
            ppid: 1,
            command:
              '/Users/x/Workspace/Projects/talex-touch/node_modules/.pnpm/electron@41.10.1/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .'
          }
        ]
      }
    })
    expect(item?.status).toBe('refuse')
    expect(item?.detail).toContain('5173')
    expect(item?.detail).toContain('92617')
  })

  it('does not mistake the lock this run took itself for another run', async () => {
    const info = { pid: 4242, runId: 'run-x', startedAt: 1 }
    expect(
      (await statusOf('lock', { ownPid: 4242, lock: async () => ({ state: 'held', info }) }))
        ?.status
    ).toBe('pass')
  })

  it('refuses a live lock and only warns about a stale one', async () => {
    const info = { pid: 4242, runId: 'run-x', startedAt: 1 }
    expect(await statusOf('lock', { lock: async () => ({ state: 'held', info }) })).toMatchObject({
      status: 'refuse',
      detail: expect.stringContaining('4242')
    })
    expect((await statusOf('lock', { lock: async () => ({ state: 'stale', info }) }))?.status).toBe(
      'warn'
    )
  })

  it('refuses when no ports can be allocated', async () => {
    const item = await statusOf('ports', {
      allocatePorts: async () => {
        throw new Error('EADDRNOTAVAIL')
      }
    })
    expect(item).toMatchObject({
      status: 'refuse',
      detail: expect.stringContaining('EADDRNOTAVAIL')
    })
  })

  it.each([
    ['/private/tmp/corpus', /\/private, \/tmp or \/var/],
    ['/tmp/corpus', /\/private, \/tmp or \/var/],
    [`${HOME}/Workspace/corpus`, /~\/Workspace/],
    [`${HOME}/Library/corpus`, /reserved directory name: Library/],
    ['/Users/x/node_modules/corpus', /node_modules/]
  ])('refuses the corpus location %s because the indexer would skip it', async (dir, message) => {
    const item = await statusOf('corpus-location', {}, { corpusRoot: dir })
    expect(item?.status).toBe('refuse')
    expect(item?.detail).toMatch(message)
  })

  it('accepts the default shared location and refuses one that cannot be written', async () => {
    expect((await statusOf('corpus-location'))?.status).toBe('pass')
    const item = await statusOf('corpus-location', {
      checkWritable: async () => {
        throw new Error('EACCES: permission denied')
      }
    })
    expect(item).toMatchObject({ status: 'refuse', detail: expect.stringContaining('EACCES') })
  })

  it('wants the larger of 5 GiB and three times the planned corpus free, on both volumes', async () => {
    expect((await statusOf('disk-corpus', { freeBytes: async () => 4 * 1024 ** 3 }))?.status).toBe(
      'refuse'
    )
    expect(
      (
        await statusOf(
          'disk-run',
          { freeBytes: async () => 6 * 1024 ** 3 },
          { plannedBytes: 3 * 1024 ** 3 }
        )
      )?.status
    ).toBe('refuse')
    expect(
      (
        await statusOf(
          'disk-run',
          { freeBytes: async () => 10 * 1024 ** 3 },
          { plannedBytes: 3 * 1024 ** 3 }
        )
      )?.status
    ).toBe('pass')
  })

  it('warns when the planned corpus is over 100 MiB', async () => {
    expect((await statusOf('corpus-size', {}, { plannedBytes: 101 * 1024 ** 2 }))?.status).toBe(
      'warn'
    )
    expect((await statusOf('corpus-size', {}, { plannedBytes: 99 * 1024 ** 2 }))?.status).toBe(
      'pass'
    )
  })

  it('refuses without ps, lsof or pnpm and only warns about the optional tools', async () => {
    const item = await statusOf('tools', { hasTool: async (name) => name !== 'lsof' })
    expect(item).toMatchObject({ status: 'refuse', detail: 'missing: lsof' })
    expect(
      (await statusOf('tool-sample', { hasTool: async (name) => name !== 'sample' }))?.status
    ).toBe('warn')
  })

  it('refuses when the checkout cannot start the app', async () => {
    const item = await statusOf('repo', {
      fileExists: async (file) => !file.endsWith('electron-vite')
    })
    expect(item).toMatchObject({
      status: 'refuse',
      detail: expect.stringContaining('electron-vite')
    })
  })

  it('needs the embedding manifest only when embedding is on', async () => {
    expect(await statusOf('embedding', { fileExists: async () => false })).toBeUndefined()
    const item = await statusOf(
      'embedding',
      { fileExists: async (file) => !file.endsWith('local-embedding.json') },
      { embedding: 'on' }
    )
    expect(item).toMatchObject({
      status: 'refuse',
      detail: expect.stringContaining('local-embedding.json')
    })
    expect((await statusOf('embedding', {}, { embedding: 'on' }))?.status).toBe('pass')
  })

  it('warns when fewer than ten apps are installed, unless the names came from a file', async () => {
    expect(await statusOf('apps', {}, { appCount: 7 })).toMatchObject({
      status: 'warn',
      detail: expect.stringContaining('--apps-file')
    })
    expect((await statusOf('apps', {}, { appCount: 10 }))?.status).toBe('pass')
    expect(await statusOf('apps', {}, { appCount: 0, appsFromFile: true })).toBeUndefined()
  })
})

describe('formatPreflight and assertRunnable', () => {
  it('prints one line per check and a verdict', async () => {
    const items = await runPreflight({ ...input, appCount: 3 }, env({ platform: 'linux' }))
    const text = formatPreflight(items)
    expect(text).toMatch(/^REFUSE macOS: /m)
    expect(text).toMatch(/^WARN +enough installed apps/m)
    expect(text).toMatch(/^PASS +Node\.js 22 or newer/m)
    expect(text.trim().split('\n').pop()).toMatch(/1 check\(s\) refuse a run, 1 warning\(s\)\./)
  })

  it('throws RunRefused with every reason', async () => {
    const items = await runPreflight(input, env({ platform: 'linux', uid: 0 }))
    let failure: unknown
    try {
      assertRunnable(items)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(RunRefused)
    expect((failure as RunRefused).reasons).toHaveLength(2)
  })
})

describe('corpusLocationProblem', () => {
  it('accepts the shared location', () => {
    expect(
      corpusLocationProblem('/Users/Shared/tuff-stress/20261030T010203Z-ab12/corpus', HOME)
    ).toBeNull()
  })
})
