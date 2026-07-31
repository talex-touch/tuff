import type { PluginActivationIdentity } from '@talex-touch/utils/transport'
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { mkdtemp, readdir, realpath, rm, truncate } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginHostCapabilityRegistry } from './plugin-host-capabilities'
import {
  createFixedPluginBrowserDataQuery,
  createFixedPluginBrowserDataService,
  createPluginBrowserDataCapabilities,
  PLUGIN_BROWSER_DATA_MAX_BOOKMARK_BYTES,
  PLUGIN_BROWSER_DATA_MAX_ROWS_PER_PROFILE,
  type PluginBrowserDataFixedQueryId,
  type PluginBrowserDataQuery
} from './plugin-browser-data-capabilities'

const activation: PluginActivationIdentity = Object.freeze({
  name: 'touch-browser-data',
  pluginInstanceId: 'browser-data-instance',
  activationGeneration: 1,
  key: 'browser-data-key'
})

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function fixtureRoot(): Promise<{
  root: string
  home: string
  appData: string
  temp: string
  chromeRoot: string
  profileRoot: string
}> {
  const rawRoot = await mkdtemp(path.join(os.tmpdir(), 'tuff-browser-data-capability-'))
  roots.push(rawRoot)
  const root = await realpath(rawRoot)
  const home = path.join(root, 'home')
  const appData = path.join(root, 'app-data')
  const temp = path.join(root, 'temp')
  const chromeRoot = path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')
  const profileRoot = path.join(chromeRoot, 'Default')
  mkdirSync(profileRoot, { recursive: true })
  mkdirSync(appData, { recursive: true })
  mkdirSync(temp, { recursive: true })
  return { root, home, appData, temp, chromeRoot, profileRoot }
}

async function waitForTemporaryDatabase(tempDirectory: string): Promise<void> {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const entries = await readdir(tempDirectory)
    if (entries.some((entry) => existsSync(path.join(tempDirectory, entry, 'browser.sqlite'))))
      return
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
  throw new Error('BROWSER_DATA_TEMP_COPY_NOT_OBSERVED')
}

function bookmarkPayload(count = 1): string {
  return JSON.stringify({
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Docs',
        children: Array.from({ length: count }, (_value, index) => ({
          type: 'url',
          name: `Tuff ${index}`,
          url: `https://example.com/${index}`
        }))
      }
    }
  })
}

function queryRows(_queryId: PluginBrowserDataFixedQueryId) {
  return {
    rows: [
      {
        url: 'https://history.example/',
        title: 'History',
        rawVisit: 11_644_473_600_000_000 + Date.now() * 1_000
      }
    ],
    columns: []
  }
}

