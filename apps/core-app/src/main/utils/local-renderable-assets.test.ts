import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  normalizeRenderableIcon,
  normalizeRenderableSource,
  normalizeResultFilePath,
  normalizeTuffItemLocalAssets
} from './local-renderable-assets'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-local-assets-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (!root) continue
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('local renderable assets', () => {
  it('normalizes absolute local paths to tfile URLs', () => {
    const root = createTempRoot()
    const filePath = path.join(root, '微信图片 01.png')
    fs.writeFileSync(filePath, 'image')

    const result = normalizeRenderableSource(filePath)

    expect('missing' in result).toBe(false)
    if ('missing' in result) return
    expect(result.value).toMatch(/^tfile:\/\//)
    expect(result.value).toContain('%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87%2001.png')
    expect(result.localPath).toBe(filePath)
  })

  it('normalizes file and tfile URLs when the local file exists', () => {
    const root = createTempRoot()
    const filePath = path.join(root, 'demo.txt')
    fs.writeFileSync(filePath, 'demo')

    const fileUrlResult = normalizeRenderableSource(new URL(`file://${filePath}`).toString())
    const tfileResult = normalizeRenderableSource(`tfile://${filePath}`)

    expect('missing' in fileUrlResult).toBe(false)
    expect('missing' in tfileResult).toBe(false)
    if ('missing' in fileUrlResult || 'missing' in tfileResult) return
    expect(fileUrlResult.value).toBe(tfileResult.value)
    expect(fileUrlResult.value).toMatch(/^tfile:\/\//)
  })

  it('passes data and http URLs through without filesystem checks', () => {
    expect(normalizeRenderableSource('data:image/png;base64,AA==')).toEqual({
      value: 'data:image/png;base64,AA==',
      changed: false
    })
    expect(normalizeRenderableSource('https://example.test/icon.png')).toEqual({
      value: 'https://example.test/icon.png',
      changed: false
    })
  })

  it('marks missing local files without throwing', () => {
    const missingPath = path.join(createTempRoot(), 'missing.png')
    const result = normalizeResultFilePath(missingPath)

    expect(result).toEqual({
      value: null,
      localPath: missingPath,
      missing: true
    })
  })

  it('falls back local icons when their files are missing', () => {
    const missingPath = path.join(createTempRoot(), 'missing.png')
    const result = normalizeRenderableIcon({ type: 'file', value: missingPath }, 'image')

    expect(result.icon).toEqual({ type: 'class', value: 'i-ri-image-line' })
    expect(result.missingLocalPath).toBe(missingPath)
    expect(result.changed).toBe(true)
  })

  it('removes missing preview image URLs from TuffItems', () => {
    const missingPath = path.join(createTempRoot(), 'missing.png')
    const result = normalizeTuffItemLocalAssets({
      id: 'preview',
      source: { id: 'test', type: 'system', name: 'Test' },
      kind: 'image',
      render: {
        mode: 'default',
        basic: {
          title: 'Preview',
          icon: { type: 'file', value: missingPath }
        },
        preview: {
          type: 'panel',
          image: missingPath
        }
      }
    })

    expect(result.item?.render.basic?.icon).toEqual({ type: 'class', value: 'i-ri-image-line' })
    expect(result.item?.render.preview?.image).toBeUndefined()
    expect(result.missingPaths).toEqual([missingPath, missingPath])
  })

  it('drops file results when the primary file path is missing', () => {
    const missingPath = path.join(createTempRoot(), 'missing.txt')
    const result = normalizeTuffItemLocalAssets(
      {
        id: missingPath,
        source: { id: 'file-provider', type: 'file', name: 'File Provider' },
        kind: 'file',
        render: {
          mode: 'default',
          basic: {
            title: 'missing.txt'
          }
        },
        meta: {
          file: {
            path: missingPath
          }
        }
      },
      { dropMissingFile: true }
    )

    expect(result.item).toBeNull()
    expect(result.missingPaths).toEqual([missingPath])
  })
})
