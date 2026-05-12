import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  accessMock,
  execFileSafeMock,
  mkdirMock,
  readShortcutLinkMock,
  readdirMock,
  readFileMock,
  statMock,
  tmpdirMock,
  writeFileMock
} = vi.hoisted(() => ({
  accessMock: vi.fn(),
  execFileSafeMock: vi.fn(),
  mkdirMock: vi.fn(),
  readShortcutLinkMock: vi.fn(),
  readdirMock: vi.fn(),
  readFileMock: vi.fn(),
  statMock: vi.fn(),
  tmpdirMock: vi.fn(() => 'C:\\Temp'),
  writeFileMock: vi.fn()
}))

vi.mock('node:process', () => ({
  default: {
    ...process,
    platform: 'win32'
  }
}))

vi.mock('node:os', () => ({
  default: {
    homedir: () => 'C:\\Users\\demo',
    tmpdir: tmpdirMock
  },
  homedir: () => 'C:\\Users\\demo',
  tmpdir: tmpdirMock
}))

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path')
  return {
    ...actual.win32,
    default: actual.win32
  }
})

vi.mock('node:fs/promises', () => ({
  default: {
    access: accessMock,
    mkdir: mkdirMock,
    readFile: readFileMock,
    readdir: readdirMock,
    stat: statMock,
    writeFile: writeFileMock
  },
  access: accessMock,
  mkdir: mkdirMock,
  readFile: readFileMock,
  readdir: readdirMock,
  stat: statMock,
  writeFile: writeFileMock
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  execFileSafe: execFileSafeMock
}))

vi.mock('electron', () => ({
  shell: {
    readShortcutLink: readShortcutLinkMock
  }
}))

vi.mock('extract-file-icon', () => ({
  default: vi.fn(() => Buffer.from([1, 2, 3]))
}))

function createFileStat(mtime = new Date('2026-01-01T00:00:00.000Z')) {
  return {
    isDirectory: () => false,
    isFile: () => true,
    mtime
  }
}

function mockPowerShellOutputs(options: { startApps?: unknown; registryApps?: unknown }): void {
  execFileSafeMock.mockImplementation(async (_command: string, args: string[]) => {
    const script = args[args.length - 1] || ''
    if (script.includes('Get-StartApps')) {
      return { stdout: JSON.stringify(options.startApps ?? []), stderr: '' }
    }
    if (script.includes('Get-ItemProperty')) {
      return { stdout: JSON.stringify(options.registryApps ?? []), stderr: '' }
    }
    return { stdout: '[]', stderr: '' }
  })
}

