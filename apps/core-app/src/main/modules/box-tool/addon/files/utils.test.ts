import { describe, expect, it, vi } from 'vitest'
import { FILE_ICON_META_EXTENSION_KEY } from './services/file-provider-icon-cache-service'
import { THUMBNAIL_STATUS_EXTENSION_KEY } from './thumbnail-config'
import {
  getDirectoryLevelExclusionReason,
  getFileTraversalExclusionReason,
  mapFileToTuffItem
} from './utils'

/**
 * Whether a path would be served by the `tfile:` handler is answered by the local-file policy,
 * which resolves its roots from Electron and the filesystem. Stubbing the answer here keeps the
 * icon-selection contract under test instead of the policy's environment.
 */
vi.mock('../../../../utils/local-file-policy', () => ({
  isServableLocalFilePath: (filePath: string) => filePath.startsWith('/served/')
}))

function createFile(overrides: Partial<Parameters<typeof mapFileToTuffItem>[0]> = {}) {
  return {
    id: 1,
    path: '/Users/demo/Documents/report final.txt',
    name: 'report final.txt',
    displayName: null,
    extension: '.txt',
    size: 128,
    mtime: new Date('2026-06-18T00:00:00.000Z'),
    ctime: new Date('2026-06-17T00:00:00.000Z'),
    lastIndexedAt: new Date('2026-06-18T00:00:00.000Z'),
    isDir: false,
    type: 'file',
    content: null,
    embeddingStatus: 'none',
    ...overrides
  } as Parameters<typeof mapFileToTuffItem>[0]
}

