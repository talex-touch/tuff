import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileSafeMock } = vi.hoisted(() => ({
  execFileSafeMock: vi.fn()
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
  options?: { localizedDisplayName?: string }
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
</dict>
</plist>`
  )

  if (options?.localizedDisplayName) {
    const localizedDir = path.join(resourcesPath, 'zh-Hans.lproj')
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

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await Promise.all(
      tempRoots
        .splice(0)
        .map(async (tempRoot) => await fs.rm(tempRoot, { recursive: true, force: true }))
    )
  })

  it('does not call mdls during fresh app info scan', async () => {
    const tempRoot = await createTempAppBundle('WeChat', 'WeChat')
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'WeChat.app')

    const { getAppInfo } = await loadSubject()
    const appInfo = await getAppInfo(appPath)

    expect(appInfo).toEqual(
      expect.objectContaining({
        name: 'WeChat',
        displayName: 'WeChat',
        bundleId: 'com.example.wechat',
        path: appPath
      })
    )
    expect(execFileSafeMock).not.toHaveBeenCalled()
  })

  it('prefers localized strings without calling mdls during fresh scan', async () => {
    const tempRoot = await createTempAppBundle('WeChat', 'WeChat', {
      localizedDisplayName: '微信'
    })
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'WeChat.app')

    const { getAppInfo } = await loadSubject()
    const appInfo = await getAppInfo(appPath)

    expect(appInfo).toEqual(
      expect.objectContaining({
        name: 'WeChat',
        displayName: '微信',
        bundleId: 'com.example.wechat',
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
})
