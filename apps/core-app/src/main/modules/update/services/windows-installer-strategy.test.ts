import { describe, expect, it, vi } from 'vitest'
import {
  launchWindowsInstaller,
  resolveWindowsInstallerCommand
} from './windows-installer-strategy'

describe('windows-installer-strategy', () => {
  it('uses NSIS silent mode for setup executables', () => {
    expect(resolveWindowsInstallerCommand('C:/Downloads/tuff-2.4.10-setup.exe')).toEqual({
      type: 'nsis',
      command: 'C:/Downloads/tuff-2.4.10-setup.exe',
      args: ['/S']
    })
  })

  it('uses msiexec passive mode for MSI installers', () => {
    expect(resolveWindowsInstallerCommand('C:/Downloads/tuff-2.4.10.msi')).toEqual({
      type: 'msi',
      command: 'msiexec.exe',
      args: ['/i', 'C:/Downloads/tuff-2.4.10.msi', '/passive', '/norestart']
    })
  })

  it('does not treat arbitrary exe files as installers', () => {
    expect(resolveWindowsInstallerCommand('C:/Downloads/tuff.exe')).toBeNull()
  })

  it('starts installer detached and requests app quit after handoff', () => {
    const unref = vi.fn()
    const spawn = vi.fn(() => ({ unref }))
    const requestAppQuit = vi.fn()

    const result = launchWindowsInstaller('C:/Downloads/tuff-setup.exe', {
      spawn: spawn as never,
      requestAppQuit
    })

    expect(result.launched).toBe(true)
    expect(spawn).toHaveBeenCalledWith('C:/Downloads/tuff-setup.exe', ['/S'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    expect(unref).toHaveBeenCalledTimes(1)
    expect(requestAppQuit).toHaveBeenCalledWith('windows-nsis-update')
  })
})
