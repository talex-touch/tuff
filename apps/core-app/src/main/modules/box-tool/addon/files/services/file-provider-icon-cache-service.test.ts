import { describe, expect, it, vi } from 'vitest'
import {
  FILE_ICON_META_EXTENSION_KEY,
  persistFileIconCache
} from './file-provider-icon-cache-service'

describe('file-provider-icon-cache-service', () => {
  it('persists icon cache through the serialized database write path', async () => {
    const addFileExtensions = vi.fn(async () => undefined)
    const withDbWriteMock = vi.fn(async (_label: string, operation: () => Promise<unknown>) => {
      return operation()
    })
    const withDbWrite = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
      return (await withDbWriteMock(label, operation)) as T
    }
    const meta = { mtime: 1710000000000, size: 42 }

    await persistFileIconCache(
      {
        dbUtils: { addFileExtensions } as never,
        withDbWrite
      },
      7,
      'data:image/png;base64,aWNvbg==',
      meta
    )

    expect(withDbWriteMock).toHaveBeenCalledTimes(1)
    expect(withDbWriteMock).toHaveBeenCalledWith('file-icon.persist', expect.any(Function))
    expect(addFileExtensions).toHaveBeenCalledTimes(1)
    expect(addFileExtensions).toHaveBeenCalledWith([
      { fileId: 7, key: 'icon', value: 'data:image/png;base64,aWNvbg==' },
      { fileId: 7, key: FILE_ICON_META_EXTENSION_KEY, value: JSON.stringify(meta) }
    ])
  })
})
