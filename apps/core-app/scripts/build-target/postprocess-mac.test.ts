import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)

interface ZipPlan {
  action: 'skip' | 'create'
  appName: string
  appParent: string
  appPath: string
  bundleArch: string
  existingZipPath?: string
  zipPath?: string
  absZipPath?: string
}

const {
  findAppDirs,
  planMacAppZipArchives,
  postProcessMacArtifacts,
  resolveMacAppBundleArch,
  zipApps
} = require('./postprocess-mac.js') as {
  findAppDirs: (dir: string) => string[]
  planMacAppZipArchives: (
    appDirs: string[],
    distDir: string,
    version: string,
    fallbackArch: string,
    officialReleaseBuild?: boolean
  ) => ZipPlan[]
  postProcessMacArtifacts: (
    distDir: string,
    version: string,
    arch: string,
    options?: {
      officialReleaseBuild?: boolean
      verifyOfficialSignedApps?: (appDirs: string[]) => void
      execFileSync?: (file: string, args: string[], options?: Record<string, unknown>) => void
    }
  ) => ZipPlan[]
  resolveMacAppBundleArch: (appPath: string, fallbackArch?: string) => string
  zipApps: (
    appDirs: string[],
    distDir: string,
    version: string,
    arch: string,
    officialReleaseBuild?: boolean,
    options?: {
      execFileSync?: (file: string, args: string[], options?: Record<string, unknown>) => void
    }
  ) => ZipPlan[]
}

const tempRoots: string[] = []

function createDistFixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'tuff-postprocess-mac-'))
  tempRoots.push(dir)
  return dir
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('resolveMacAppBundleArch', () => {
  it('derives the per-bundle architecture from electron-builder output directories', () => {
    expect(resolveMacAppBundleArch('/dist/mac-arm64/tuff.app', 'arm64')).toBe('arm64')
    expect(resolveMacAppBundleArch('/dist/mac/tuff.app', 'arm64')).toBe('x64')
    expect(resolveMacAppBundleArch('/dist/mac-x64/tuff.app', 'arm64')).toBe('x64')
    expect(resolveMacAppBundleArch('/dist/mac-universal/tuff.app', 'arm64')).toBe('universal')
    expect(resolveMacAppBundleArch('/dist/custom/tuff.app', 'arm64')).toBe('arm64')
  })
})

