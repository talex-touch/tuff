import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileSafeMock } = vi.hoisted(() => ({
  execFileSafeMock: vi.fn()
}))

vi.mock('@talex-touch/utils', () => ({
  createRetrier: vi.fn(() => {
    return <TArgs extends unknown[], TResult>(task: (...args: TArgs) => Promise<TResult>) => {
      return async (...args: TArgs) => await task(...args)
    }
  })
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

  it('prefers Spotlight displayName during fresh app info scan and uses safe mdls args', async () => {
    const tempRoot = await createTempAppBundle('WeChat', 'WeChat')
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'WeChat.app')

    execFileSafeMock.mockImplementation(async (command: string, args: string[]) => {
      if (command === 'mdls') {
        expect(args).toEqual(['-name', 'kMDItemDisplayName', '-raw', appPath])
        return { stdout: '微信.app\n', stderr: '' }
      }

      throw new Error(`unexpected command: ${command}`)
    })

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
    expect(execFileSafeMock).toHaveBeenCalledWith('mdls', [
      '-name',
      'kMDItemDisplayName',
      '-raw',
      appPath
    ])
  })

  it('falls back to localized strings when Spotlight display name is unavailable', async () => {
    const tempRoot = await createTempAppBundle('WeChat', 'WeChat', {
      localizedDisplayName: '微信'
    })
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'WeChat.app')

    execFileSafeMock.mockImplementation(async (command: string) => {
      if (command === 'mdls') {
        return { stdout: '(null)\n', stderr: '' }
      }

      throw new Error(`unexpected command: ${command}`)
    })

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
  })

  it('keeps localized display name as an alternate name when Spotlight wins', async () => {
    const tempRoot = await createTempAppBundle('NeteaseMusic 2', 'NeteaseMusic', {
      localizedDisplayName: '网易云音乐'
    })
    tempRoots.push(tempRoot)
    const appPath = path.join(tempRoot, 'NeteaseMusic 2.app')

    execFileSafeMock.mockImplementation(async (command: string) => {
      if (command === 'mdls') {
        return { stdout: 'NeteaseMusic 2.app\n', stderr: '' }
      }

      throw new Error(`unexpected command: ${command}`)
    })

    const { getAppInfo } = await loadSubject()
    const appInfo = await getAppInfo(appPath)

    expect(appInfo).toEqual(
      expect.objectContaining({
        name: 'NeteaseMusic 2',
        displayName: 'NeteaseMusic 2',
        alternateNames: expect.arrayContaining(['网易云音乐'])
      })
    )
  })
})