describe('win app scanner', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mkdirMock.mockResolvedValue(undefined)
    accessMock.mockRejectedValue(new Error('ENOENT'))
    readFileMock.mockResolvedValue(Buffer.from([1, 2, 3]))
    writeFileMock.mockResolvedValue(undefined)
  })

  it('preserves shortcut args and working directory in scanned apps', async () => {
    const startMenuPath = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
    const userStartMenuPath =
      'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'
    const shortcutPath = `${startMenuPath}\\Foo.lnk`
    const targetPath = 'C:\\Program Files\\Foo\\Foo.exe'

    readdirMock.mockImplementation(async (dir: string) => {
      if (dir === startMenuPath) return ['Foo.lnk']
      if (dir === userStartMenuPath) return []
      return []
    })
    statMock.mockImplementation(async (target: string) => {
      if (target === shortcutPath || target === targetPath) {
        return createFileStat()
      }
      throw new Error(`Unexpected stat path: ${target}`)
    })
    readShortcutLinkMock.mockReturnValue({
      target: targetPath,
      args: '--profile work',
      cwd: 'C:\\Program Files\\Foo'
    })
    execFileSafeMock.mockResolvedValue({ stdout: '[]', stderr: '' })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      path: shortcutPath,
      launchKind: 'shortcut',
      launchTarget: targetPath,
      launchArgs: '--profile work',
      workingDirectory: 'C:\\Program Files\\Foo',
      displayPath: targetPath,
      stableId: 'shortcut:c:\\program files\\foo\\foo.exe|--profile work'
    })
  })

  it('includes Windows Store apps from Get-StartApps output', async () => {
    readdirMock.mockResolvedValue([])
    execFileSafeMock.mockResolvedValue({
      stdout: '[{"Name":"Calculator","AppId":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"}]',
      stderr: ''
    })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      name: 'Calculator',
      displayName: 'Calculator',
      displayNameSource: 'Get-StartApps',
      displayNameQuality: 'system',
      identityKind: 'windows-uwp',
      path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      launchKind: 'uwp',
      launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      displayPath: 'Windows Store',
      stableId: 'uwp:microsoft.windowscalculator_8wekyb3d8bbwe!app'
    })
  })

  it('treats absolute Get-StartApps AppId values as desktop apps', async () => {
    const appPath = 'D:\\Tools\\Codex\\Codex.exe'

    readdirMock.mockResolvedValue([])
    statMock.mockImplementation(async (target: string) => {
      if (target === appPath) return createFileStat()
      throw new Error(`Unexpected stat path: ${target}`)
    })
    execFileSafeMock.mockResolvedValue({
      stdout: JSON.stringify([{ Name: 'Codex', AppId: appPath }]),
      stderr: ''
    })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      name: 'Codex',
      displayName: 'Codex',
      displayNameSource: 'Get-StartApps',
      displayNameQuality: 'system',
      identityKind: 'windows-path',
      path: appPath,
      launchKind: 'path',
      launchTarget: appPath,
      displayPath: appPath,
      stableId: 'd:\\tools\\codex\\codex.exe'
    })
  })

  it('includes ClickOnce appref-ms entries from Start Menu', async () => {
    const startMenuPath = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
    const userStartMenuPath =
      'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'
    const apprefPath = `${startMenuPath}\\Work Tool.appref-ms`

    readdirMock.mockImplementation(async (dir: string) => {
      if (dir === startMenuPath) return ['Work Tool.appref-ms']
      if (dir === userStartMenuPath) return []
      return []
    })
    statMock.mockImplementation(async (target: string) => {
      if (target === apprefPath) return createFileStat()
      throw new Error(`Unexpected stat path: ${target}`)
    })
    execFileSafeMock.mockResolvedValue({ stdout: '[]', stderr: '' })

    const { getApps, getAppInfo } = await import('./win')
    const apps = await getApps()
    const appInfo = await getAppInfo(apprefPath)

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      name: 'Work Tool',
      path: apprefPath,
      launchKind: 'path',
      launchTarget: apprefPath,
      displayPath: apprefPath,
      stableId: 'c:\\programdata\\microsoft\\windows\\start menu\\programs\\work tool.appref-ms'
    })
    expect(appInfo).toMatchObject({
      name: 'Work Tool',
      path: apprefPath,
      launchKind: 'path',
      launchTarget: apprefPath
    })
    expect(readShortcutLinkMock).not.toHaveBeenCalled()
  })

  it('treats known-folder Get-StartApps AppId values as desktop apps', async () => {
    const appPath = 'C:\\Program Files\\Tencent\\Weixin\\Weixin.exe'

    readdirMock.mockResolvedValue([])
    statMock.mockImplementation(async (target: string) => {
      if (target === appPath) return createFileStat()
      throw new Error(`Unexpected stat path: ${target}`)
    })
    mockPowerShellOutputs({
      startApps: [
        {
          Name: '微信',
          AppId: '{6D809377-6AF0-444B-8957-A3773F02200E}\\Tencent\\Weixin\\Weixin.exe'
        },
        {
          Name: '卸载微信',
          AppId: '{6D809377-6AF0-444B-8957-A3773F02200E}\\Tencent\\Weixin\\Uninstall.exe'
        }
      ]
    })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      name: 'Weixin',
      displayName: '微信',
      displayNameSource: 'Get-StartApps',
      displayNameQuality: 'system',
      identityKind: 'windows-path',
      path: appPath,
      launchKind: 'path',
      launchTarget: appPath,
      displayPath: appPath,
      stableId: 'c:\\program files\\tencent\\weixin\\weixin.exe'
    })
  })

  it('keeps Codex as a UWP app from Get-StartApps output', async () => {
    readdirMock.mockResolvedValue([])
    mockPowerShellOutputs({
      startApps: [
        {
          Name: 'Codex',
          AppId: 'OpenAI.Codex_2p2nqsd0c76g0!App',
          PackageFamilyName: 'OpenAI.Codex_2p2nqsd0c76g0'
        }
      ]
    })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      name: 'Codex',
      displayName: 'Codex',
      path: 'shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App',
      launchKind: 'uwp',
      launchTarget: 'OpenAI.Codex_2p2nqsd0c76g0!App',
      bundleId: 'OpenAI.Codex_2p2nqsd0c76g0',
      stableId: 'uwp:openai.codex_2p2nqsd0c76g0!app'
    })
  })

  it('enriches Windows Store apps with manifest metadata and logo variants', async () => {
    const installLocation = 'C:\\Program Files\\WindowsApps\\Microsoft.WindowsCalculator'
    const manifestPath = `${installLocation}\\AppxManifest.xml`
    const logoDirectory = `${installLocation}\\Assets`
    const variantLogoPath = `${logoDirectory}\\Square44x44Logo.targetsize-32.png`

    readdirMock.mockImplementation(async (dir: string) => {
      if (dir === 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs') return []
      if (dir === 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs')
        return []
      if (dir === logoDirectory) {
        return ['Square44x44Logo.targetsize-32.png']
      }
      return []
    })
    accessMock.mockImplementation(async (target: string) => {
      if (target === `${logoDirectory}\\Square44x44Logo.png`) {
        throw new Error('ENOENT')
      }
      return undefined
    })
    readFileMock.mockImplementation(async (target: string) => {
      if (target === manifestPath) {
        return `<?xml version="1.0" encoding="utf-8"?>
<Package>
  <Applications>
    <Application Id="App">
      <uap:VisualElements
        DisplayName="Calculator Deluxe"
        Description="Fast calculations"
        Square44x44Logo="Assets\\Square44x44Logo.png" />
    </Application>
  </Applications>
</Package>`
      }
      if (target === variantLogoPath) {
        return Buffer.from([0xde, 0xad, 0xbe, 0xef])
      }
      return Buffer.from([1, 2, 3])
    })
    execFileSafeMock.mockResolvedValue({
      stdout: JSON.stringify([
        {
          Name: 'Calculator',
          AppId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
          PackageFamilyName: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
          InstallLocation: installLocation
        }
      ]),
      stderr: ''
    })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      name: 'Calculator',
      displayName: 'Calculator',
      displayNameSource: 'Get-StartApps',
      displayNameQuality: 'system',
      identityKind: 'windows-uwp',
      description: 'Fast calculations',
      bundleId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
      launchKind: 'uwp',
      launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
    })
    expect(apps[0].alternateNames).toEqual(
      expect.arrayContaining([
        'Calculator Deluxe',
        'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
        'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
      ])
    )
    expect(apps[0].icon).toBe('data:image/png;base64,3q2+7w==')
  })

  it('includes registry apps from DisplayIcon executable paths', async () => {
    const targetPath = 'C:\\Program Files\\Foo\\Foo.exe'

    readdirMock.mockImplementation(async (dir: string) => {
      if (dir === 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs') return []
      if (dir === 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs')
        return []
      return []
    })
    statMock.mockImplementation(async (target: string) => {
      if (target === targetPath) return createFileStat()
      throw new Error(`Unexpected stat path: ${target}`)
    })
    mockPowerShellOutputs({
      registryApps: [
        {
          displayName: 'Foo',
          displayIcon: `"${targetPath}",0`,
          publisher: 'Foo Inc.',
          systemComponent: 0
        }
      ]
    })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      name: 'Foo',
      displayName: 'Foo',
      displayNameSource: 'registry',
      displayNameQuality: 'registry',
      identityKind: 'windows-path',
      description: 'Foo Inc.',
      path: targetPath,
      launchKind: 'path',
      launchTarget: targetPath,
      stableId: 'registry:c:\\program files\\foo\\foo.exe'
    })
    expect(apps[0].icon).toBe('data:image/png;base64,AQID')
  })

  it('falls back to InstallLocation executables for registry apps', async () => {
    const installLocation = 'C:\\Program Files\\Acme'
    const targetPath = `${installLocation}\\AcmeApp.exe`

    readdirMock.mockImplementation(async (dir: string) => {
      if (dir === 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs') return []
      if (dir === 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs')
        return []
      if (dir === installLocation) {
        return ['setup.exe', 'AcmeApp.exe', 'AcmeUpdater.exe']
      }
      return []
    })
    statMock.mockImplementation(async (target: string) => {
      if (target === targetPath) return createFileStat()
      throw new Error(`Unexpected stat path: ${target}`)
    })
    mockPowerShellOutputs({
      registryApps: [
        {
          displayName: 'Acme',
          installLocation,
          publisher: 'Acme Corp',
          systemComponent: 0
        }
      ]
    })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      name: 'Acme',
      launchTarget: targetPath,
      stableId: 'registry:c:\\program files\\acme\\acmeapp.exe'
    })
  })

  it('filters registry system components and maintenance entries', async () => {
    readdirMock.mockImplementation(async (dir: string) => {
      if (dir === 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs') return []
      if (dir === 'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs')
        return []
      return []
    })
    statMock.mockImplementation(async (target: string) => {
      throw new Error(`Unexpected stat path: ${target}`)
    })
    mockPowerShellOutputs({
      registryApps: [
        { displayIcon: 'C:\\Program Files\\Hidden\\Hidden.exe', systemComponent: 0 },
        {
          displayName: 'Driver System Component',
          displayIcon: 'C:\\Program Files\\Driver\\Driver.exe',
          systemComponent: 1
        },
        {
          displayName: 'Foo Updater',
          displayIcon: 'C:\\Program Files\\Foo\\Updater.exe',
          systemComponent: 0
        },
        {
          displayName: 'Bar',
          displayIcon: 'C:\\Program Files\\Bar\\Bar.exe',
          releaseType: 'Update',
          systemComponent: 0
        },
        {
          displayName: 'Baz',
          displayIcon: 'C:\\Program Files\\Baz\\Baz.exe',
          parentKeyName: 'BazSuite',
          systemComponent: 0
        }
      ]
    })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(0)
    expect(statMock).not.toHaveBeenCalledWith(expect.stringContaining('.exe'))
  })

  it('prefers Start Menu shortcuts over duplicate Get-StartApps desktop targets', async () => {
    const startMenuPath = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
    const userStartMenuPath =
      'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'
    const shortcutPath = `${startMenuPath}\\微信.lnk`
    const targetPath = 'C:\\Program Files\\Tencent\\Weixin\\Weixin.exe'

    readdirMock.mockImplementation(async (dir: string) => {
      if (dir === startMenuPath) return ['微信.lnk']
      if (dir === userStartMenuPath) return []
      return []
    })
    statMock.mockImplementation(async (target: string) => {
      if (target === shortcutPath || target === targetPath) return createFileStat()
      throw new Error(`Unexpected stat path: ${target}`)
    })
    readShortcutLinkMock.mockReturnValue({
      target: targetPath,
      args: '',
      cwd: 'C:\\Program Files\\Tencent\\Weixin'
    })
    mockPowerShellOutputs({
      startApps: [
        {
          Name: '微信',
          AppId: '{6D809377-6AF0-444B-8957-A3773F02200E}\\Tencent\\Weixin\\Weixin.exe'
        }
      ]
    })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      name: '微信',
      path: shortcutPath,
      launchKind: 'shortcut',
      launchTarget: targetPath,
      workingDirectory: 'C:\\Program Files\\Tencent\\Weixin',
      stableId: 'shortcut:c:\\program files\\tencent\\weixin\\weixin.exe|'
    })
  })

  it('prefers Start Menu entries over duplicate registry targets', async () => {
    const startMenuPath = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs'
    const userStartMenuPath =
      'C:\\Users\\demo\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs'
    const shortcutPath = `${startMenuPath}\\Foo.lnk`
    const targetPath = 'C:\\Program Files\\Foo\\Foo.exe'

    readdirMock.mockImplementation(async (dir: string) => {
      if (dir === startMenuPath) return ['Foo.lnk']
      if (dir === userStartMenuPath) return []
      return []
    })
    statMock.mockImplementation(async (target: string) => {
      if (target === shortcutPath || target === targetPath) return createFileStat()
      throw new Error(`Unexpected stat path: ${target}`)
    })
    readShortcutLinkMock.mockReturnValue({
      target: targetPath,
      args: '',
      cwd: 'C:\\Program Files\\Foo'
    })
    mockPowerShellOutputs({
      registryApps: [
        {
          displayName: 'Foo Registry',
          displayIcon: `${targetPath},0`,
          publisher: 'Foo Inc.',
          systemComponent: 0
        }
      ]
    })

    const { getApps } = await import('./win')
    const apps = await getApps()

    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      name: 'Foo',
      path: shortcutPath,
      launchKind: 'shortcut',
      launchTarget: targetPath,
      stableId: 'shortcut:c:\\program files\\foo\\foo.exe|'
    })
  })
})
