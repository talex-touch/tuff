import path from 'node:path'

export type WindowsInstallerType = 'nsis' | 'msi'

export interface WindowsInstallerCommand {
  type: WindowsInstallerType
  command: string
  args: string[]
}

const NSIS_INSTALLER_NAME_PATTERN = /(^|[\s._-])(setup|installer)([\s._-]|$)/i

export function resolveWindowsInstallerCommand(filePath: string): WindowsInstallerCommand | null {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.msi') {
    return {
      type: 'msi',
      command: 'msiexec.exe',
      args: ['/i', filePath]
    }
  }

  if (ext === '.exe' && NSIS_INSTALLER_NAME_PATTERN.test(path.basename(filePath, ext))) {
    return {
      type: 'nsis',
      command: filePath,
      args: []
    }
  }

  return null
}
