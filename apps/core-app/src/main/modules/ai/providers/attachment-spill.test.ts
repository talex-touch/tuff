import type { IntelligenceMessageAttachment } from '@talex-touch/tuff-intelligence'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectMessageAttachments, spillAttachments } from './attachment-spill'

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function attachment(dataUrl: string, name?: string): IntelligenceMessageAttachment {
  return { type: 'image', dataUrl, ...(name ? { name } : {}) }
}

function pngAttachment(name?: string): IntelligenceMessageAttachment {
  return attachment(`data:image/png;base64,${PNG_BYTES.toString('base64')}`, name)
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

describe('spillAttachments', () => {
  it('writes the decoded bytes to a private temporary file', async () => {
    const spill = await spillAttachments([pngAttachment('shot.png')])

    try {
      expect(spill.paths).toHaveLength(1)
      const path = spill.paths[0]!
      expect(await readFile(path)).toEqual(PNG_BYTES)
      // The temp directory is world-readable, and these bytes came off the user's clipboard.
      expect((await stat(path)).mode & 0o777).toBe(0o600)
    } finally {
      await spill.cleanup()
    }
  })

  it('derives the extension from the verified MIME type, not the supplied name', async () => {
    const spill = await spillAttachments([
      pngAttachment('payload.sh'),
      attachment('data:image/jpeg;base64,/9j/4AAQ='),
      attachment('data:image/webp;base64,UklGRg=='),
      attachment('data:image/gif;base64,R0lGODlhAQABAA==')
    ])

    try {
      expect(spill.paths.map((path) => extname(path))).toEqual(['.png', '.jpg', '.webp', '.gif'])
    } finally {
      await spill.cleanup()
    }
  })

  it('keeps the readable attachments when one of the batch is malformed', async () => {
    const spill = await spillAttachments([
      attachment('data:image/svg+xml;base64,PHN2Zy8+'),
      attachment('https://example.com/cat.png'),
      attachment('data:image/png;base64,'),
      pngAttachment('good.png')
    ])

    try {
      expect(spill.paths).toHaveLength(1)
      expect(await readFile(spill.paths[0]!)).toEqual(PNG_BYTES)
    } finally {
      await spill.cleanup()
    }
  })

  it('skips an attachment past the per-attachment size ceiling', async () => {
    // Base64 spends 4 characters per 3 bytes, so this decodes to ~11MB — past the 10MB ceiling.
    const oversized = 'A'.repeat(4 * Math.ceil((11 * 1024 * 1024) / 3))
    const spill = await spillAttachments([
      attachment(`data:image/png;base64,${oversized}`),
      pngAttachment('good.png')
    ])

    try {
      expect(spill.paths).toHaveLength(1)
      expect(await readFile(spill.paths[0]!)).toEqual(PNG_BYTES)
    } finally {
      await spill.cleanup()
    }
  })

  it('removes every file it wrote, and tolerates a second cleanup', async () => {
    const spill = await spillAttachments([pngAttachment(), pngAttachment()])
    const written = [...spill.paths]
    expect(written).toHaveLength(2)

    await spill.cleanup()
    expect(await Promise.all(written.map(exists))).toEqual([false, false])

    await expect(spill.cleanup()).resolves.toBeUndefined()
  })

  it('spills nothing when the turn carried nothing', async () => {
    expect((await spillAttachments([])).paths).toEqual([])
  })
})

describe('collectMessageAttachments', () => {
  it('reads attachments off the messages that carry them, in order', () => {
    const first = pngAttachment('a.png')
    const second = pngAttachment('b.png')

    expect(
      collectMessageAttachments([
        { role: 'system', content: 'rules' },
        { role: 'user', content: 'older turn' },
        { role: 'assistant', content: 'answer' },
        { role: 'user', content: 'look', attachments: [first, second] }
      ])
    ).toEqual([first, second])
  })

  it('returns nothing for a plain text conversation', () => {
    expect(collectMessageAttachments([{ role: 'user', content: 'hi' }])).toEqual([])
  })
})
