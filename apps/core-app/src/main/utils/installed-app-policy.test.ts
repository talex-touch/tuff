import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { evaluateInstalledAppPath } from './installed-app-policy'

/**
 * What system.openApp may launch (#908).
 *
 * The handler passed `payload.appName || payload.path` straight to shell.openPath, which asks
 * the OS to open it — on macOS and Windows that means execution, outside the Electron sandbox.
 * transport.on registers on the plugin channel as well, so any plugin could drop a file via
 * the download handler and then have the main process run it.
 */

const HOME = os.homedir()

/** An application path that is valid on the platform the test is running on. */
function installedApp(): string {
  if (process.platform === 'darwin') return '/Applications/Example.app'
  if (process.platform === 'win32') return path.join(HOME, 'AppData', 'Local', 'Programs', 'x.exe')
  return '/usr/share/applications/example.desktop'
}

/** A payload inside an application root but not itself an application. */
function scriptInAppRoot(): string {
  if (process.platform === 'darwin') return '/Applications/payload.command'
  if (process.platform === 'win32') return path.join(HOME, 'AppData', 'Local', 'Programs', 'p.bat')
  return '/usr/share/applications/payload.sh'
}

describe('evaluateInstalledAppPath', () => {
  it('allows an installed application', () => {
    // Positive control. Every rejection below would also pass if this returned false for
    // everything, which would "fix" the issue by disabling the feature.
    expect(evaluateInstalledAppPath(installedApp())).toEqual({ allowed: true })
  })

  it('rejects a path outside the application roots', () => {
    const dropped = path.join(HOME, 'Library', 'Caches', 'payload.command')
    expect(evaluateInstalledAppPath(dropped).reason).toBe('outside-application-roots')
  })

  it('rejects a script that merely sits in an application root', () => {
    // Being in the right folder is not enough: openPath runs a .command or .bat just as
    // readily as it opens an app.
    expect(evaluateInstalledAppPath(scriptInAppRoot()).reason).toBe('not-an-application')
  })

  it('rejects a traversal that climbs out of an application root', () => {
    const escaped = `${installedApp()}/../../../tmp/payload.app`
    expect(evaluateInstalledAppPath(escaped).allowed).toBe(false)
  })

  it('rejects a sibling directory sharing an application root prefix', () => {
    const sibling =
      process.platform === 'win32'
        ? path.join(`${HOME}\\AppData\\Local\\ProgramsEvil`, 'x.exe')
        : `${installedApp().replace(/\/[^/]+$/, '')}Evil/x.app`
    expect(evaluateInstalledAppPath(sibling).allowed).toBe(false)
  })

  it('rejects a bare application name', () => {
    // Not a regression: shell.openPath takes a filesystem path and never resolved 'Safari'.
    expect(evaluateInstalledAppPath('Safari').reason).toBe('not-absolute')
  })

  it('rejects empty and undefined input', () => {
    expect(evaluateInstalledAppPath('').reason).toBe('empty')
    expect(evaluateInstalledAppPath(undefined).reason).toBe('empty')
    expect(evaluateInstalledAppPath('   ').reason).toBe('empty')
  })
})
