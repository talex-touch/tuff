import { describe, expect, it, vi } from 'vitest'
import {
  FILE_ICON_META_EXTENSION_KEY,
  persistFileIconCache
} from './file-provider-icon-cache-service'

const ICON_PATH =
  '/cache/file-icons/6f2a4c8e9d0b1a2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071829300.png'

function createDeps() {
  const addFileExtensions = vi.fn(async () => undefined)
  const withDbWriteMock = vi.fn(async (_label: string, operation: () => Promise<unknown>) => {
    return operation()
  })
  const withDbWrite = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
    return (await withDbWriteMock(label, operation)) as T
  }

  return {
    deps: { dbUtils: { addFileExtensions } as never, withDbWrite },
    addFileExtensions,
    withDbWriteMock
  }
}

describe('file-provider-icon-cache-service', () => {
  it('persists icon cache through the serialized database write path', async () => {
    const { deps, addFileExtensions, withDbWriteMock } = createDeps()
    const meta = { mtime: 1710000000000, size: 42 }

    await persistFileIconCache(deps, 7, ICON_PATH, meta)

    expect(withDbWriteMock).toHaveBeenCalledTimes(1)
    expect(withDbWriteMock).toHaveBeenCalledWith('file-icon.persist', expect.any(Function))
    expect(addFileExtensions).toHaveBeenCalledTimes(1)
    expect(addFileExtensions).toHaveBeenCalledWith([
      { fileId: 7, key: 'icon', value: ICON_PATH },
      { fileId: 7, key: FILE_ICON_META_EXTENSION_KEY, value: JSON.stringify(meta) }
    ])
  })

  it('refuses to store an icon value that is not an absolute path', async () => {
    const { deps, addFileExtensions, withDbWriteMock } = createDeps()

    // The value written here is read back by the renderer and fetched through `tfile:`, so a
    // Base64 image string is both unusable and the storage growth the cutover removed.
    await expect(
      persistFileIconCache(deps, 7, 'data:image/png;base64,aWNvbg==', { mtime: null, size: null })
    ).rejects.toThrow('FILE_ICON_CACHE_PATH_REQUIRED')

    expect(withDbWriteMock).not.toHaveBeenCalled()
    expect(addFileExtensions).not.toHaveBeenCalled()
  })
})
