import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toModelAttachments } from './attachment-payload'

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

function image(url: string, name?: string): AiAttachment {
  return { kind: 'image', id: `att-${url.slice(-6)}`, url, ...(name ? { name } : {}) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('toModelAttachments', () => {
  it('passes an image data URL straight through with its name', async () => {
    expect(await toModelAttachments([image(PNG_DATA_URL, 'shot.png')])).toEqual([
      { type: 'image', dataUrl: PNG_DATA_URL, name: 'shot.png' }
    ])
  })

  it('reads an object URL back into bytes the wire can carry', async () => {
    const bytes = new Uint8Array([1, 2, 3, 250])
    vi.stubGlobal('fetch', async () =>
      Promise.resolve(new Response(new Blob([bytes], { type: 'image/png' })))
    )

    expect(await toModelAttachments([image('blob:app://composer/1')])).toEqual([
      { type: 'image', dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}` }
    ])
  })

  it('drops an object URL whose bytes are gone', async () => {
    // What a conversation restored from history holds: the URL outlived the session that owned it,
    // so there is nothing left to send and the caller has to be told, not thrown at.
    expect(await toModelAttachments([image('blob:app://dead/1')])).toEqual([])
  })

  it('drops attachments that never carried bytes', async () => {
    const file: AiAttachment = { kind: 'file', id: 'f1', name: 'notes.pdf', size: 12 }
    expect(await toModelAttachments([file])).toEqual([])
  })

  it('drops image formats outside the agreed set', async () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zy8+'
    const bmp = 'data:image/bmp;base64,Qk0='
    expect(await toModelAttachments([image(svg), image(bmp)])).toEqual([])
  })

  it('rejects a data URL that only claims to be an image', async () => {
    expect(await toModelAttachments([image('data:text/html;base64,PGh0bWw+')])).toEqual([])
  })

  it('never reaches out to the network for a remote attachment', async () => {
    // An http(s) attachment would make "send my screenshot" perform a silent outbound request.
    const fetched = vi.fn(async () =>
      Promise.resolve(new Response(new Blob([new Uint8Array([1])], { type: 'image/png' })))
    )
    vi.stubGlobal('fetch', fetched)

    expect(await toModelAttachments([image('https://example.com/cat.png')])).toEqual([])
    expect(fetched).not.toHaveBeenCalled()
  })

  it('keeps the readable attachments when one of a batch cannot be read', async () => {
    const result = await toModelAttachments([
      image(PNG_DATA_URL, 'first.png'),
      image('blob:app://dead/2'),
      image('data:image/webp;base64,UklGRg==', 'third.webp')
    ])

    expect(result).toEqual([
      { type: 'image', dataUrl: PNG_DATA_URL, name: 'first.png' },
      { type: 'image', dataUrl: 'data:image/webp;base64,UklGRg==', name: 'third.webp' }
    ])
  })
})
