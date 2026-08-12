import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which parts of the filesystem local-file access may reach (#914).
 *
 * getAllowedLocalFileRoots listed `app.getPath('home')`, so every file under the user's home
 * was servable. The tfile: protocol is registered on the default session and whitelisted in
 * the renderer CSP, which made that reachable from renderer script:
 *
 *   await (await fetch('tfile:///Users/victim/.ssh/id_rsa')).text()
 *
 * The roots are now the specific directories the app scans for installed applications and
 * their icons — the only reason a home path was ever needed.
 */

const HOME = process.platform === 'win32' ? 'C:\\Users\\tester' : '/home/tester'
const USER_DATA = path.join(HOME, '.config', 'tuff-userdata')

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'home') return HOME
      if (name === 'userData') return USER_DATA
      if (name === 'temp') return os.tmpdir()
      throw new Error(`unexpected path ${name}`)
    })
  }
}))

const { getAllowedLocalFileRoots, isAllowedLocalFilePath } = await import('./local-file-policy')

describe('getAllowedLocalFileRoots', () => {
  let roots: string[]

  beforeEach(() => {
    roots = getAllowedLocalFileRoots()
  })

  it('no longer lists the home directory itself', () => {
    // The regression. Any root equal to home makes every path below it servable.
    expect(roots).not.toContain(path.normalize(HOME))
  })

  it('keeps userData and temp, which are the roots the protocol actually serves from', () => {
    expect(roots).toContain(path.normalize(USER_DATA))
    expect(roots).toContain(path.normalize(os.tmpdir()))
  })

  it('keeps a home-relative scan root for the current platform', () => {
    // Positive control: narrowing must not have removed the app-icon paths outright, which
    // would pass every assertion above while breaking the launcher's icons.
    const expected =
      process.platform === 'darwin'
        ? path.join(HOME, 'Applications')
        : process.platform === 'win32'
          ? path.join(HOME, 'AppData', 'Local', 'Programs')
          : path.join(HOME, '.local', 'share', 'applications')
    expect(roots).toContain(path.normalize(expected))
  })
})

describe('isAllowedLocalFilePath against the narrowed roots', () => {
  const roots = getAllowedLocalFileRoots()

  const secrets = [
    path.join(HOME, '.ssh', 'id_rsa'),
    path.join(HOME, '.aws', 'credentials'),
    path.join(HOME, '.gnupg', 'secring.gpg'),
    path.join(HOME, 'Documents', 'passwords.txt')
  ]

  it.each(secrets)('refuses %s', (filePath) => {
    expect(isAllowedLocalFilePath(filePath, roots)).toBe(false)
  })

  it('still serves an application icon under the platform scan root', () => {
    const icon =
      process.platform === 'darwin'
        ? path.join(HOME, 'Applications', 'Thing.app', 'Contents', 'Resources', 'icon.icns')
        : process.platform === 'win32'
          ? path.join(HOME, 'AppData', 'Local', 'Programs', 'thing', 'icon.ico')
          : path.join(HOME, '.local', 'share', 'applications', 'thing.desktop')
    expect(isAllowedLocalFilePath(icon, roots)).toBe(true)
  })

  it('still serves from userData', () => {
    expect(isAllowedLocalFilePath(path.join(USER_DATA, 'cache', 'icon.png'), roots)).toBe(true)
  })

  it('refuses a sibling directory whose name merely starts with an allowed root', () => {
    // A prefix comparison that forgets the separator would accept this.
    const sibling =
      process.platform === 'darwin'
        ? path.join(HOME, 'ApplicationsPrivate', 'secret.txt')
        : process.platform === 'win32'
          ? path.join(HOME, 'AppData', 'Local', 'ProgramsPrivate', 'secret.txt')
          : path.join(HOME, '.local', 'share', 'applications-private', 'secret.txt')
    expect(isAllowedLocalFilePath(sibling, roots)).toBe(false)
  })
})
