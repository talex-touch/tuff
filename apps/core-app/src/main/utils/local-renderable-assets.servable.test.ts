import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeRenderableIcon, normalizeTuffItemLocalAssets } from './local-renderable-assets'

/**
 * A local image the tfile handler refuses must not reach the renderer as a URL.
 *
 * The handler serves an allowlist (#914): on macOS nothing under the user's home except
 * ~/Applications. A screenshot under ~/Pictures handed over as `{ type: 'file', value: path }`
 * turned into a `tfile:` request that got a 403, and the row showed TxIcon's "image failed"
 * placeholder — a grey square where the file's icon belonged. The policy answer is taken here so
 * the row falls back to its kind's glyph before the request exists.
 */

vi.mock('./local-file-policy', () => ({
  isServableLocalFilePath: (filePath: string) => filePath.includes(`${path.sep}served${path.sep}`)
}))

const tempDirs: string[] = []

function writeTempImage(subdir: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'renderable-assets-'))
  tempDirs.push(dir)
  const target = path.join(dir, subdir)
  fs.mkdirSync(target, { recursive: true })
  const file = path.join(target, 'shot.png')
  fs.writeFileSync(file, 'png')
  return file
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('normalizeRenderableIcon servability', () => {
  it('falls back to the glyph for an existing image the protocol would refuse', () => {
    const blocked = writeTempImage('blocked')

    expect(normalizeRenderableIcon({ type: 'file', value: blocked }, 'image')).toEqual({
      icon: { type: 'class', value: 'i-ri-image-line' },
      changed: true
    })
  })

  it('still hands over an image the protocol serves', () => {
    const served = writeTempImage('served')

    const result = normalizeRenderableIcon({ type: 'file', value: served }, 'image')

    expect(result.icon?.type).toBe('url')
    expect(result.icon?.value.startsWith('tfile://')).toBe(true)
  })

  it('applies the same rule to a whole item', () => {
    const blocked = writeTempImage('blocked')
    const item = {
      id: blocked,
      kind: 'file',
      source: { type: 'file', id: 'macos-spotlight-provider', name: 'Spotlight' },
      render: {
        mode: 'default',
        basic: { title: 'shot.png', icon: { type: 'file', value: blocked } }
      },
      meta: { file: { path: blocked } }
    } as never

    const normalized = normalizeTuffItemLocalAssets(item, { fallbackKind: 'file' })

    expect(normalized.item?.render.basic?.icon).toEqual({ type: 'class', value: 'i-ri-file-line' })
  })
})
