import path from 'node:path'
import fse from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadExtensionMock, removeExtensionMock } = vi.hoisted(() => ({
  loadExtensionMock: vi.fn<(extensionPath: string) => Promise<{ id: string; name: string }>>(),
  removeExtensionMock: vi.fn<(id: string) => void>()
}))

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      loadExtension: loadExtensionMock,
      removeExtension: removeExtensionMock
    }
  }
}))

import { ExtensionLoaderModule } from './extension-loader'

describe('ExtensionLoaderModule', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    loadExtensionMock.mockReset()
    removeExtensionMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('unloads loaded extensions in reverse order on destroy', async () => {
    const entries = ['ext-a', 'ext-b'] as unknown as ReturnType<typeof fse.readdirSync>
    vi.spyOn(fse, 'readdirSync').mockReturnValue(entries)
    loadExtensionMock.mockImplementation(async (fullPath: string) => {
      const name = path.basename(fullPath)
      return { id: name, name }
    })

    const module = new ExtensionLoaderModule()
    const initContext = {
      file: { dirPath: '/tmp/extensions' }
    } as unknown as Parameters<ExtensionLoaderModule['onInit']>[0]
    await module.onInit(initContext)

    await module.onDestroy()

    const moduleState = module as unknown as { loadedExtensions: unknown[]; extensions: string[] }
    expect(removeExtensionMock.mock.calls.map((call) => call[0])).toEqual(['ext-b', 'ext-a'])
    expect(moduleState.loadedExtensions).toEqual([])
    expect(moduleState.extensions).toEqual([])
  })

  it('only unloads successfully loaded extensions', async () => {
    const entries = ['ext-a', 'ext-b'] as unknown as ReturnType<typeof fse.readdirSync>
    vi.spyOn(fse, 'readdirSync').mockReturnValue(entries)
    loadExtensionMock
      .mockRejectedValueOnce(new Error('broken package'))
      .mockResolvedValueOnce({ id: 'ext-b', name: 'ext-b' })

    const module = new ExtensionLoaderModule()
    const initContext = {
      file: { dirPath: '/tmp/extensions' }
    } as unknown as Parameters<ExtensionLoaderModule['onInit']>[0]
    await module.onInit(initContext)

    await module.onDestroy()

    expect(removeExtensionMock).toHaveBeenCalledTimes(1)
    expect(removeExtensionMock).toHaveBeenCalledWith('ext-b')
  })
})
