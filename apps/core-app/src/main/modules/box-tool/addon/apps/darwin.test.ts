import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileSafeMock } = vi.hoisted(() => ({
  execFileSafeMock: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => path.join(os.tmpdir(), 'darwin-app-icon-cache-test-user-data'))
  }
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  execFileSafe: execFileSafeMock
}))

vi.mock('./app-error-reporter', () => ({
  reportAppScanError: vi.fn()
}))

async function loadSubject() {
  return await import('./darwin')
}

async function createTempAppBundle(
  name: string,
  plistDisplayName: string,
  options?: { localizedDisplayName?: string; localizedDir?: string; iconFile?: string }
): Promise<string> {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'darwin-app-test-'))
  const appPath = path.join(tmpRoot, `${name}.app`)
  const contentsPath = path.join(appPath, 'Contents')
  const resourcesPath = path.join(contentsPath, 'Resources')
  await fs.mkdir(resourcesPath, { recursive: true })
  await fs.writeFile(
    path.join(contentsPath, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>${plistDisplayName}</string>
  <key>CFBundleName</key>
  <string>${name}</string>
  <key>CFBundleIdentifier</key>
  <string>com.example.${name.toLowerCase()}</string>
  ${
    options?.iconFile
      ? `<key>CFBundleIconFile</key>
  <string>${options.iconFile}</string>`
      : ''
  }
</dict>
</plist>`
  )

  if (options?.iconFile) {
    const iconFile = options.iconFile.endsWith('.icns')
      ? options.iconFile
      : `${options.iconFile}.icns`
    await fs.writeFile(path.join(resourcesPath, iconFile), 'icns')
  }

  if (options?.localizedDisplayName) {
    const localizedDir = path.join(resourcesPath, options.localizedDir ?? 'zh-Hans.lproj')
    await fs.mkdir(localizedDir, { recursive: true })
    await fs.writeFile(
      path.join(localizedDir, 'InfoPlist.strings'),
      `"CFBundleDisplayName" = "${options.localizedDisplayName}";\n`
    )
  }

  return tmpRoot
}

describe('darwin app info', () => {
  const tempRoots: string[] = []
  const cacheRoot = path.join(os.tmpdir(), 'darwin-app-icon-cache-test-user-data')

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    execFileSafeMock.mockImplementation(async (_command: string, args: string[]) => {
      const outputIndex = args.indexOf('--out')
      if (outputIndex >= 0 && args[outputIndex + 1]) {
        await fs.mkdir(path.dirname(args[outputIndex + 1]), { recursive: true })
        await fs.writeFile(args[outputIndex + 1], 'png')
      }
      return { stdout: '', stderr: '' }
    })
  })

  afterEach(async () => {
    await Promise.all(
      tempRoots
        .splice(0)
        .map(async (tempRoot) => await fs.rm(tempRoot, { recursive: true, force: true }))
    )
    await fs.rm(cacheRoot, { recursive: true, force: true })
  })

  it('does not call mdls during fresh app info scan', async () => {
    const tempRoot = await createTempAppBundle('ChatApp', 'ChatApp')
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'ChatApp.app')

    const { getAppInfo } = await loadSubject()
    const appInfo = await getAppInfo(appPath)

    expect(appInfo).toEqual(
      expect.objectContaining({
        name: 'ChatApp',
        displayName: 'ChatApp',
        bundleId: 'com.example.chatapp',
        path: appPath
      })
    )
    expect(execFileSafeMock).not.toHaveBeenCalled()
  })

  it('prefers localized strings without calling mdls during fresh scan', async () => {
    const tempRoot = await createTempAppBundle('ChatApp', 'ChatApp', {
      localizedDisplayName: '聊天应用'
    })
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'ChatApp.app')

    const { getAppInfo } = await loadSubject()
    const appInfo = await getAppInfo(appPath)

    expect(appInfo).toEqual(
      expect.objectContaining({
        name: 'ChatApp',
        displayName: '聊天应用',
        displayNameSource: 'InfoPlist.strings',
        displayNameQuality: 'localized',
        identityKind: 'macos-path',
        bundleId: 'com.example.chatapp',
        path: appPath
      })
    )
    expect(execFileSafeMock).not.toHaveBeenCalled()
  })

  it('keeps plist and file names as alternate names when localized name wins', async () => {
    const tempRoot = await createTempAppBundle('NeteaseMusic 2', 'NeteaseMusic', {
      localizedDisplayName: '网易云音乐'
    })
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'NeteaseMusic 2.app')

    const { getAppInfo } = await loadSubject()
    const appInfo = await getAppInfo(appPath)

    expect(appInfo).toEqual(
      expect.objectContaining({
        name: 'NeteaseMusic 2',
        displayName: '网易云音乐',
        alternateNames: expect.arrayContaining(['NeteaseMusic', 'NeteaseMusic 2'])
      })
    )
    expect(execFileSafeMock).not.toHaveBeenCalled()
  })

  it('reads zh_CN InfoPlist.strings for ChatApp developer tools', async () => {
    const tempRoot = await createTempAppBundle('chatappdevtools', 'chatappdevtools', {
      localizedDisplayName: '聊天应用开发者工具',
      localizedDir: 'zh_CN.lproj'
    })
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'chatappdevtools.app')

    const { getAppInfo } = await loadSubject()
    const appInfo = await getAppInfo(appPath)

    expect(appInfo).toEqual(
      expect.objectContaining({
        name: 'chatappdevtools',
        displayName: '聊天应用开发者工具',
        displayNameSource: 'InfoPlist.strings',
        displayNameQuality: 'localized',
        identityKind: 'macos-path',
        alternateNames: expect.arrayContaining(['chatappdevtools'])
      })
    )
    expect(execFileSafeMock).not.toHaveBeenCalled()
  })

  it('generates stable hashed png app icon cache from bundle icon resources', async () => {
    const tempRoot = await createTempAppBundle('ChatApp', 'ChatApp', {
      iconFile: 'AppIcon'
    })
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'ChatApp.app')

    const { getAppInfo } = await loadSubject()
    const appInfo = await getAppInfo(appPath)

    expect(appInfo?.icon).toMatch(/cache\/app-icons\/darwin\/[a-f0-9]{32}\.png$/)
    expect(path.basename(appInfo?.icon ?? '')).not.toContain('ChatApp')
    expect(execFileSafeMock).toHaveBeenCalledWith(
      'sips',
      expect.arrayContaining([
        path.join(appPath, 'Contents', 'Resources', 'AppIcon.icns'),
        '--out',
        appInfo?.icon
      ])
    )
  })

  it('reuses existing app icon cache without running sips again', async () => {
    const tempRoot = await createTempAppBundle('Preview', 'Preview', {
      iconFile: 'PreviewIcon'
    })
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'Preview.app')

    const { getAppInfo } = await loadSubject()
    const firstAppInfo = await getAppInfo(appPath)
    execFileSafeMock.mockClear()
    const secondAppInfo = await getAppInfo(appPath)

    expect(secondAppInfo?.icon).toBe(firstAppInfo?.icon)
    expect(execFileSafeMock).not.toHaveBeenCalled()
  })

  it('returns empty icon when app has no icon resources', async () => {
    const tempRoot = await createTempAppBundle('NoIcon', 'NoIcon')
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'NoIcon.app')

    const { getAppInfo } = await loadSubject()
    const appInfo = await getAppInfo(appPath)

    expect(appInfo?.icon).toBe('')
    expect(execFileSafeMock).not.toHaveBeenCalled()
  })
})
