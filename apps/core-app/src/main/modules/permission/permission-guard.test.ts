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

  it('requires both window.create and storage.shared for division-box flow trigger', async () => {
    const pluginId = 'flow-plugin'
    await store.grant(pluginId, 'window.create', 'user')

    const denied = guard.check(pluginId, 'division-box:flow:trigger', SDK_VERSION)
    expect(denied.allowed).toBe(false)
    expect(denied.permissionId).toBe('storage.shared')

    await store.grant(pluginId, 'storage.shared', 'user')
    const allowed = guard.check(pluginId, 'division-box:flow:trigger', SDK_VERSION)
    expect(allowed.allowed).toBe(true)
  })
})
