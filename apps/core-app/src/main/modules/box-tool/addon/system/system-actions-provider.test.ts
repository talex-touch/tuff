import type { IExecuteArgs, TuffItem } from '@talex-touch/utils'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TuffInputType } from '@talex-touch/utils'

const mocks = vi.hoisted(() => ({
  addAppByPath: vi.fn(async () => ({ success: true, status: 'added' })),
  addWatchPath: vi.fn(async () => ({ success: true, status: 'added' })),
  captureScreenshot: vi.fn(async () => ({
    tfileUrl: 'tfile:///tmp/native/screenshots/screenshot.png',
    mimeType: 'image/png',
    width: 100,
    height: 100,
    displayId: '1',
    displayName: 'Display',
    x: 0,
    y: 0,
    scaleFactor: 1,
    durationMs: 1,
    sizeBytes: 12,
    wroteClipboard: true
  })),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })),
  installDevPluginFromPath: vi.fn(),
  installFromSource: vi.fn()
}))

vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: mocks.getLogger
}))

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: vi.fn(() => null)
}))

vi.mock('../../../plugin/dev-plugin-installer', () => ({
  installDevPluginFromPath: mocks.installDevPluginFromPath
}))

vi.mock('../../../plugin/plugin-module', () => ({
  pluginModule: {
    pluginManager: {
      installFromSource: mocks.installFromSource
    }
  }
}))

vi.mock('../../../native-capabilities/screenshot-service', () => ({
  getNativeScreenshotService: vi.fn(() => ({
    capture: mocks.captureScreenshot
  }))
}))

vi.mock('../apps/app-provider', () => ({
  appProvider: {
    addAppByPath: mocks.addAppByPath
  }
}))

vi.mock('../files/file-provider', () => ({
  fileProvider: {
    addWatchPath: mocks.addWatchPath
  }
}))

function getSystemAction(item: TuffItem): { action?: string; path?: string } | undefined {
  return (item.meta?.extension as { systemAction?: { action?: string; path?: string } })
    ?.systemAction
}

function expectFirstItem(items: TuffItem[]): TuffItem {
  expect(items).toHaveLength(1)
  const item = items[0]
  if (!item) {
    throw new Error('Expected one system action item')
  }
  return item
}

async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true
  })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
    })
  }
}

