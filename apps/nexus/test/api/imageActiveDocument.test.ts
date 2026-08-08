import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SVG served from the app origin (#896).
 *
 * `plugin:publish` is not admin-only, so any registered user could upload a plugin icon.
 * The default allow-list accepted `svg`, and /api/images/[key] echoed the stored content type
 * with no `nosniff` and no disposition — so opening the URL as a top-level document ran the
 * publisher's script same-origin against the visitor's dashboard session.
 */

// vi.hoisted: the vi.mock factory below is hoisted above ordinary top-level declarations.
const { getImage } = vi.hoisted(() => ({ getImage: vi.fn() }))

vi.mock('../../server/utils/imageStorage', async () => {
  const actual = await vi.importActual<typeof import('../../server/utils/imageStorage')>(
    '../../server/utils/imageStorage',
  )
  return { ...actual, getImage }
})

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)

type Handler = (event: unknown) => Promise<unknown>

function createEvent(key: string) {
  const headers: Record<string, string> = {}
  return {
    headers,
    event: {
      context: { params: { key } },
      node: { res: { setHeader: (name: string, value: string) => { headers[name] = String(value) } } },
    },
  }
}

async function load(): Promise<Handler> {
  const mod = await import('../../server/api/images/[key].get')
  return mod.default as unknown as Handler
}

describe('image responses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('never serves an svg as an active document', async () => {
    // The regression. Content-Type used to be echoed verbatim.
    getImage.mockResolvedValue({ data: Buffer.from('<svg/>'), contentType: 'image/svg+xml' })
    const { event, headers } = createEvent('abc123')
    await (await load())(event)

    expect(headers['Content-Type']).toBe('application/octet-stream')
    expect(headers['Content-Disposition']).toMatch(/^attachment;/)
  })

  it.each(['text/html', 'application/xhtml+xml', 'application/xml'])(
    'neutralises %s too',
    async (contentType) => {
      // Anything a browser will render as a document, not just svg — the stored type is
      // whatever the uploader's client claimed.
      getImage.mockResolvedValue({ data: Buffer.from('x'), contentType })
      const { event, headers } = createEvent('abc123')
      await (await load())(event)

      expect(headers['Content-Type']).toBe('application/octet-stream')
    },
  )

  it('sets nosniff on every response', async () => {
    // Without it a browser may execute what it guesses rather than what is declared, which
    // is the same failure by another route.
    getImage.mockResolvedValue({ data: Buffer.from('x'), contentType: 'image/png' })
    const { event, headers } = createEvent('abc123')
    await (await load())(event)

    expect(headers['X-Content-Type-Options']).toBe('nosniff')
  })

  it('still serves a raster image inline', async () => {
    // Positive control: forcing attachment on everything would satisfy the assertions above
    // while breaking every plugin icon on the site.
    getImage.mockResolvedValue({ data: Buffer.from('x'), contentType: 'image/png' })
    const { event, headers } = createEvent('abc123')
    await (await load())(event)

    expect(headers['Content-Type']).toBe('image/png')
    expect(headers['Content-Disposition']).toBeUndefined()
  })
})

describe('image upload allow-list', () => {
  // IMAGE_ALLOWED_EXTENSIONS and the mime map are module-private, so the list is read from
  // source. Uploading through the real path needs a database and a storage binding.
  const source = readFileSync(
    fileURLToPath(new URL('../../server/utils/imageStorage.ts', import.meta.url)),
    'utf8',
  )

  function extensionList(): string {
    const start = source.indexOf('const IMAGE_ALLOWED_EXTENSIONS = [')
    expect(start, 'extension list not found — this guard is reading the wrong file').toBeGreaterThan(-1)
    const end = source.indexOf(']', start)
    return source.slice(start, end)
  }

  it('no longer offers svg as an accepted extension', () => {
    expect(extensionList()).not.toContain("'svg'")
  })

  it('still offers the raster formats, so icons keep working', () => {
    // Positive control: an empty list would satisfy the assertion above and reject every
    // upload.
    for (const extension of ["'png'", "'jpg'", "'webp'", "'gif'"])
      expect(extensionList(), extension).toContain(extension)
  })

  it('no longer maps a content type to svg', () => {
    expect(source).not.toContain("'image/svg+xml':")
  })
})