describe('file provider utils', () => {
  it('adds copy-only path actions to file search results', () => {
    const item = mapFileToTuffItem(createFile(), {}, 'file-provider', 'File Provider')

    expect(item.actions?.map((action) => action.id)).toEqual([
      'open-file',
      'open-folder',
      'file-copy-path',
      'file-copy-shell-path',
      'file-copy-url'
    ])
    expect(item.actions?.[0]).toMatchObject({
      id: 'open-file',
      primary: true,
      payload: {
        path: '/Users/demo/Documents/report final.txt'
      }
    })
    expect(item.actions?.find((action) => action.id === 'file-copy-path')).toMatchObject({
      type: 'copy',
      payload: {
        text: '/Users/demo/Documents/report final.txt'
      }
    })
    expect(item.actions?.find((action) => action.id === 'file-copy-shell-path')).toMatchObject({
      type: 'copy',
      payload: {
        text: "'/Users/demo/Documents/report final.txt'"
      }
    })
    expect(item.actions?.find((action) => action.id === 'file-copy-url')).toMatchObject({
      type: 'copy',
      payload: {
        text: 'file:///Users/demo/Documents/report%20final.txt'
      }
    })
  })

  it('adds Windows and WSL path conversion actions when applicable', () => {
    const windowsItem = mapFileToTuffItem(
      createFile({
        path: 'C:\\Users\\demo\\Documents\\report.txt',
        name: 'report.txt'
      }),
      {},
      'file-provider',
      'File Provider'
    )
    const wslItem = mapFileToTuffItem(
      createFile({
        path: '/mnt/c/Users/demo/Documents/report.txt',
        name: 'report.txt'
      }),
      {},
      'file-provider',
      'File Provider'
    )

    expect(windowsItem.actions?.find((action) => action.id === 'file-copy-wsl-path')).toMatchObject(
      {
        type: 'copy',
        payload: {
          text: '/mnt/c/Users/demo/Documents/report.txt'
        }
      }
    )
    expect(wslItem.actions?.find((action) => action.id === 'file-copy-windows-path')).toMatchObject(
      {
        type: 'copy',
        payload: {
          text: 'C:\\Users\\demo\\Documents\\report.txt'
        }
      }
    )
  })

  it('preserves the file MIME type for preview consumers', () => {
    const item = mapFileToTuffItem(
      createFile({
        name: 'cover.webp',
        extension: '.webp',
        path: '/Users/demo/Documents/cover.webp'
      }),
      {},
      'file-provider',
      'File Provider'
    )

    expect(item.meta?.file?.mime_type).toBe('image/webp')
  })

  it('serves a generated icon as a tfile URL while its cache metadata matches the file', () => {
    const iconPath = '/cache/file-icons/6f2a4c8e9d0b1a2c3d4e5f60718293a4b5c6d7e8f90a1b2c3.png'
    const file = createFile()
    const onMissingIcon = vi.fn()

    const item = mapFileToTuffItem(
      file,
      {
        icon: iconPath,
        [FILE_ICON_META_EXTENSION_KEY]: JSON.stringify({
          mtime: file.mtime.getTime(),
          size: file.size
        })
      },
      'file-provider',
      'File Provider',
      onMissingIcon
    )

    // The renderer fetches this value, so it has to be a tfile: URL and not the raw cache path.
    expect(item.render.basic?.icon).toEqual({ type: 'url', value: `tfile://${iconPath}` })
    expect(onMissingIcon).not.toHaveBeenCalled()
  })

  it('serves a generated icon that has no metadata to compare against', () => {
    const iconPath = '/cache/file-icons/6f2a4c8e9d0b1a2c3d4e5f60718293a4b5c6d7e8f90a1b2c3.png'
    const onMissingIcon = vi.fn()

    const item = mapFileToTuffItem(
      createFile(),
      { icon: iconPath },
      'file-provider',
      'File Provider',
      onMissingIcon
    )

    expect(item.render.basic?.icon).toEqual({ type: 'url', value: `tfile://${iconPath}` })
    expect(onMissingIcon).not.toHaveBeenCalled()
  })

  it('keeps serving the cached icon and refreshes it in the background when its metadata is stale', () => {
    const iconPath = '/cache/file-icons/6f2a4c8e9d0b1a2c3d4e5f60718293a4b5c6d7e8f90a1b2c3.png'
    const file = createFile({ size: 129 })
    const onMissingIcon = vi.fn()

    const item = mapFileToTuffItem(
      file,
      {
        icon: iconPath,
        [FILE_ICON_META_EXTENSION_KEY]: JSON.stringify({
          mtime: file.mtime.getTime(),
          size: 128
        })
      },
      'file-provider',
      'File Provider',
      onMissingIcon
    )

    // Dropping the stale icon for the duration of the re-extraction is what made a row blink from
    // its native icon to the generic glyph on every touch; the old icon stays on screen while the
    // refresh lands in the database behind it.
    expect(item.render.basic?.icon).toEqual({ type: 'url', value: `tfile://${iconPath}` })
    expect(onMissingIcon).toHaveBeenCalledOnce()
  })

  it('renders a current-version thumbnail as a colorful picture', () => {
    const thumbnailPath = '/cache/file-thumbnails/6f2a4c8e9d0b1a2c3d4e5f60718293a4b5c6d7e8.png'
    const onMissingThumbnail = vi.fn()

    const item = mapFileToTuffItem(
      createFile({ extension: '.png', name: 'cover.png' }),
      {
        thumbnail: thumbnailPath,
        [THUMBNAIL_STATUS_EXTENSION_KEY]: JSON.stringify({
          status: 'generated',
          v: 2,
          at: Date.now()
        })
      },
      'file-provider',
      'File Provider',
      undefined,
      onMissingThumbnail
    )

    // `colorful` keeps the renderer from masking the raster thumbnail as a monochrome template,
    // which would flatten the picture's own alpha and colors into a silhouette.
    expect(item.render.basic?.icon).toEqual({
      type: 'url',
      value: `tfile://${thumbnailPath}`,
      colorful: true
    })
    expect(onMissingThumbnail).not.toHaveBeenCalled()
  })

  it('requests a fresh thumbnail instead of rendering one written by an older encoder', () => {
    const thumbnailPath = '/cache/file-thumbnails/6f2a4c8e9d0b1a2c3d4e5f60718293a4b5c6d7e8.png'
    const onMissingThumbnail = vi.fn()

    const item = mapFileToTuffItem(
      createFile({ extension: '.png', name: 'cover.png' }),
      // Written before the encoder was versioned: the bytes are the opaque-silhouette JPEG the
      // current encoder replaces, so the row must not show them.
      { thumbnail: thumbnailPath },
      'file-provider',
      'File Provider',
      undefined,
      onMissingThumbnail
    )

    expect(item.render.basic?.icon).toEqual({ type: 'class', value: 'i-ri-image-line' })
    expect(onMissingThumbnail).toHaveBeenCalledOnce()
  })

  it('requests a fresh thumbnail instead of a stale-version one', () => {
    const thumbnailPath = '/cache/file-thumbnails/6f2a4c8e9d0b1a2c3d4e5f60718293a4b5c6d7e8.png'
    const onMissingThumbnail = vi.fn()

    const item = mapFileToTuffItem(
      createFile({ extension: '.png', name: 'cover.png' }),
      {
        thumbnail: thumbnailPath,
        [THUMBNAIL_STATUS_EXTENSION_KEY]: JSON.stringify({
          status: 'generated',
          v: 1,
          at: Date.now()
        })
      },
      'file-provider',
      'File Provider',
      undefined,
      onMissingThumbnail
    )

    expect(item.render.basic?.icon).toEqual({ type: 'class', value: 'i-ri-image-line' })
    expect(onMissingThumbnail).toHaveBeenCalledOnce()
  })

  it('serves a directly viewable image as a colorful file so its colors are not masked', () => {
    const imagePath = '/served/cover.png'

    const item = mapFileToTuffItem(
      createFile({ path: imagePath, name: 'cover.png', extension: '.png' }),
      {},
      'file-provider',
      'File Provider'
    )

    expect(item.render.basic?.icon).toEqual({ type: 'file', value: imagePath, colorful: true })
  })
})

