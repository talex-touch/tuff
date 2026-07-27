import { mkdtempSync, readFileSync as readNodeFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { StorageList } from '@talex-touch/utils'
import { StorageEvents } from '@talex-touch/utils/transport/events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StorageModule } from './index'

const readFileSyncSpy = vi.hoisted(() => vi.fn())
const transportMocks = vi.hoisted(() => ({
  on: vi.fn(() => vi.fn()),
  onStream: vi.fn(() => vi.fn())
}))

vi.mock('fs-extra', async () => {
  const actual = await vi.importActual<typeof import('fs-extra')>('fs-extra')
  const actualModule = actual as typeof actual & { default?: typeof actual }
  const actualDefault = actualModule.default ?? actual
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
  getTuffTransportMain: () => transportMocks
}))

describe('StorageModule', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    readFileSyncSpy.mockReset()
    transportMocks.on.mockClear()
    transportMocks.onStream.mockClear()
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
    } as unknown as Parameters<StorageModule['init']>[0])

    expect(readFileSyncSpy).toHaveBeenCalledTimes(1)
    expect(readFileSyncSpy).toHaveBeenCalledWith(accountPath, 'utf-8')

    const result = storage.getConfig(StorageList.ACCOUNT)

    expect(result).toEqual({
      user: { id: 1, username: 'demo', email: 'demo@example.test' }
    })
    expect(readFileSyncSpy).toHaveBeenCalledTimes(1)

    await storage.onDestroy()
  })

  it('persists an accepted lifecycle-critical save before replying', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-persist-'))
    const storage = new StorageModule()

    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])

    const persist = vi.spyOn(storage, 'persistConfigNow').mockResolvedValue(undefined)
    const registration = (
      transportMocks.on.mock.calls as unknown as Array<readonly [unknown, unknown]>
    ).find(([event]) => event === StorageEvents.app.save)
    const handler = registration?.[1] as
      | ((request: {
          key: string
          value: object
          persist?: boolean
        }) => Promise<{ success: boolean; version: number }>)
      | undefined

    await expect(
      handler?.({
        key: StorageList.APP_SETTING,
        value: { beginner: { init: true } },
        persist: true
      })
    ).resolves.toMatchObject({ success: true })
    expect(persist).toHaveBeenCalledWith(StorageList.APP_SETTING)

    await storage.onDestroy()
  })

  it('restores the previous gate value when durable persistence fails', async () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'tuff-storage-rollback-'))
    const storage = new StorageModule()

    await storage.init({
      app: { channel: {} },
      file: { create: true, dirName: 'config', dirPath: configDir }
    } as unknown as Parameters<StorageModule['init']>[0])

    vi.spyOn(storage, 'persistConfigNow').mockRejectedValue(new Error('disk unavailable'))
    const registration = (
      transportMocks.on.mock.calls as unknown as Array<readonly [unknown, unknown]>
    ).find(([event]) => event === StorageEvents.app.save)
    const handler = registration?.[1] as
      | ((request: {
          key: string
          value: object
          persist?: boolean
        }) => Promise<{ success: boolean; version: number }>)
      | undefined

    await handler?.({
      key: StorageList.APP_SETTING,
      value: { beginner: { init: false } }
    })

    await expect(
      handler?.({
        key: StorageList.APP_SETTING,
        value: { beginner: { init: true } },
        persist: true
      })
    ).rejects.toThrow('disk unavailable')

    const restored = storage.getConfig(StorageList.APP_SETTING) as {
      beginner?: { init?: boolean }
    }
    expect(restored.beginner?.init).toBe(false)

    await storage.onDestroy()
  })
})
