import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
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
    await store.grant(TEST_PLUGIN_ID, TEST_PERMISSION_ID, 'user')
    guard = new PermissionGuard(store)
  })

  afterEach(async () => {
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
})