async function createHarness(
  options: {
    query?: PluginBrowserDataQuery
    enabledSources?: readonly ('bookmarks' | 'history')[]
    readAllowed?: boolean
    indexAllowed?: boolean
    platform?: NodeJS.Platform
  } = {}
) {
  const fixture = await fixtureRoot()
  let current: PluginActivationIdentity | undefined = activation
  let hostGeneration = 7
  let readAllowed = options.readAllowed ?? true
  let indexAllowed = options.indexAllowed ?? true
  let enabledSources = options.enabledSources ?? (['bookmarks', 'history'] as const)
  const watchers = new Map<string, Set<() => void>>()
  const query =
    options.query ??
    createFixedPluginBrowserDataQuery(async (_databasePath, queryId) => queryRows(queryId))
  const service = createFixedPluginBrowserDataService({
    platform: options.platform ?? 'darwin',
    homeDirectory: fixture.home,
    appDataDirectory: fixture.appData,
    tempDirectory: fixture.temp,
    query
  })
  const watch = (permissionId: string, onRevoke: () => void): (() => void) => {
    const handlers = watchers.get(permissionId) ?? new Set<() => void>()
    handlers.add(onRevoke)
    watchers.set(permissionId, handlers)
    return () => handlers.delete(onRevoke)
  }
  const capability = createPluginBrowserDataCapabilities({
    activation,
    resolveCurrentActivation: () => current,
    resolveHostGeneration: () => hostGeneration,
    resolveEnabledSources: () => enabledSources,
    authorizeRead: () => readAllowed,
    authorizeIndex: () => indexAllowed,
    watchReadPermissionRevoked: (_pluginName, onRevoke) => watch('fs.read', onRevoke),
    watchIndexPermissionRevoked: (_pluginName, onRevoke) => watch('fs.index', onRevoke),
    service
  })
  const registry = new PluginHostCapabilityRegistry({
    owner: { protocolVersion: 2, activationHandle: 'browser-data-host', hostGeneration: 7 },
    activation,
    resolveCurrentActivation: () => current,
    authorize: (_pluginName, permissionId) => permissionId !== 'fs.read' || readAllowed,
    watchPermissionRevoked: (_pluginName, permissionId, onRevoke) => watch(permissionId, onRevoke),
    isActive: () => true,
    onFatalViolation() {}
  })
  registry.register(capability.definitions[0])
  return {
    ...fixture,
    capability,
    registry,
    service,
    revoke(permissionId: 'fs.read' | 'fs.index') {
      if (permissionId === 'fs.read') readAllowed = false
      else indexAllowed = false
      for (const listener of [...(watchers.get(permissionId) ?? [])]) listener()
    },
    rotate() {
      current = { ...activation, activationGeneration: 2, key: 'rotated-key' }
    },
    rotateHost() {
      hostGeneration = 8
    },
    setEnabledSources(value: readonly ('bookmarks' | 'history')[]) {
      enabledSources = value
    }
  }
}

