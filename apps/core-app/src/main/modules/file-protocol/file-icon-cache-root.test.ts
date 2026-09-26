import path from 'node:path'
import process from 'node:process'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The one directory the file-icon cutover adds to the `tfile:` allowlist.
 *
 * `tfile:` is registered on the default session and whitelisted in the renderer CSP, so every root
 * registered here is readable from renderer script. The Chromium cache holds the profile -- Cookies,
 * Local State, Login Data -- so the allowlist has to name the generated `file-icons` subdirectory and
 * nothing above it. The synthetic cache root below is deliberately outside every built-in root
 * (temp, userData, the home scan roots), so a path under it is servable only if the protocol module
 * registered it.
 */
const FILE_ICON_DIRECTORY = '/tuff-file-icon-cache-check/chromium-cache/file-icons'
const CHROMIUM_CACHE = path.dirname(FILE_ICON_DIRECTORY)
const SYNTHETIC_HOME = '/tuff-file-icon-cache-check/home'

const harness = vi.hoisted(() => ({
  handle: vi.fn(),
  unhandle: vi.fn(),
  fetch: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: (name: string) => {
      if (name === 'home') return '/tuff-file-icon-cache-check/home'
      if (name === 'cache') return '/tuff-file-icon-cache-check/chromium-cache'
      if (name === 'userData') return '/tuff-file-icon-cache-check/userdata'
      if (name === 'temp') return '/tuff-file-icon-cache-check/temp'
      throw new Error(`unexpected path ${name}`)
    },
    getFileIcon: vi.fn()
  },
  net: { fetch: harness.fetch },
  session: {
    defaultSession: {
      protocol: {
        handle: harness.handle,
        unhandle: harness.unhandle
      }
    }
  }
}))

vi.mock('@talex-touch/tuff-native', () => ({
  writeDarwinAppIcon: vi.fn()
}))

import { fileProtocolModule } from './index'
import { isServableLocalFilePath } from '../../utils/local-file-policy'

const originalPlatform = process.platform

beforeAll(() => {
  // The policy branches on the platform for its home scan roots and its path comparison; pin the
  // macOS branch so the allowlist under test is the one the shipped app uses.
  Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' })
})

afterAll(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
})

beforeEach(async () => {
  vi.clearAllMocks()
  await fileProtocolModule.onInit()
})

afterEach(async () => {
  await fileProtocolModule.onDestroy()
})

describe('tfile roots for generated file icons', () => {
  it('serves a generated icon from the file-icons directory', () => {
    const iconPath = path.join(FILE_ICON_DIRECTORY, `${'a'.repeat(64)}.png`)

    expect(isServableLocalFilePath(iconPath)).toBe(true)
  })

  it('does not widen access to the cache directory around the icons', () => {
    // Registering the icon cache root itself, rather than the file-icons subdirectory, hands the
    // whole renderer-visible profile to local-file access.
    expect(isServableLocalFilePath(path.join(CHROMIUM_CACHE, 'Default', 'Cookies'))).toBe(false)
    expect(isServableLocalFilePath(path.join(CHROMIUM_CACHE, 'Local State'))).toBe(false)
    expect(isServableLocalFilePath(path.join(`${FILE_ICON_DIRECTORY}-old`, 'icon.png'))).toBe(false)
  })

  it('keeps home secrets out of the local data plane', () => {
    expect(isServableLocalFilePath(path.join(SYNTHETIC_HOME, '.ssh', 'id_rsa'))).toBe(false)
    expect(isServableLocalFilePath(path.join(SYNTHETIC_HOME, '.aws', 'credentials'))).toBe(false)
  })

  it('stops serving the icon directory once the module is destroyed', async () => {
    const iconPath = path.join(FILE_ICON_DIRECTORY, 'icon.png')
    expect(isServableLocalFilePath(iconPath)).toBe(true)

    await fileProtocolModule.onDestroy()

    expect(isServableLocalFilePath(iconPath)).toBe(false)
  })
})
