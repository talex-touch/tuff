import type { spawn as nodeSpawn } from 'node:child_process'
import path from 'node:path'

export type WindowsInstallerType = 'nsis' | 'msi'

export interface WindowsInstallerCommand {
  type: WindowsInstallerType
  command: string
  args: string[]
}

export interface WindowsInstallerLaunchResult {
  launched: boolean
  command?: WindowsInstallerCommand
  reason?: 'unsupported-installer'
}

export interface WindowsInstallerLaunchDeps {
  spawn: typeof nodeSpawn
  requestAppQuit: (reason: string) => void
}

const NSIS_INSTALLER_NAME_PATTERN = /(^|[\s._-])(setup|installer)([\s._-]|$)/i

export function resolveWindowsInstallerCommand(filePath: string): WindowsInstallerCommand | null {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.msi') {
    return {
      type: 'msi',
      command: 'msiexec.exe',
      args: ['/i', filePath, '/passive', '/norestart']
    }
  }

  if (ext === '.exe' && NSIS_INSTALLER_NAME_PATTERN.test(path.basename(filePath, ext))) {
    return {
      type: 'nsis',
      command: filePath,
      args: ['/S']
    }
  }

  return null
}

export function launchWindowsInstaller(
  filePath: string,
  deps: WindowsInstallerLaunchDeps
): WindowsInstallerLaunchResult {
  const command = resolveWindowsInstallerCommand(filePath)
  if (!command) {
    return { launched: false, reason: 'unsupported-installer' }
  }

  const installerProcess = deps.spawn(command.command, command.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  })
  installerProcess.unref()
  deps.requestAppQuit(`windows-${command.type}-update`)

  return { launched: true, command }
}
