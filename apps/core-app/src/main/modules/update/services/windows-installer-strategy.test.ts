import { describe, expect, it } from 'vitest'
import { resolveWindowsInstallerCommand } from './windows-installer-strategy'

describe('windows-installer-strategy', () => {
  it('returns an interactive NSIS command for recognized setup executables', () => {
    expect(resolveWindowsInstallerCommand('C:/Downloads/tuff-2.4.10-setup.exe')).toEqual({
      type: 'nsis',
      command: 'C:/Downloads/tuff-2.4.10-setup.exe',
      args: []
    })
  })

  it('returns an interactive MSI command without claiming unattended installation', () => {
    expect(resolveWindowsInstallerCommand('C:/Downloads/tuff-2.4.10.msi')).toEqual({
      type: 'msi',
      command: 'msiexec.exe',
      args: ['/i', 'C:/Downloads/tuff-2.4.10.msi']
    })
  })

  it('rejects executable files that do not match the installer naming contract', () => {
    expect(resolveWindowsInstallerCommand('C:/Downloads/tuff.exe')).toBeNull()
  })
})