describe('SystemActionsProvider app index actions', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('creates an app-index action from copied file input app paths', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'system-actions-app-'))
    const appPath = path.join(tempDir, 'CopiedTool.exe')
    await fs.writeFile(appPath, 'binary-placeholder', 'utf8')

    const { SystemActionsProvider } = await import('./system-actions-provider')
    const provider = new SystemActionsProvider()
    const result = await withPlatform('win32', () =>
      provider.onSearch(
        {
          text: '',
          inputs: [
            {
              type: TuffInputType.Files,
              content: JSON.stringify([appPath])
            }
          ]
        },
        new AbortController().signal
      )
    )

    const item = expectFirstItem(result.items)
    expect(getSystemAction(item)).toEqual({
      action: 'app-index',
      path: appPath
    })
    expect(item.render).toMatchObject({
      basic: {
        title: '$i18n:corebox.systemActions.addAppIndexTitle|{"name":"CopiedTool.exe"}'
      }
    })
  })

  it('normalizes copied file urls before creating app-index actions', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'system-actions-url-'))
    const appPath = path.join(tempDir, 'UrlTool.app')
    await fs.mkdir(appPath)

    const { SystemActionsProvider } = await import('./system-actions-provider')
    const provider = new SystemActionsProvider()
    const result = await withPlatform('darwin', () =>
      provider.onSearch(
        {
          text: `Install ${new URL(`file://${appPath}`).toString()}`,
          inputs: []
        },
        new AbortController().signal
      )
    )

    const item = expectFirstItem(result.items)
    expect(getSystemAction(item)).toEqual({
      action: 'app-index',
      path: appPath
    })
  })

  it('executes app-index actions through appProvider.addAppByPath', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'system-actions-exec-'))
    const appPath = path.join(tempDir, 'ExecuteTool.lnk')
    await fs.writeFile(appPath, 'shortcut-placeholder', 'utf8')

    const { SystemActionsProvider } = await import('./system-actions-provider')
    const provider = new SystemActionsProvider()
    const result = await withPlatform('win32', () =>
      provider.onSearch(
        {
          text: appPath,
          inputs: []
        },
        new AbortController().signal
      )
    )

    await provider.onExecute({ item: expectFirstItem(result.items) } satisfies IExecuteArgs)

    expect(mocks.addAppByPath).toHaveBeenCalledWith(appPath)
    expect(mocks.addWatchPath).not.toHaveBeenCalled()
  })

  it('creates and executes a screenshot copy action from keyword query', async () => {
    const { SystemActionsProvider } = await import('./system-actions-provider')
    const provider = new SystemActionsProvider()
    const result = await provider.onSearch(
      {
        text: '截图',
        inputs: []
      },
      new AbortController().signal
    )

    const item = expectFirstItem(result.items)
    expect(getSystemAction(item)).toEqual({
      action: 'screenshot-cursor-display',
      path: 'native:screenshot:cursor-display:copy'
    })

    await provider.onExecute({ item } satisfies IExecuteArgs)

    expect(mocks.captureScreenshot).toHaveBeenCalledWith({
      target: 'cursor-display',
      output: 'tfile',
      writeClipboard: true
    })
  })

  it('extracts unquoted Windows app command lines with spaces and arguments', async () => {
    const commandPath = 'C:\\Program Files\\Demo App\\Demo Tool.exe'
    const statSpy = vi.spyOn(fs, 'stat').mockImplementation(async (target) => {
      if (target === commandPath) {
        return {
          isFile: () => true,
          isDirectory: () => false
        } as Awaited<ReturnType<typeof fs.stat>>
      }
      throw new Error(`unexpected stat: ${String(target)}`)
    })

    const { SystemActionsProvider } = await import('./system-actions-provider')
    const provider = new SystemActionsProvider()
    const result = await withPlatform('win32', () =>
      provider.onSearch(
        {
          text: `${commandPath} --profile "Work"`,
          inputs: []
        },
        new AbortController().signal
      )
    )

    const item = expectFirstItem(result.items)
    expect(getSystemAction(item)).toEqual({
      action: 'app-index',
      path: commandPath
    })
    expect(statSpy).toHaveBeenCalledWith(commandPath)
  })

  it('expands Windows env var app command lines before app-index actions', async () => {
    const originalLocalAppData = process.env.LOCALAPPDATA
    process.env.LOCALAPPDATA = 'C:\\Users\\demo\\AppData\\Local'

    const commandPath = 'C:\\Users\\demo\\AppData\\Local\\Programs\\Demo App\\Demo Tool.exe'
    const statSpy = vi.spyOn(fs, 'stat').mockImplementation(async (target) => {
      if (target === commandPath) {
        return {
          isFile: () => true,
          isDirectory: () => false
        } as Awaited<ReturnType<typeof fs.stat>>
      }
      throw new Error(`unexpected stat: ${String(target)}`)
    })

    try {
      const { SystemActionsProvider } = await import('./system-actions-provider')
      const provider = new SystemActionsProvider()
      const result = await withPlatform('win32', () =>
        provider.onSearch(
          {
            text: '%LOCALAPPDATA%\\Programs\\Demo App\\Demo Tool.exe --profile work',
            inputs: []
          },
          new AbortController().signal
        )
      )

      const item = expectFirstItem(result.items)
      expect(getSystemAction(item)).toEqual({
        action: 'app-index',
        path: commandPath
      })
      expect(statSpy).toHaveBeenCalledWith(commandPath)
    } finally {
      if (originalLocalAppData === undefined) {
        delete process.env.LOCALAPPDATA
      } else {
        process.env.LOCALAPPDATA = originalLocalAppData
      }
    }
  })

  it('extracts quoted Windows env var app command lines before app-index actions', async () => {
    const originalLocalAppData = process.env.LOCALAPPDATA
    process.env.LOCALAPPDATA = 'C:\\Users\\demo\\AppData\\Local'

    const commandPath = 'C:\\Users\\demo\\AppData\\Local\\Programs\\Demo App\\Demo Tool.exe'
    const statSpy = vi.spyOn(fs, 'stat').mockImplementation(async (target) => {
      if (target === commandPath) {
        return {
          isFile: () => true,
          isDirectory: () => false
        } as Awaited<ReturnType<typeof fs.stat>>
      }
      throw new Error(`unexpected stat: ${String(target)}`)
    })

    try {
      const { SystemActionsProvider } = await import('./system-actions-provider')
      const provider = new SystemActionsProvider()
      const result = await withPlatform('win32', () =>
        provider.onSearch(
          {
            text: '"%LOCALAPPDATA%\\Programs\\Demo App\\Demo Tool.exe" --profile work',
            inputs: []
          },
          new AbortController().signal
        )
      )

      const item = expectFirstItem(result.items)
      expect(getSystemAction(item)).toEqual({
        action: 'app-index',
        path: commandPath
      })
      expect(statSpy).toHaveBeenCalledWith(commandPath)
    } finally {
      if (originalLocalAppData === undefined) {
        delete process.env.LOCALAPPDATA
      } else {
        process.env.LOCALAPPDATA = originalLocalAppData
      }
    }
  })

  it('extracts Windows shortcut property target text before app-index actions', async () => {
    const commandPath = 'C:\\Program Files\\Demo App\\Demo Tool.exe'
    const statSpy = vi.spyOn(fs, 'stat').mockImplementation(async (target) => {
      if (target === commandPath) {
        return {
          isFile: () => true,
          isDirectory: () => false
        } as Awaited<ReturnType<typeof fs.stat>>
      }
      throw new Error(`unexpected stat: ${String(target)}`)
    })

    const { SystemActionsProvider } = await import('./system-actions-provider')
    const provider = new SystemActionsProvider()
    const result = await withPlatform('win32', () =>
      provider.onSearch(
        {
          text: [
            'Name: Demo Tool',
            `Target: "${commandPath}" --profile work`,
            'Start in: C:\\Program Files\\Demo App'
          ].join('\n'),
          inputs: []
        },
        new AbortController().signal
      )
    )

    const item = expectFirstItem(result.items)
    expect(getSystemAction(item)).toEqual({
      action: 'app-index',
      path: commandPath
    })
    expect(statSpy).toHaveBeenCalledWith(commandPath)
  })

  it('routes copied Windows ClickOnce appref-ms paths to app-index actions', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'system-actions-appref-'))
    const appPath = path.join(tempDir, 'ClickOnceTool.appref-ms')
    await fs.writeFile(appPath, 'clickonce-placeholder', 'utf8')

    const { SystemActionsProvider } = await import('./system-actions-provider')
    const provider = new SystemActionsProvider()
    const result = await withPlatform('win32', () =>
      provider.onSearch(
        {
          text: appPath,
          inputs: []
        },
        new AbortController().signal
      )
    )

    const item = expectFirstItem(result.items)
    expect(getSystemAction(item)).toEqual({
      action: 'app-index',
      path: appPath
    })

    await provider.onExecute({ item } satisfies IExecuteArgs)

    expect(mocks.addAppByPath).toHaveBeenCalledWith(appPath)
    expect(mocks.addWatchPath).not.toHaveBeenCalled()
  })

  it('routes copied Windows UWP shell paths to app-index actions', async () => {
    const shellPath = 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'

    const { SystemActionsProvider } = await import('./system-actions-provider')
    const provider = new SystemActionsProvider()
    const result = await withPlatform('win32', () =>
      provider.onSearch(
        {
          text: `Add ${shellPath}`,
          inputs: []
        },
        new AbortController().signal
      )
    )

    const item = expectFirstItem(result.items)
    expect(getSystemAction(item)).toEqual({
      action: 'app-index',
      path: shellPath
    })

    await provider.onExecute({ item } satisfies IExecuteArgs)

    expect(mocks.addAppByPath).toHaveBeenCalledWith(shellPath)
    expect(mocks.addWatchPath).not.toHaveBeenCalled()
  })

  it('normalizes copied Windows UWP app ids to shell paths for app-index actions', async () => {
    const appId = 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'
    const shellPath = `shell:AppsFolder\\${appId}`

    const { SystemActionsProvider } = await import('./system-actions-provider')
    const provider = new SystemActionsProvider()
    const result = await withPlatform('win32', () =>
      provider.onSearch(
        {
          text: `Add ${appId}`,
          inputs: []
        },
        new AbortController().signal
      )
    )

    const item = expectFirstItem(result.items)
    expect(getSystemAction(item)).toEqual({
      action: 'app-index',
      path: shellPath
    })

    await provider.onExecute({ item } satisfies IExecuteArgs)

    expect(mocks.addAppByPath).toHaveBeenCalledWith(shellPath)
    expect(mocks.addWatchPath).not.toHaveBeenCalled()
  })
})
