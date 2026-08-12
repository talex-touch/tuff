import fs from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { darwinGetAppInfoMock } = vi.hoisted(() => ({
  darwinGetAppInfoMock: vi.fn()
}))

vi.mock('./darwin', () => ({
  getApps: vi.fn(async () => []),
  getAppInfo: darwinGetAppInfoMock
}))

const APP_PATH = '/Applications/Probe.app'

function buildAppInfo() {
  return {
    name: 'Probe',
    displayName: 'Probe',
    path: APP_PATH,
    icon: '',
    bundleId: 'com.example.probe',
    launchKind: 'bundle' as const,
    launchTarget: APP_PATH,
    lastModified: new Date('2026-08-05T00:00:00.000Z')
  }
}

describe('AppScanner.resolveAppInfoByPath', () => {
  let restorePlatform: () => void

  beforeEach(() => {
    vi.clearAllMocks()
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    restorePlatform = () => {
      Object.defineProperty(process, 'platform', { value: original, configurable: true })
    }
  })

  afterEach(() => {
    restorePlatform()
    vi.restoreAllMocks()
  })

  it('resolves app metadata when the adapter succeeds', async () => {
    const { appScanner } = await import('./app-scanner')
    darwinGetAppInfoMock.mockResolvedValue(buildAppInfo())

    const resolution = await appScanner.resolveAppInfoByPath(APP_PATH)

    expect(resolution).toMatchObject({ ok: true })
    expect(resolution.ok && resolution.appInfo.path).toBe(APP_PATH)
  })

  it('classifies a thrown adapter error as retryable rather than as "not an app"', async () => {
    const { appScanner } = await import('./app-scanner')
    // The shape the Doubao incident took: the lazily imported platform chunk was gone, so the
    // adapter threw on first use. It must not be reported as a terminal "not an app".
    darwinGetAppInfoMock.mockRejectedValue(
      new Error("Cannot find module './chunks/darwin-DkXv7dnN.js'")
    )

    const resolution = await appScanner.resolveAppInfoByPath(APP_PATH)

    expect(resolution).toMatchObject({ ok: false, outcome: 'failed' })
  })

  it('treats a bundle without a manifest as terminal', async () => {
    const { appScanner } = await import('./app-scanner')
    darwinGetAppInfoMock.mockResolvedValue(null)
    vi.spyOn(fs, 'access').mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    const resolution = await appScanner.resolveAppInfoByPath(APP_PATH)

    expect(resolution).toMatchObject({ ok: false, outcome: 'not-app' })
  })

  it('treats an unresolved but still-present bundle as retryable', async () => {
    const { appScanner } = await import('./app-scanner')
    // The adapter handled its own error and answered null; the manifest is still on disk, so this
    // is a resolution failure and not evidence that the path stopped being an app.
    darwinGetAppInfoMock.mockResolvedValue(null)
    vi.spyOn(fs, 'access').mockResolvedValue(undefined as never)

    const resolution = await appScanner.resolveAppInfoByPath(APP_PATH)

    expect(resolution).toMatchObject({ ok: false, outcome: 'failed' })
  })

  // No production code calls this any more — the provider wants the classified result — but the
  // test doubles for AppScanner still expose it, so the nullable shape has to keep agreeing with
  // the classified one or those doubles would drift away from the real scanner.
  it('keeps the nullable lookup collapsing both failure classes to null', async () => {
    const { appScanner } = await import('./app-scanner')
    darwinGetAppInfoMock.mockResolvedValue(null)
    vi.spyOn(fs, 'access').mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))

    await expect(appScanner.getAppInfoByPath(APP_PATH)).resolves.toBeNull()

    darwinGetAppInfoMock.mockResolvedValue(buildAppInfo())
    await expect(appScanner.getAppInfoByPath(APP_PATH)).resolves.toMatchObject({ path: APP_PATH })
  })
})
