import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PermissionGuard } from './permission-guard'
import { PermissionStore } from './permission-store'

const SDK_VERSION = 251212
const TEST_PLUGIN_ID = 'test-plugin'
const TEST_PERMISSION_ID = 'fs.read'
const TEST_API = 'fs:read'

describe('permissionGuardPerformance', () => {
  let tempDir = ''
  let store: PermissionStore
  let guard: PermissionGuard

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'permission-perf-'))
    store = new PermissionStore(tempDir)
    await store.initialize()
    await store.grant(TEST_PLUGIN_ID, TEST_PERMISSION_ID, 'user')
    guard = new PermissionGuard(store)
  })

  afterEach(async () => {
    await store?.shutdown()
    if (!tempDir) return
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('keeps permission checks under the 5ms target', () => {
    const warmup = 100
    for (let i = 0; i < warmup; i += 1) {
      guard.check(TEST_PLUGIN_ID, TEST_API, SDK_VERSION)
    }

    guard.resetPerformanceStats()

    const iterations = 2000
    for (let i = 0; i < iterations; i += 1) {
      guard.check(TEST_PLUGIN_ID, TEST_API, SDK_VERSION)
    }

    const stats = guard.getPerformanceStats()
    expect(stats.totalChecks).toBe(iterations)
    expect(stats.avgDurationMs).toBeLessThan(5)
    expect(stats.maxDurationMs).toBeLessThan(10)
    expect(stats.meetsTarget).toBe(true)
  })

  it('blocks runtime access when permission was granted before but is no longer declared', () => {
    store.setDeclaredPermissions(TEST_PLUGIN_ID, {
      required: ['clipboard.read'],
      optional: []
    })

    const result = guard.check(TEST_PLUGIN_ID, TEST_API, SDK_VERSION)

    expect(result.allowed).toBe(false)
    expect(result.showRequest).toBe(false)
    expect(result.reason).toContain('previously granted')
  })

  it('allows runtime access when permission is both declared and granted', () => {
    store.setDeclaredPermissions(TEST_PLUGIN_ID, {
      required: [TEST_PERMISSION_ID],
      optional: []
    })

    const result = guard.check(TEST_PLUGIN_ID, TEST_API, SDK_VERSION)

    expect(result.allowed).toBe(true)
  })

  it('blocks runtime access when sdkapi is missing', () => {
    const result = guard.check(TEST_PLUGIN_ID, TEST_API, undefined)

    expect(result.allowed).toBe(false)
    expect(result.code).toBe('SDKAPI_BLOCKED')
    expect(result.showRequest).toBe(false)
    expect(result.reason).toContain('sdkapi')
  })

  it('maps division-box window APIs to the default window.create permission', async () => {
    const pluginId = 'division-box-plugin'
    store.setDeclaredPermissions(pluginId, {
      required: ['window.create'],
      optional: []
    })

    const result = guard.check(pluginId, 'division-box:window:toggle-pin', SDK_VERSION)
    expect(result.allowed).toBe(true)
    expect(result.permissionId).toBe('window.create')
  })

  it.each(['window:new', 'window:visible', 'window:command', 'window:property'])(
    'maps privileged plugin event %s to window.create',
    async (eventName) => {
      store.setDeclaredPermissions(TEST_PLUGIN_ID, {
        required: ['window.create'],
        optional: []
      })
      await store.grant(TEST_PLUGIN_ID, 'window.create', 'user')

      const result = guard.check(TEST_PLUGIN_ID, eventName, SDK_VERSION)

      expect(result.allowed).toBe(true)
      expect(result.permissionId).toBe('window.create')
    }
  )
})

describe('unmapped API inventory', () => {
  let tempDir = ''
  let store: PermissionStore
  let guard: PermissionGuard

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'permission-unmapped-'))
    store = new PermissionStore(tempDir)
    await store.initialize()
    guard = new PermissionGuard(store)
  })

  afterEach(async () => {
    await store?.shutdown()
    if (!tempDir) return
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('still allows an unmapped name, but records it', () => {
    // Deliberately pins the current behaviour rather than the desired one: the default is
    // not being flipped here, only made observable (#915).
    const result = guard.check(TEST_PLUGIN_ID, 'totally:unmapped:api', SDK_VERSION)

    expect(result.allowed).toBe(true)
    expect(guard.getUnmappedApis()).toEqual([
      { apiName: 'totally:unmapped:api', count: 1, plugins: [TEST_PLUGIN_ID] }
    ])
  })

  it('counts repeats and collects every plugin that reached it', () => {
    guard.check('plugin-a', 'unmapped:one', SDK_VERSION)
    guard.check('plugin-b', 'unmapped:one', SDK_VERSION)
    guard.check('plugin-a', 'unmapped:one', SDK_VERSION)

    const [entry] = guard.getUnmappedApis()
    expect(entry.count).toBe(3)
    expect([...entry.plugins].sort()).toEqual(['plugin-a', 'plugin-b'])
  })

  it('does not record a name that the mapping table covers', () => {
    guard.check(TEST_PLUGIN_ID, 'search:root-results:push', SDK_VERSION)

    expect(guard.getUnmappedApis()).toEqual([])
  })

  it('orders the inventory by frequency, so the flip starts with the common names', () => {
    guard.check(TEST_PLUGIN_ID, 'unmapped:rare', SDK_VERSION)
    guard.check(TEST_PLUGIN_ID, 'unmapped:common', SDK_VERSION)
    guard.check(TEST_PLUGIN_ID, 'unmapped:common', SDK_VERSION)

    expect(guard.getUnmappedApis().map((entry) => entry.apiName)).toEqual([
      'unmapped:common',
      'unmapped:rare'
    ])
  })
})
