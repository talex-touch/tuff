import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  computeFileSha256,
  getHerdrInstallHint,
  HerdrBinaryManager,
  isSupportedHerdrPlatform,
  mapDiscoveryBinarySource,
  parseHerdrVersionOutput,
  verifyBinarySha256
} from './binary-manager'

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe('herdr-core binary-manager', () => {
  it('maps discovery sources to HerdrBinarySource contract values', () => {
    expect(mapDiscoveryBinarySource('settings')).toBe('custom')
    expect(mapDiscoveryBinarySource('path')).toBe('system')
    expect(mapDiscoveryBinarySource('local-bin')).toBe('system')
    expect(mapDiscoveryBinarySource('macos-bundle')).toBe('bundle')
    expect(mapDiscoveryBinarySource('resources')).toBe('packaged-resource')
    expect(mapDiscoveryBinarySource(null)).toBe('missing')
    expect(mapDiscoveryBinarySource(undefined)).toBe('missing')
  })

  it('parses real `hc 0.1.21` and other version output formats cleanly', () => {
    expect(parseHerdrVersionOutput('hc 0.1.21\n')).toBe('0.1.21')
    expect(parseHerdrVersionOutput('herdr-core 0.2.0-beta.1 (commit abc123)\n')).toBe(
      '0.2.0-beta.1'
    )
    expect(parseHerdrVersionOutput('v1.4.0')).toBe('1.4.0')
    expect(parseHerdrVersionOutput('0.1.21')).toBe('0.1.21')
    expect(parseHerdrVersionOutput('not a version')).toBeNull()
    expect(parseHerdrVersionOutput('   ')).toBeNull()
  })

  it('evaluates supported platforms and produces platform-specific install hints', () => {
    expect(isSupportedHerdrPlatform('darwin', 'arm64')).toBe(true)
    expect(isSupportedHerdrPlatform('darwin', 'x64')).toBe(true)
    expect(isSupportedHerdrPlatform('linux', 'x64')).toBe(true)
    expect(isSupportedHerdrPlatform('linux', 'arm64')).toBe(true)
    expect(isSupportedHerdrPlatform('win32', 'x64')).toBe(true)
    expect(isSupportedHerdrPlatform('win32', 'arm64')).toBe(true)
    expect(isSupportedHerdrPlatform('freebsd', 'x64')).toBe(false)
    expect(isSupportedHerdrPlatform('linux', 'ia32')).toBe(false)

    expect(getHerdrInstallHint('darwin', 'arm64')).toContain('Herdr Core.app')
    expect(getHerdrInstallHint('win32', 'x64')).toContain('herdr-core.exe')
    expect(getHerdrInstallHint('linux', 'x64')).toContain('~/.local/bin/herdr-core')
    expect(getHerdrInstallHint('freebsd', 'x64')).toContain('not supported')
  })

  it('inspects all five binary sources with bounded version probe caching', async () => {
    const execVersion = vi.fn(async (binaryPath: string) => {
      if (binaryPath.includes('custom')) return 'hc 0.2.0\n'
      return 'hc 0.1.21\n'
    })
    let statMtime = 1_000
    const statFile = vi.fn(async () => ({ mtimeMs: statMtime, size: 4096 }))

    const makeManager = (executableTarget: string | null) =>
      new HerdrBinaryManager({
        platform: 'darwin',
        arch: 'arm64',
        discoveryDeps: {
          platform: 'darwin',
          homedir: () => '/Users/tester',
          resourcesPath: '/Applications/Tuff.app/Contents/Resources',
          env: { PATH: '/opt/bin:/usr/bin' },
          isExecutable: async (candidate) => executableTarget === candidate
        },
        execVersion,
        statFile
      })

    // 1. custom override
    const customMgr = makeManager('/Users/tester/bin/custom-herdr')
    const customInfo = await customMgr.inspect({ binaryPath: '~/bin/custom-herdr' })
    expect(customInfo).toEqual({
      source: 'custom',
      path: '/Users/tester/bin/custom-herdr',
      version: '0.2.0',
      platform: 'darwin',
      arch: 'arm64',
      supported: true,
      installHint: null
    })

    // Cache hit avoids re-running --version when mtime & size are unchanged.
    const cachedInfo = await customMgr.inspect({ binaryPath: '~/bin/custom-herdr' })
    expect(cachedInfo.version).toBe('0.2.0')
    expect(execVersion).toHaveBeenCalledTimes(1)

    // File mtime change invalidates cache and re-probes.
    statMtime = 2_000
    await customMgr.inspect({ binaryPath: '~/bin/custom-herdr' })
    expect(execVersion).toHaveBeenCalledTimes(2)

    // 2. system (PATH or ~/.local/bin)
    const systemInfo = await makeManager('/opt/bin/herdr-core').inspect()
    expect(systemInfo).toMatchObject({
      source: 'system',
      path: '/opt/bin/herdr-core',
      version: '0.1.21',
      installHint: null
    })

    // 3. macOS bundle
    const bundlePath =
      '/Users/tester/.local/share/herdr-core/active/Herdr Core.app/Contents/MacOS/herdr-core'
    const bundleInfo = await makeManager(bundlePath).inspect()
    expect(bundleInfo).toMatchObject({
      source: 'bundle',
      path: bundlePath,
      version: '0.1.21',
      installHint: null
    })

    // 4. packaged-resource (preferring resources/herdr-core/herdr-core)
    const stagedResourcePath = '/Applications/Tuff.app/Contents/Resources/herdr-core/herdr-core'
    const packagedInfo = await makeManager(stagedResourcePath).inspect()
    expect(packagedInfo).toMatchObject({
      source: 'packaged-resource',
      path: stagedResourcePath,
      version: '0.1.21',
      installHint: null
    })

    // 5. missing
    const missingInfo = await makeManager(null).inspect()
    expect(missingInfo).toEqual({
      source: 'missing',
      path: null,
      version: null,
      platform: 'darwin',
      arch: 'arm64',
      supported: true,
      installHint: expect.stringContaining('herdr-core')
    })
  })

  it('never throws or negative-caches when --version probe transiently fails or times out', async () => {
    let attempts = 0
    const execVersion = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error('ETIMEDOUT')
      }
      return 'hc 0.1.21\n'
    })
    const manager = new HerdrBinaryManager({
      platform: 'linux',
      arch: 'x64',
      discoveryDeps: {
        platform: 'linux',
        homedir: () => '/home/tester',
        env: { PATH: '/usr/local/bin' },
        isExecutable: async (candidate) => candidate === '/usr/local/bin/herdr-core'
      },
      statFile: async () => ({ mtimeMs: 100, size: 512 }),
      execVersion
    })

    const first = await manager.inspect()
    expect(first).toMatchObject({
      source: 'system',
      path: '/usr/local/bin/herdr-core',
      version: null,
      supported: true,
      installHint: null
    })

    // Second call must re-probe rather than returning a poisoned null cache entry.
    const second = await manager.inspect()
    expect(second.version).toBe('0.1.21')
    expect(execVersion).toHaveBeenCalledTimes(2)

    // Third call hits the cached non-null version.
    const third = await manager.inspect()
    expect(third.version).toBe('0.1.21')
    expect(execVersion).toHaveBeenCalledTimes(2)
  })

  it('verifies binary SHA-256 digests and fails closed on mismatch or malformed input', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'herdr-bin-sha-'))
    tempDirs.push(dir)
    const filePath = path.join(dir, 'herdr-core')
    const payload = Buffer.from('#!/bin/sh\necho "hc 0.1.21"\n', 'utf8')
    await writeFile(filePath, payload)

    const expected = createHash('sha256').update(payload).digest('hex')
    expect(await computeFileSha256(filePath)).toBe(expected)

    expect(await verifyBinarySha256(filePath, expected.toUpperCase())).toEqual({
      ok: true,
      actual: expected
    })

    const mismatch = await verifyBinarySha256(filePath, '0'.repeat(64))
    expect(mismatch.ok).toBe(false)
    expect(mismatch.actual).toBe(expected)
    expect(mismatch.reason).toContain('mismatch')

    const malformed = await verifyBinarySha256(filePath, 'not-a-sha256')
    expect(malformed).toEqual({
      ok: false,
      actual: null,
      reason: expect.stringContaining('64 hexadecimal')
    })

    const missing = await verifyBinarySha256(path.join(dir, 'nope'), expected)
    expect(missing.ok).toBe(false)
    expect(missing.actual).toBeNull()
  })
})