describe('file index directory rule', () => {
  /** Entries per folder; any other folder reads as missing. Paths stay clear of system roots. */
  const folders = (entries: Record<string, string[]>) =>
    vi.fn(async (directoryPath: string) => {
      const listed = entries[directoryPath]
      if (!listed) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return listed
    })

  it('treats a build folder as build output only beside a project marker', async () => {
    const readdir = folders({
      '/Users/demo/Workspace/project': ['package.json', 'dist', 'src'],
      '/Users/demo/Documents': ['build', 'notes.md']
    })

    await expect(
      getDirectoryLevelExclusionReason('/Users/demo/Workspace/project/dist', readdir)
    ).resolves.toBe('development-path')
    await expect(
      getDirectoryLevelExclusionReason('/Users/demo/Documents/build', readdir)
    ).resolves.toBe(null)
    // The ancestor walk the watch ingest uses reaches the same verdicts from deeper files.
    await expect(
      getFileTraversalExclusionReason('/Users/demo/Workspace/project/dist/assets/app.js', readdir)
    ).resolves.toBe('development-path')
    await expect(
      getFileTraversalExclusionReason('/Users/demo/Documents/build/2026/report.pdf', readdir)
    ).resolves.toBe(null)
  })

  it('excludes dependency folders by name alone and reads no entries for them', async () => {
    const readdir = folders({})

    await expect(
      getDirectoryLevelExclusionReason('/Users/demo/Workspace/app/node_modules', readdir)
    ).resolves.toBe('development-path')
    expect(readdir).not.toHaveBeenCalled()
  })

  it('keeps the stricter answer when the parent cannot be read', async () => {
    const readdir = folders({})

    await expect(
      getDirectoryLevelExclusionReason('/Users/demo/Documents/build', readdir)
    ).resolves.toBe('development-path')
    expect(readdir).toHaveBeenCalledWith('/Users/demo/Documents')
  })
})
