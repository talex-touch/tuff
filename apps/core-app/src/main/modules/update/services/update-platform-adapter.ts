import type { PreviousUpdateAsset, UpdateHandoffCommand } from './update-recovery-store'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { resolveWindowsInstallerCommand } from './windows-installer-strategy'

export interface PlatformInstallSpec {
  handoff: UpdateHandoffCommand
  recovery: UpdateHandoffCommand | null
  cleanupPaths: string[]
  previousVersion: string | null
  recoveryAvailable: boolean
}

export interface PlatformInstallSpecInput {
  platform: NodeJS.Platform
  packagePath: string
  currentVersion: string
  previousAsset: PreviousUpdateAsset | null
  rollbackFromVersion: string | null
  attemptRoot: string
  resourcesPath: string
  appPath: string
  appBundlePath: string | null
  allowRecovery: boolean
}

export function buildPlatformInstallSpec(input: PlatformInstallSpecInput): PlatformInstallSpec {
  if (input.platform === 'darwin') return buildMacInstallSpec(input)
  if (input.platform === 'win32') return buildWindowsInstallSpec(input)
  if (input.platform === 'linux') return buildLinuxInstallSpec(input)
  throw new Error(`Unsupported update platform: ${input.platform}`)
}

export async function preparePlatformPackage(
  platform: NodeJS.Platform,
  packagePath: string
): Promise<void> {
  if (platform === 'linux' && path.extname(packagePath).toLowerCase() === '.appimage') {
    await fs.promises.chmod(packagePath, 0o755)
  }
}

export function resolveCurrentMacAppBundlePath(executablePath: string): string | null {
  const appBundlePath = path.resolve(executablePath, '..', '..', '..')
  return appBundlePath.toLowerCase().endsWith('.app') ? appBundlePath : null
}

function buildMacInstallSpec(input: PlatformInstallSpecInput): PlatformInstallSpec {
  if (!input.appBundlePath) {
    throw new Error('Unable to resolve the current macOS application bundle')
  }
  const applyScript = resolveBundledScript(
    'macos-apply-update.sh',
    input.resourcesPath,
    input.appPath
  )
  const restoreScript = resolveBundledScript(
    'macos-restore-update.sh',
    input.resourcesPath,
    input.appPath
  )
  const stageRoot = path.join(input.attemptRoot, 'macos-stage')
  const backupPath = path.join(input.attemptRoot, 'macos-backup.app')
  const logPath = path.join(input.attemptRoot, 'macos-update.log')
  const recoveryAllowed = hasExpectedRollbackCurrent(input)

  return {
    handoff: {
      command: '/bin/bash',
      args: [
        applyScript,
        '--source',
        input.packagePath,
        '--dest',
        input.appBundlePath,
        '--stage',
        stageRoot,
        '--backup',
        backupPath,
        '--pid',
        String(process.pid),
        '--log',
        logPath
      ],
      waitForExit: true
    },
    recovery: recoveryAllowed
      ? {
          command: '/bin/bash',
          args: [
            restoreScript,
            '--backup',
            backupPath,
            '--dest',
            input.appBundlePath,
            '--log',
            logPath
          ],
          waitForExit: true
        }
      : null,
    cleanupPaths: [backupPath, stageRoot],
    previousVersion: recoveryAllowed ? input.currentVersion : null,
    recoveryAvailable: recoveryAllowed
  }
}
function buildWindowsInstallSpec(input: PlatformInstallSpecInput): PlatformInstallSpec {
  const target = resolveWindowsInstallerCommand(input.packagePath)
  if (!target) throw new Error('Unsupported Windows update installer')
  const previous = hasExpectedPreviousAsset(input)
    ? resolvePreviousCommand('win32', input.previousAsset)
    : null

  return {
    handoff: { ...target, waitForExit: false },
    recovery: previous,
    cleanupPaths: [],
    previousVersion: previous ? input.previousAsset!.version : null,
    recoveryAvailable: previous !== null
  }
}

function buildLinuxInstallSpec(input: PlatformInstallSpecInput): PlatformInstallSpec {
  const target = resolveLinuxCommand(input.packagePath)
  const previous = hasExpectedPreviousAsset(input)
    ? resolvePreviousCommand('linux', input.previousAsset)
    : null

  return {
    handoff: target,
    recovery: previous,
    cleanupPaths: [],
    previousVersion: previous ? input.previousAsset!.version : null,
    recoveryAvailable: previous !== null
  }
}

function hasExpectedRollbackCurrent(input: PlatformInstallSpecInput): boolean {
  return (
    input.allowRecovery &&
    input.rollbackFromVersion !== null &&
    normalizeVersion(input.currentVersion) === normalizeVersion(input.rollbackFromVersion)
  )
}

function hasExpectedPreviousAsset(input: PlatformInstallSpecInput): boolean {
  return (
    hasExpectedRollbackCurrent(input) &&
    input.previousAsset !== null &&
    normalizeVersion(input.previousAsset.version) === normalizeVersion(input.rollbackFromVersion!)
  )
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function resolvePreviousCommand(
  platform: 'win32' | 'linux',
  asset: PreviousUpdateAsset | null
): UpdateHandoffCommand | null {
  if (!asset || asset.platform !== platform) return null
  if (platform === 'win32') {
    const command = resolveWindowsInstallerCommand(asset.filePath)
    return command ? { ...command, waitForExit: false } : null
  }
  return resolveLinuxCommand(asset.filePath)
}

function resolveLinuxCommand(packagePath: string): UpdateHandoffCommand {
  const extension = path.extname(packagePath).toLowerCase()
  if (extension === '.appimage') {
    return { command: packagePath, args: [], waitForExit: false }
  }
  if (extension === '.deb') {
    return { command: 'xdg-open', args: [packagePath], waitForExit: false }
  }
  throw new Error('Unsupported Linux update package')
}

function resolveBundledScript(name: string, resourcesPath: string, appPath: string): string {
  const candidates = [
    path.join(resourcesPath, 'resources', 'scripts', name),
    path.join(resourcesPath, 'scripts', name),
    path.join(appPath, 'resources', 'scripts', name),
    path.resolve(process.cwd(), 'resources', 'scripts', name)
  ]
  const resolved = candidates.find((candidate) => fs.existsSync(candidate))
  if (!resolved) throw new Error(`Bundled update script is missing: ${name}`)
  return resolved
}
