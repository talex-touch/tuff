import type { PlatformInstallSpecInput } from './update-platform-adapter'
import type { PreviousUpdateAsset } from './update-recovery-store'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertPlatformInstallPreflight,
  buildPlatformInstallSpec,
  preparePlatformPackage
} from './update-platform-adapter'

const temporaryRoots: string[] = []

function input(overrides: Partial<PlatformInstallSpecInput> = {}): PlatformInstallSpecInput {
  return {
    platform: 'win32',
    packagePath: '/updates/tuff-2.4.10-setup.exe',
    currentVersion: '2.4.9',
    previousAsset: null,
    rollbackFromVersion: null,
    attemptRoot: '/updates/attempts/attempt-1',
    resourcesPath: process.cwd(),
    appPath: process.cwd(),
    appBundlePath: null,
    allowRecovery: false,
    ...overrides
  }
}

function previousAsset(
  filePath: string,
  platform: NodeJS.Platform,
  version = '2.4.9'
): PreviousUpdateAsset {
  return {
    schemaVersion: 1,
    version,
    platform,
    filename: path.basename(filePath),
    filePath,
    sha256: 'a'.repeat(64),
    createdAt: 1
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('update platform handoff adapter', () => {
  it('builds a macOS apply and restore plan around the exact current app version', () => {
    const spec = buildPlatformInstallSpec(
      input({
        platform: 'darwin',
        packagePath: '/updates/Tuff.app.zip',
        appBundlePath: '/Applications/Tuff.app',
        allowRecovery: true,
        rollbackFromVersion: '2.4.9'
      })
    )

    expect(spec).toMatchObject({
      handoff: {
        command: '/bin/bash',
        waitForExit: true,
        args: expect.arrayContaining([
          '--source',
          '/updates/Tuff.app.zip',
          '--dest',
          '/Applications/Tuff.app'
        ])
      },
      recovery: {
        command: '/bin/bash',
        waitForExit: true,
        args: expect.arrayContaining(['--backup', '/updates/attempts/attempt-1/macos-backup.app'])
      },
      previousVersion: '2.4.9',
      recoveryAvailable: true
    })
  })

  it('does not expose a macOS restore command when recovery is denied', () => {
    const spec = buildPlatformInstallSpec(
      input({
        platform: 'darwin',
        packagePath: '/updates/Tuff.app.zip',
        appBundlePath: '/Applications/Tuff.app',
        allowRecovery: false,
        rollbackFromVersion: '2.4.9'
      })
    )

    expect(spec).toMatchObject({
      recovery: null,
      previousVersion: null,
      recoveryAvailable: false
    })
  })

  it('does not expose a macOS restore command for a different rollback version', () => {
    const spec = buildPlatformInstallSpec(
      input({
        platform: 'darwin',
        packagePath: '/updates/Tuff.app.zip',
        appBundlePath: '/Applications/Tuff.app',
        allowRecovery: true,
        rollbackFromVersion: '2.4.8'
      })
    )

    expect(spec).toMatchObject({
      recovery: null,
      previousVersion: null,
      recoveryAvailable: false
    })
  })

  it('builds interactive NSIS and MSI handoffs without silent installer arguments', () => {
    expect(buildPlatformInstallSpec(input()).handoff).toEqual({
      type: 'nsis',
      command: '/updates/tuff-2.4.10-setup.exe',
      args: [],
      waitForExit: false
    })
    expect(
      buildPlatformInstallSpec(input({ packagePath: '/updates/tuff-2.4.10.msi' })).handoff
    ).toEqual({
      type: 'msi',
      command: 'msiexec.exe',
      args: ['/i', '/updates/tuff-2.4.10.msi'],
      waitForExit: false
    })
  })

  it('builds Windows recovery only when the cached package matches the rollback version', () => {
    const spec = buildPlatformInstallSpec(
      input({
        allowRecovery: true,
        rollbackFromVersion: '2.4.9',
        previousAsset: previousAsset('/updates/tuff-2.4.9-setup.exe', 'win32')
      })
    )

    expect(spec).toMatchObject({
      recovery: {
        command: '/updates/tuff-2.4.9-setup.exe',
        args: [],
        waitForExit: false
      },
      previousVersion: '2.4.9',
      recoveryAvailable: true
    })
  })

  it('does not treat distinct prerelease suffixes as the same cached recovery version', () => {
    const expectedRollback = '2.4.9-beta.1'
    const cachedVersion = '2.4.9-beta.2'
    const windows = buildPlatformInstallSpec(
      input({
        allowRecovery: true,
        rollbackFromVersion: expectedRollback,
        previousAsset: previousAsset('/updates/tuff-2.4.9-setup.exe', 'win32', cachedVersion)
      })
    )
    const linux = buildPlatformInstallSpec(
      input({
        platform: 'linux',
        packagePath: '/updates/tuff.AppImage',
        allowRecovery: true,
        rollbackFromVersion: expectedRollback,
        previousAsset: previousAsset('/updates/tuff-2.4.9.AppImage', 'linux', cachedVersion)
      })
    )

    expect(windows).toMatchObject({
      recovery: null,
      previousVersion: null,
      recoveryAvailable: false
    })
    expect(linux).toMatchObject({
      recovery: null,
      previousVersion: null,
      recoveryAvailable: false
    })
  })

  it('builds script-driven AppImage and deb Linux handoffs and retains a compatible previous package', () => {
    const appImage = buildPlatformInstallSpec(
      input({
        platform: 'linux',
        packagePath: '/updates/tuff.AppImage',
        allowRecovery: true,
        rollbackFromVersion: '2.4.9',
        previousAsset: previousAsset('/updates/tuff-2.4.9.AppImage', 'linux')
      })
    )
    const deb = buildPlatformInstallSpec(
      input({ platform: 'linux', packagePath: '/updates/tuff_2.4.10.deb' })
    )

    // AppImage is replaced in place via the bundled apply script (no longer a no-op launch).
    expect(appImage).toMatchObject({
      handoff: {
        command: '/bin/bash',
        waitForExit: true,
        args: expect.arrayContaining([
          '--source',
          '/updates/tuff.AppImage',
          '--backup',
          '/updates/attempts/attempt-1/linux-backup.AppImage'
        ])
      },
      recovery: { command: '/updates/tuff-2.4.9.AppImage', args: [], waitForExit: false },
      previousVersion: '2.4.9',
      recoveryAvailable: true
    })
    expect((appImage.handoff.args ?? [])[0]).toMatch(/linux-apply-update\.sh$/)

    // .deb is a real elevated install via pkexec inside the apply script (no longer xdg-open).
    expect(deb.handoff).toMatchObject({
      command: '/bin/bash',
      waitForExit: true,
      args: expect.arrayContaining(['--deb', '/updates/tuff_2.4.10.deb'])
    })
    expect((deb.handoff.args ?? [])[0]).toMatch(/linux-apply-update\.sh$/)
  })

  it('fails closed for unsupported platforms and package formats', () => {
    expect(() => buildPlatformInstallSpec(input({ platform: 'freebsd' }))).toThrow(
      'Unsupported update platform'
    )
    expect(() =>
      buildPlatformInstallSpec(input({ platform: 'win32', packagePath: '/updates/tuff.exe' }))
    ).toThrow('Unsupported Windows update installer')
    expect(() =>
      buildPlatformInstallSpec(input({ platform: 'linux', packagePath: '/updates/tuff.tar.gz' }))
    ).toThrow('Unsupported Linux update package')
  })

  it('marks an AppImage executable before detached handoff', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'tuff-update-adapter-'))
    temporaryRoots.push(directory)
    const appImagePath = path.join(directory, 'tuff.AppImage')
    await writeFile(appImagePath, 'fixture')

    await preparePlatformPackage('linux', appImagePath)

    expect((await stat(appImagePath)).mode & 0o777).toBe(0o755)
  })
  it('allows a trusted macOS build only when the current app can be replaced directly', () => {
    const access = vi.fn()

    assertPlatformInstallPreflight(
      {
        platform: 'darwin',
        executablePath: '/Applications/Tuff.app/Contents/MacOS/Tuff',
        buildVerificationStatus: {
          isVerified: true,
          isOfficialBuild: true,
          verificationFailed: false,
          hasOfficialKey: true
        }
      },
      access
    )

    expect(access).toHaveBeenCalledWith('/Applications/Tuff.app', expect.any(Number))
    expect(access).toHaveBeenCalledWith('/Applications', expect.any(Number))
  })

  it('rejects untrusted or non-writable macOS installs without requesting elevation', () => {
    const base = {
      platform: 'darwin' as const,
      executablePath: '/Applications/Tuff.app/Contents/MacOS/Tuff',
      buildVerificationStatus: {
        isVerified: true,
        isOfficialBuild: true,
        verificationFailed: false,
        hasOfficialKey: true
      }
    }

    expect(() =>
      assertPlatformInstallPreflight({
        ...base,
        buildVerificationStatus: { ...base.buildVerificationStatus, isOfficialBuild: false }
      })
    ).toThrow(expect.objectContaining({ code: 'MAC_UPDATE_BUILD_UNTRUSTED' }))
    expect(() =>
      assertPlatformInstallPreflight(base, () => {
        throw new Error('EACCES')
      })
    ).toThrow(expect.objectContaining({ code: 'MAC_UPDATE_DESTINATION_NOT_WRITABLE' }))
  })
})
