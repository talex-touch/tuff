import { describe, expect, it } from 'vitest'
import { mapFileToTuffItem } from './utils'

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
})
