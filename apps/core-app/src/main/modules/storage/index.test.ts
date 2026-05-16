import { mkdtempSync, readFileSync as readNodeFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { StorageList } from '@talex-touch/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StorageModule } from './index'

const readFileSyncSpy = vi.hoisted(() => vi.fn())

vi.mock('fs-extra', async () => {
  const actual = await vi.importActual<typeof import('fs-extra')>('fs-extra')
  const actualDefault = actual.default ?? actual
  return {
    ...actual,
    default: {
      ...actualDefault,
      readFileSync: readFileSyncSpy
    },
    readFileSync: readFileSyncSpy
  }
})

vi.mock('@talex-touch/utils/transport/main', () => ({
  getTuffTransportMain: () => ({
    on: vi.fn(() => vi.fn()),
    onStream: vi.fn(() => vi.fn())
  })
}))

describe('StorageModule', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    readFileSyncSpy.mockReset()
  })

  it('warms account storage during init so later reads use cache', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-'))
    const accountPath = path.join(configDir, StorageList.ACCOUNT)
    const accountContent = JSON.stringify({
      user: { id: 1, username: 'demo', email: 'demo@example.test' }
    })

    writeFileSync(accountPath, accountContent, 'utf-8')
    readFileSyncSpy.mockImplementation((filePath: string, encoding: BufferEncoding) =>
      readNodeFileSync(filePath, encoding)
    )

    const storage = new StorageModule()

    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as Parameters<StorageModule['init']>[0])

    expect(readFileSyncSpy).toHaveBeenCalledTimes(1)
    expect(readFileSyncSpy).toHaveBeenCalledWith(accountPath, 'utf-8')

    const result = storage.getConfig(StorageList.ACCOUNT)

    expect(result).toEqual({
      user: { id: 1, username: 'demo', email: 'demo@example.test' }
    })
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1)

    await storage.onDestroy()
  })
})
