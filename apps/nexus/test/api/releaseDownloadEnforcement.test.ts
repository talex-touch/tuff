import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The download endpoint's signature check, at the level the defect lived (#919).
 *
 * `allowUnsignedFallback` defaults to true (nuxt.config.ts) and every deployment runs that
 * default, so the old `if (!verification.valid && !allowUnsignedFallback)` never threw: an
 * expired or forged signature took the same branch as no signature at all. The signed URLs
 * are real — /api/releases and /api/releases/[tag] mint them via attachSignatureUrls — so the
 * control existed end to end and simply never rejected anything.
 *
 * These run the handler with the fallback ON, which is the configuration that matters. With
 * it OFF the old code already rejected, so a test there proves nothing about the bug.
 */

const REDIRECTED = Symbol('redirected')

const parseReleaseDownloadQuerySignature = vi.fn()
const isUnsignedFallbackAllowed = vi.fn()
const verifyReleaseDownloadSignature = vi.fn()
const incrementDownloadCount = vi.fn(async () => {})

vi.mock('../../server/utils/releaseDownloadSignature', () => ({
  parseReleaseDownloadQuerySignature,
  isUnsignedFallbackAllowed,
  verifyReleaseDownloadSignature,
}))

vi.mock('../../server/utils/releasesStore', () => ({
  getReleaseByTag: vi.fn(async () => ({
    tag: 'v2.5.0',
    status: 'published',
    assets: [
      {
        id: 'asset-id',
        platform: 'darwin',
        arch: 'arm64',
        filename: 'Tuff-2.5.0-arm64.dmg',
        contentType: 'application/octet-stream',
        fileKey: null,
        downloadUrl: 'https://cdn.example.com/Tuff-2.5.0-arm64.dmg',
      },
    ],
  })),
  incrementDownloadCount,
}))

vi.mock('../../server/utils/releaseAssetStorage', () => ({
  requireReleaseAsset: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    // The asset above has no fileKey and an absolute downloadUrl, so a served request ends in
    // sendRedirect. Stubbed because the real one wants a node response object.
    sendRedirect: vi.fn(() => REDIRECTED),
    send: vi.fn(() => REDIRECTED),
    setResponseHeader: vi.fn(),
  }
})

// defineEventHandler is a Nitro auto-import, i.e. a global — not something `vi.mock` can
// reach. Stubbing it to the identity hands the test the raw handler function.
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)

type Handler = (event: unknown) => Promise<unknown>

async function loadHandler(): Promise<Handler> {
  const mod = await import('../../server/api/releases/[tag]/download/[platform]/[arch].get')
  return mod.default as unknown as Handler
}

function event() {
  return { context: { params: { tag: 'v2.5.0', platform: 'darwin', arch: 'arm64' } } }
}

/** Reads the statusCode off whatever the handler threw. */
async function statusOf(run: Promise<unknown>): Promise<number | undefined> {
  try {
    await run
    return undefined
  }
  catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
}

describe('release download signature enforcement, with the unsigned fallback ON', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isUnsignedFallbackAllowed.mockReturnValue(true)
  })

  it('rejects a signature that is present but invalid', async () => {
    // The regression. Before the fix this returned the file: an attacker-supplied `sig` was
    // treated as equivalent to sending no `sig` at all.
    parseReleaseDownloadQuerySignature.mockReturnValue({ exp: 1_700_000_000, sig: 'f'.repeat(64) })
    verifyReleaseDownloadSignature.mockReturnValue({ valid: false, reason: 'mismatch' })

    const handler = await loadHandler()
    expect(await statusOf(handler(event()))).toBe(403)
    expect(incrementDownloadCount).not.toHaveBeenCalled()
  })

  it('rejects a signature that has expired', async () => {
    // An expired link is the case a signed URL exists to express at all. Accepting it made
    // the expiry decorative.
    parseReleaseDownloadQuerySignature.mockReturnValue({ exp: 1, sig: 'a'.repeat(64) })
    verifyReleaseDownloadSignature.mockReturnValue({ valid: false, reason: 'expired' })

    const handler = await loadHandler()
    expect(await statusOf(handler(event()))).toBe(403)
  })

  it('serves a valid signature', async () => {
    parseReleaseDownloadQuerySignature.mockReturnValue({ exp: 4_000_000_000, sig: 'b'.repeat(64) })
    verifyReleaseDownloadSignature.mockReturnValue({ valid: true })

    const handler = await loadHandler()
    expect(await handler(event())).toBe(REDIRECTED)
  })

  it('still serves a request that carries no signature', async () => {
    // The fallback's actual purpose, and the reason this fix does not just flip the default:
    // clients using the documented fallbackDownloadUrl must keep working.
    parseReleaseDownloadQuerySignature.mockReturnValue(null)

    const handler = await loadHandler()
    expect(await handler(event())).toBe(REDIRECTED)
    expect(verifyReleaseDownloadSignature).not.toHaveBeenCalled()
  })

  it('still serves when the server has no secret to judge the signature with', async () => {
    // 'missing-secret' is the server admitting it cannot evaluate the signature. Failing it
    // closed would 403 a stale signed bookmark on an unconfigured deployment, which is a
    // misconfiguration to report rather than an attack to block.
    parseReleaseDownloadQuerySignature.mockReturnValue({ exp: 4_000_000_000, sig: 'c'.repeat(64) })
    verifyReleaseDownloadSignature.mockReturnValue({ valid: false, reason: 'missing-secret' })

    const handler = await loadHandler()
    expect(await handler(event())).toBe(REDIRECTED)
  })
})

describe('release download signature enforcement, with the unsigned fallback OFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isUnsignedFallbackAllowed.mockReturnValue(false)
  })

  it('rejects a request with no signature', async () => {
    parseReleaseDownloadQuerySignature.mockReturnValue(null)

    const handler = await loadHandler()
    expect(await statusOf(handler(event()))).toBe(403)
  })
})