describe('planMacAppZipArchives & zipApps', () => {
  it('skips redundant .app.zip archives on official builds when electron-builder zips already exist', () => {
    const distDir = createDistFixture()
    const armApp = path.join(distDir, 'mac-arm64', 'tuff.app')
    const x64App = path.join(distDir, 'mac', 'tuff.app')
    mkdirSync(armApp, { recursive: true })
    mkdirSync(x64App, { recursive: true })

    const existingArmZip = path.join(distDir, 'tuff-2.4.15-beta.15-macos-arm64.zip')
    const existingX64Zip = path.join(distDir, 'tuff-2.4.15-beta.15-macos-x64.zip')
    writeFileSync(existingArmZip, 'arm64-zip-bytes')
    writeFileSync(existingX64Zip, 'x64-zip-bytes')

    const verifiedApps: string[] = []
    const spawned: Array<{ file: string; args: string[] }> = []
    const plans = postProcessMacArtifacts(distDir, '2.4.15-beta.15', 'arm64', {
      officialReleaseBuild: true,
      verifyOfficialSignedApps: (dirs) => verifiedApps.push(...dirs),
      execFileSync: (file, args) => {
        spawned.push({ file, args })
      }
    })

    expect(verifiedApps).toEqual([armApp, x64App].sort())
    expect(spawned).toEqual([])
    expect(plans).toEqual([
      expect.objectContaining({
        action: 'skip',
        appPath: armApp,
        bundleArch: 'arm64',
        existingZipPath: existingArmZip
      }),
      expect.objectContaining({
        action: 'skip',
        appPath: x64App,
        bundleArch: 'x64',
        existingZipPath: existingX64Zip
      })
    ])
    expect(existsSync(path.join(distDir, 'tuff-2.4.15-beta.15-arm64.app.zip'))).toBe(false)
    expect(existsSync(path.join(distDir, 'tuff-2.4.15-beta.15-x64.app.zip'))).toBe(false)
  })

  it('creates distinct per-arch .app.zip archives without overwriting when no electron-builder zip exists', () => {
    const distDir = createDistFixture()
    const armApp = path.join(distDir, 'mac-arm64', 'tuff.app')
    const x64App = path.join(distDir, 'mac', 'tuff.app')
    mkdirSync(armApp, { recursive: true })
    mkdirSync(x64App, { recursive: true })

    const invocations: Array<{ file: string; args: string[] }> = []
    const plans = zipApps([armApp, x64App], distDir, '2.4.15-beta.15', 'arm64', true, {
      execFileSync: (file, args) => {
        invocations.push({ file, args })
        const outPath = args[args.length - 1]
        const srcApp = args[args.length - 2]
        writeFileSync(outPath, `archive:${srcApp}`)
      }
    })

    expect(
      plans.map((p) => ({ action: p.action, arch: p.bundleArch, zip: path.basename(p.zipPath!) }))
    ).toEqual([
      { action: 'create', arch: 'arm64', zip: 'tuff-2.4.15-beta.15-arm64.app.zip' },
      { action: 'create', arch: 'x64', zip: 'tuff-2.4.15-beta.15-x64.app.zip' }
    ])
    expect(invocations).toHaveLength(2)
    expect(invocations[0].file).toBe('/usr/bin/ditto')
    expect(readFileSync(path.join(distDir, 'tuff-2.4.15-beta.15-x64.app.zip'), 'utf8')).toBe(
      `archive:${x64App}`
    )
    expect(readFileSync(path.join(distDir, 'tuff-2.4.15-beta.15-arm64.app.zip'), 'utf8')).toBe(
      `archive:${armApp}`
    )
  })

  it('still archives ad-hoc signed local bundles per architecture even when electron-builder zips exist', () => {
    const distDir = createDistFixture()
    const armApp = path.join(distDir, 'mac-arm64', 'tuff.app')
    const x64App = path.join(distDir, 'mac', 'tuff.app')
    mkdirSync(armApp, { recursive: true })
    mkdirSync(x64App, { recursive: true })
    writeFileSync(path.join(distDir, 'tuff-2.4.15-beta.15-macos-arm64.zip'), 'unsigned-arm64')
    writeFileSync(path.join(distDir, 'tuff-2.4.15-beta.15-macos-x64.zip'), 'unsigned-x64')

    const plans = planMacAppZipArchives(
      findAppDirs(distDir),
      distDir,
      '2.4.15-beta.15',
      'arm64',
      false
    )

    expect(
      plans.map((p) => ({ action: p.action, arch: p.bundleArch, zip: path.basename(p.zipPath!) }))
    ).toEqual([
      { action: 'create', arch: 'arm64', zip: 'tuff-2.4.15-beta.15-arm64.app.zip' },
      { action: 'create', arch: 'x64', zip: 'tuff-2.4.15-beta.15-x64.app.zip' }
    ])
  })

  it('refuses to silently overwrite when two bundles resolve to the same output archive path', () => {
    const distDir = createDistFixture()
    const first = path.join(distDir, 'custom-a', 'tuff.app')
    const second = path.join(distDir, 'custom-b', 'tuff.app')
    mkdirSync(first, { recursive: true })
    mkdirSync(second, { recursive: true })

    expect(() =>
      planMacAppZipArchives([first, second], distDir, '2.4.15-beta.15', 'arm64', true)
    ).toThrow(/Refusing to overwrite macOS zip archive/)
  })
})
