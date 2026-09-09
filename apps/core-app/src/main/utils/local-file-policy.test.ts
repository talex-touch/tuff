import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { app } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetRuntimeRootPathForTests, resolveRuntimeRootPath } from './app-root-path'

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
const CACHE = path.join(HOME, '.cache', 'tuff-cache')
let mockedUserDataPath = USER_DATA
let mockedRuntimePluginRoot: string | null = null

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn((name: string) => {
      if (name === 'home') return HOME
      if (name === 'userData') return mockedUserDataPath
      if (name === 'cache') return CACHE
      if (name === 'temp') return os.tmpdir()
      throw new Error(`unexpected path ${name}`)
    })
  }
}))

vi.mock('node:fs', () => ({
  readdirSync: vi.fn((directory: string) => {
    if (directory === mockedRuntimePluginRoot) {
      return [{ name: 'clipboard-history', isDirectory: () => true }]
    }
    throw new Error(`unexpected directory ${directory}`)
  })
}))

const { getAllowedLocalFileRoots, isAllowedLocalFilePath } = await import('./local-file-policy')

afterEach(() => {
  mockedUserDataPath = USER_DATA
  resetRuntimeRootPathForTests()
  mockedRuntimePluginRoot = null
})

describe('getAllowedLocalFileRoots', () => {
  let roots: string[]

  beforeEach(() => {
    roots = getAllowedLocalFileRoots()
  })

  it('no longer lists the home directory itself', () => {
    // The regression. Any root equal to home makes every path below it servable.
    expect(roots).not.toContain(path.normalize(HOME))
  })

  it('keeps app icons, userData and temp, which are the roots the protocol serves from', () => {
    expect(roots).toContain(path.join(CACHE, 'app-icons'))
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

  it('serves generated app icons but rejects adjacent cache directories', () => {
    expect(isAllowedLocalFilePath(path.join(CACHE, 'app-icons', 'darwin', 'icon.png'), roots)).toBe(
      true
    )
    expect(isAllowedLocalFilePath(path.join(CACHE, 'app-icons-old', 'icon.png'), roots)).toBe(false)
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

describe('runtime plugin resource policy', () => {
  it('serves official plugin assets from the memoized runtime root after userData changes, but not plugin data', () => {
    const runtimeUserData = path.join(HOME, '.config', 'tuff-runtime-userdata')
    const rewrittenUserData = path.join(HOME, '.config', 'tuff-chromium-userdata')
    const plugin = 'clipboard-history'

    mockedUserDataPath = runtimeUserData
    resetRuntimeRootPathForTests()
    const runtimeRoot = resolveRuntimeRootPath(app)
    mockedRuntimePluginRoot = path.join(runtimeRoot, 'modules', 'plugins')

    // Electron's later dev rewrite is for Chromium's profile, not the CoreApp runtime root.
    mockedUserDataPath = rewrittenUserData
    const roots = getAllowedLocalFileRoots()

    expect(
      isAllowedLocalFilePath(
        path.join(runtimeRoot, 'modules', 'plugins', plugin, 'assets', 'logo.svg'),
        roots
      )
    ).toBe(true)
    expect(
      isAllowedLocalFilePath(
        path.join(runtimeRoot, 'modules', 'plugins', plugin, 'data', 'private.json'),
        roots
      )
    ).toBe(false)
  })
})

describe('isServableLocalFilePath', () => {
  it('answers for the built-in roots and the roots the tfile module adds', async () => {
    const policy = await import('./local-file-policy')
    const tmpFile = path.join(os.tmpdir(), 'servable-check.png')

    // os.tmpdir() is a built-in root; an arbitrary path is not.
    expect(policy.isServableLocalFilePath(tmpFile)).toBe(true)
    expect(policy.isServableLocalFilePath('/definitely/not/allowed/shot.png')).toBe(false)

    // The thumbnail cache lives under a root the file-protocol module registers at init; the
    // answer here must track that registration, and its release.
    const release = policy.configureAdditionalAllowedLocalFileRoots(['/definitely/not/allowed'])
    expect(policy.isServableLocalFilePath('/definitely/not/allowed/shot.png')).toBe(true)
    release()
    expect(policy.isServableLocalFilePath('/definitely/not/allowed/shot.png')).toBe(false)
  })
})
