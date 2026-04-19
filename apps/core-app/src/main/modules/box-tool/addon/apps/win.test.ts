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
      path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      launchKind: 'uwp',
      launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App',
      displayPath: 'Windows Store',
      stableId: 'uwp:microsoft.windowscalculator_8wekyb3d8bbwe!app'
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
      displayName: 'Calculator Deluxe',
      description: 'Fast calculations',
      bundleId: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe',
      launchKind: 'uwp',
      launchTarget: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
    })
    expect(apps[0].icon).toBe('data:image/png;base64,3q2+7w==')
  })
})