describe('isolated browser-data capability', () => {
  it('scans bounded Chromium bookmarks without returning host paths or native fields', async () => {
    const harness = await createHarness()
    writeFileSync(path.join(harness.profileRoot, 'Bookmarks'), bookmarkPayload(2))

    const result = await harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['bookmarks'],
      browser: 'chrome'
    })

    expect(result).toMatchObject({
      operation: 'scan',
      status: 'completed',
      records: [
        {
          source: 'bookmarks',
          browser: 'chrome',
          browserName: 'Chrome',
          profile: 'Default',
          title: 'Tuff 0',
          url: 'https://example.com/0',
          folder: 'Docs'
        },
        {
          source: 'bookmarks',
          browser: 'chrome',
          browserName: 'Chrome',
          profile: 'Default',
          title: 'Tuff 1',
          url: 'https://example.com/1',
          folder: 'Docs'
        }
      ],
      diagnostics: [
        {
          source: 'bookmarks',
          browser: 'chrome',
          status: 'available',
          code: 'BROWSER_DATA_OK',
          profileCount: 1,
          recordCount: 2
        }
      ]
    })
    expect(JSON.stringify(result)).not.toMatch(/Library|Application Support|path|dev|ino|sqlite/i)
  })

  it('sanitizes control characters from display text and drops control-character URLs', async () => {
    const harness = await createHarness()
    writeFileSync(
      path.join(harness.profileRoot, 'Bookmarks'),
      JSON.stringify({
        roots: {
          bookmark_bar: {
            type: 'folder',
            name: 'Docs\u0085Private',
            children: [
              {
                type: 'url',
                name: 'Safe\u0000Title',
                url: 'https://example.com/safe'
              },
              {
                type: 'url',
                name: 'Dropped',
                url: 'https://example.com/control\u0000path'
              }
            ]
          }
        }
      })
    )

    const result = await harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['bookmarks'],
      browser: 'chrome'
    })

    expect(result).toMatchObject({
      records: [
        {
          title: 'Safe Title',
          folder: 'Docs Private',
          url: 'https://example.com/safe'
        }
      ]
    })
    const serialized = JSON.stringify(result)
    expect(
      Array.from(serialized).some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || (code >= 127 && code <= 159)
      })
    ).toBe(false)
  })

  it('uses the main-supplied Linux config root and reports fixed Arc selection unsupported', async () => {
    const harness = await createHarness({ platform: 'linux' })
    const linuxProfile = path.join(harness.appData, 'google-chrome', 'Default')
    mkdirSync(linuxProfile, { recursive: true })
    writeFileSync(path.join(linuxProfile, 'Bookmarks'), bookmarkPayload())

    await expect(
      harness.registry.dispatch('browser-data.scan', {
        operation: 'scan',
        sources: ['bookmarks'],
        browser: 'chrome'
      })
    ).resolves.toMatchObject({
      records: [{ browser: 'chrome', title: 'Tuff 0' }],
      diagnostics: [{ status: 'available', code: 'BROWSER_DATA_OK' }]
    })
    await expect(
      harness.registry.dispatch('browser-data.scan', {
        operation: 'scan',
        sources: ['bookmarks'],
        browser: 'arc'
      })
    ).resolves.toMatchObject({
      records: [],
      diagnostics: [{ status: 'unsupported', code: 'BROWSER_DATA_PLATFORM_UNSUPPORTED' }]
    })
  })

  it('copies History, WAL and SHM into an owned temp directory and removes it after fixed query', async () => {
    let observedDirectory = ''
    const query = createFixedPluginBrowserDataQuery(async (databasePath, queryId) => {
      observedDirectory = path.dirname(databasePath)
      expect(queryId).toBe('chromium-history')
      expect(databasePath).not.toContain('Application Support')
      expect(existsSync(databasePath)).toBe(true)
      expect(existsSync(`${databasePath}-wal`)).toBe(true)
      expect(existsSync(`${databasePath}-shm`)).toBe(true)
      return queryRows(queryId)
    })
    const harness = await createHarness({ query })
    writeFileSync(path.join(harness.profileRoot, 'History'), 'fixture-db')
    writeFileSync(path.join(harness.profileRoot, 'History-wal'), 'fixture-wal')
    writeFileSync(path.join(harness.profileRoot, 'History-shm'), 'fixture-shm')

    const result = await harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['history'],
      browser: 'chrome'
    })

    expect(result).toMatchObject({
      status: 'completed',
      records: [{ source: 'history', browser: 'chrome', title: 'History' }]
    })
    expect(observedDirectory).not.toBe('')
    expect(existsSync(observedDirectory)).toBe(false)
  })

  it('rejects a symlinked temporary root before copying browser history', async () => {
    const query = vi.fn(async () => queryRows('chromium-history'))
    const harness = await createHarness({ query: createFixedPluginBrowserDataQuery(query) })
    const outsideTemp = path.join(harness.root, 'outside-temp')
    await rm(harness.temp, { recursive: true, force: true })
    mkdirSync(outsideTemp, { recursive: true })
    symlinkSync(outsideTemp, harness.temp, 'dir')
    writeFileSync(path.join(harness.profileRoot, 'History'), 'fixture-db')

    const result = await harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['history'],
      browser: 'chrome'
    })

    expect(result).toMatchObject({
      records: [],
      diagnostics: [{ status: 'failed', code: 'BROWSER_DATA_QUERY_FAILED' }]
    })
    expect(query).not.toHaveBeenCalled()
    await expect(readdir(outsideTemp)).resolves.toEqual([])
  })

  it('rejects a History snapshot when a WAL appears during the database copy', async () => {
    const query = vi.fn(async () => queryRows('chromium-history'))
    const harness = await createHarness({ query: createFixedPluginBrowserDataQuery(query) })
    const historyPath = path.join(harness.profileRoot, 'History')
    writeFileSync(historyPath, '')
    await truncate(historyPath, 64 * 1024 * 1024)

    const pending = harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['history'],
      browser: 'chrome'
    })
    await waitForTemporaryDatabase(harness.temp)
    writeFileSync(`${historyPath}-wal`, 'late-wal')

    await expect(pending).resolves.toMatchObject({
      records: [],
      diagnostics: [{ status: 'failed', code: 'BROWSER_DATA_QUERY_FAILED' }]
    })
    expect(query).not.toHaveBeenCalled()
    await expect(readdir(harness.temp)).resolves.toEqual([])
  })

  it('limits Chromium profile discovery to eight fixed profile directories', async () => {
    const harness = await createHarness()
    for (let index = 1; index <= 10; index += 1) {
      const profile = path.join(harness.chromeRoot, `Profile ${index}`)
      mkdirSync(profile, { recursive: true })
      writeFileSync(path.join(profile, 'Bookmarks'), bookmarkPayload())
    }

    const result = await harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['bookmarks'],
      browser: 'chrome'
    })

    expect(result).toMatchObject({
      diagnostics: [{ profileCount: 8, recordCount: 8 }]
    })
    expect((result as { records: unknown[] }).records).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'bookmarks', title: 'Tuff 0' })])
    )
    expect((result as { records: unknown[] }).records).toHaveLength(8)
  })

  it('rejects child-selected paths, SQL, duplicate sources and hostile accessors before host work', async () => {
    const query = vi.fn(async () => queryRows('chromium-history'))
    const harness = await createHarness({ query: createFixedPluginBrowserDataQuery(query) })
    const getter = vi.fn(() => '/private')
    const requests = [
      { operation: 'scan', sources: ['bookmarks'], path: '/private' },
      { operation: 'scan', sources: ['history'], sql: 'SELECT * FROM urls' },
      { operation: 'scan', sources: ['bookmarks', 'bookmarks'] },
      { operation: 'scan', sources: ['bookmarks'], browser: 'firefox' },
      Object.defineProperty({ operation: 'scan', sources: ['bookmarks'] }, 'path', {
        enumerable: true,
        get: getter
      })
    ]

    for (const request of requests) {
      await expect(harness.registry.dispatch('browser-data.scan', request)).rejects.toMatchObject({
        code: 'PLUGIN_HOST_CAPABILITY_INVALID_REQUEST'
      })
    }
    expect(getter).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it('fails closed for symlink roots and oversized bookmark files', async () => {
    const harness = await createHarness()
    const realRoot = `${harness.chromeRoot}-real`
    await rm(harness.chromeRoot, { recursive: true, force: true })
    mkdirSync(path.join(realRoot, 'Default'), { recursive: true })
    writeFileSync(path.join(realRoot, 'Default', 'Bookmarks'), bookmarkPayload())
    symlinkSync(realRoot, harness.chromeRoot, 'dir')

    const symlinked = await harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['bookmarks'],
      browser: 'chrome'
    })
    expect(symlinked).toMatchObject({
      records: [],
      diagnostics: [{ code: 'BROWSER_DATA_NOT_FOUND' }]
    })

    await rm(harness.chromeRoot, { recursive: true, force: true })
    mkdirSync(harness.profileRoot, { recursive: true })
    writeFileSync(
      path.join(harness.profileRoot, 'Bookmarks'),
      Buffer.alloc(PLUGIN_BROWSER_DATA_MAX_BOOKMARK_BYTES + 1, 0x20)
    )
    const oversized = await harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['bookmarks'],
      browser: 'chrome'
    })
    expect(oversized).toMatchObject({
      records: [],
      diagnostics: [{ status: 'failed', code: 'BROWSER_DATA_SOURCE_TOO_LARGE' }]
    })
  })

  it('does not require history permission after main disables the history source', async () => {
    const harness = await createHarness({
      enabledSources: ['bookmarks'],
      indexAllowed: false
    })
    writeFileSync(path.join(harness.profileRoot, 'Bookmarks'), bookmarkPayload())

    await expect(
      harness.registry.dispatch('browser-data.scan', {
        operation: 'scan',
        sources: ['bookmarks', 'history'],
        browser: 'chrome'
      })
    ).resolves.toMatchObject({
      records: [{ source: 'bookmarks', title: 'Tuff 0' }],
      diagnostics: [{ source: 'bookmarks', code: 'BROWSER_DATA_OK' }]
    })
  })

  it('rejects disabled sources, missing history permission and stale activation before query', async () => {
    const query = vi.fn(async () => queryRows('chromium-history'))
    const disabled = await createHarness({
      enabledSources: [],
      query: createFixedPluginBrowserDataQuery(query)
    })
    await expect(
      disabled.registry.dispatch('browser-data.scan', {
        operation: 'scan',
        sources: ['bookmarks']
      })
    ).resolves.toMatchObject({ status: 'blocked', code: 'BROWSER_DATA_SOURCE_DISABLED' })

    const deniedRead = await createHarness({
      readAllowed: false,
      query: createFixedPluginBrowserDataQuery(query)
    })
    await expect(
      deniedRead.registry.dispatch('browser-data.scan', {
        operation: 'scan',
        sources: ['bookmarks']
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })

    const denied = await createHarness({
      indexAllowed: false,
      query: createFixedPluginBrowserDataQuery(query)
    })
    await expect(
      denied.registry.dispatch('browser-data.scan', {
        operation: 'scan',
        sources: ['history']
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })

    const stale = await createHarness({ query: createFixedPluginBrowserDataQuery(query) })
    stale.rotate()
    await expect(
      stale.registry.dispatch('browser-data.scan', {
        operation: 'scan',
        sources: ['bookmarks']
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_STALE_ACTIVATION' })

    const wrongHost = await createHarness({ query: createFixedPluginBrowserDataQuery(query) })
    wrongHost.rotateHost()
    await expect(
      wrongHost.registry.dispatch('browser-data.scan', {
        operation: 'scan',
        sources: ['bookmarks']
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED' })
    expect(query).not.toHaveBeenCalled()
  })

  it('aborts an in-flight history query on revoke and waits for cleanup during close', async () => {
    let queryStarted!: () => void
    const started = new Promise<void>((resolve) => {
      queryStarted = resolve
    })
    const query = createFixedPluginBrowserDataQuery(async (_databasePath, _queryId, signal) => {
      queryStarted()
      await new Promise<void>((_resolve, reject) => {
        const onAbort = () => reject(new Error('cancelled'))
        signal.addEventListener('abort', onAbort, { once: true })
      })
      return { rows: [], columns: [] }
    })
    const harness = await createHarness({ query })
    writeFileSync(path.join(harness.profileRoot, 'History'), 'fixture-db')
    const pending = harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['history'],
      browser: 'chrome'
    })
    await started
    harness.revoke('fs.index')
    const close = harness.capability.close()

    await expect(pending).rejects.toMatchObject({
      code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'
    })
    await expect(close).resolves.toBeUndefined()
    expect(existsSync(harness.temp)).toBe(true)
    await expect((await import('node:fs/promises')).readdir(harness.temp)).resolves.toEqual([])
  })

  it('redacts fixed-query schema failures and cleans the temporary copy', async () => {
    let temporaryDirectory = ''
    const query = createFixedPluginBrowserDataQuery(async (databasePath) => {
      temporaryDirectory = path.dirname(databasePath)
      throw new Error(`SQLITE_ERROR: no such table: urls at ${databasePath}`)
    })
    const harness = await createHarness({ query })
    writeFileSync(path.join(harness.profileRoot, 'History'), 'fixture-db')

    const result = await harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['history'],
      browser: 'chrome'
    })

    expect(result).toMatchObject({
      records: [],
      diagnostics: [{ status: 'failed', code: 'BROWSER_DATA_QUERY_FAILED' }]
    })
    expect(temporaryDirectory).not.toBe('')
    expect(existsSync(temporaryDirectory)).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(
      /SQLITE_ERROR|no such table|browser\.sqlite|Library/i
    )
  })

  it('fails a profile closed when fixed query returns more than the row bound', async () => {
    const query = createFixedPluginBrowserDataQuery(async () => ({
      rows: Array.from({ length: PLUGIN_BROWSER_DATA_MAX_ROWS_PER_PROFILE + 1 }, () => ({
        url: 'https://example.com/',
        title: 'overflow',
        rawVisit: Date.now() * 1_000
      })),
      columns: []
    }))
    const harness = await createHarness({ query })
    writeFileSync(path.join(harness.profileRoot, 'History'), 'fixture-db')

    const result = await harness.registry.dispatch('browser-data.scan', {
      operation: 'scan',
      sources: ['history'],
      browser: 'chrome'
    })

    expect(result).toMatchObject({
      records: [],
      diagnostics: [{ status: 'failed', code: 'BROWSER_DATA_RESULT_LIMIT' }]
    })
  })
})
