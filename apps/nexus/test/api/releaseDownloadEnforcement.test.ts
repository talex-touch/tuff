import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Download signature enforcement and method-specific delivery behavior.
 *
 * `allowUnsignedFallback` defaults to true in deployed Nexus environments. A supplied but
 * invalid signature must still fail, while a request with no signature may use the explicit
 * fallback path. GET and HEAD import the same resolver so this security contract cannot drift.
 */

const REDIRECTED = Symbol('redirected')

const signatureMocks = vi.hoisted(() => ({
  parseReleaseDownloadQuerySignature: vi.fn(),
  isUnsignedFallbackAllowed: vi.fn(),
  verifyReleaseDownloadSignature: vi.fn(),
}))

const releasesStoreMocks = vi.hoisted(() => ({
  getReleaseByTag: vi.fn(),
  incrementDownloadCount: vi.fn(async () => {}),
}))

const releaseAssetMocks = vi.hoisted(() => ({
  requireReleaseAsset: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
  sendRedirect: vi.fn(),
  send: vi.fn(),
  setResponseHeader: vi.fn(),
}))

vi.mock('../../server/utils/releaseDownloadSignature', () => signatureMocks)
vi.mock('../../server/utils/releasesStore', () => releasesStoreMocks)
vi.mock('../../server/utils/releaseAssetStorage', () => releaseAssetMocks)
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
    sendRedirect: h3Mocks.sendRedirect,
    send: h3Mocks.send,
    setResponseHeader: h3Mocks.setResponseHeader,
  }
})

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)

type Handler = (event: ReturnType<typeof makeEvent>) => Promise<unknown>

async function loadGetHandler(): Promise<Handler> {
  const mod = await import('../../server/api/releases/[tag]/download/[platform]/[arch].get')
  return mod.default as unknown as Handler
}

async function loadHeadHandler(): Promise<Handler> {
  const mod = await import('../../server/api/releases/[tag]/download/[platform]/[arch].head')
  return mod.default as unknown as Handler
}

function makeEvent() {
  return { context: { params: { tag: 'v2.5.0', platform: 'darwin', arch: 'arm64' } } }
}

function makeRelease(assetOverrides: Record<string, unknown> = {}) {
  return {
    tag: 'v2.5.0',
    status: 'published',
    assets: [
      {
        id: 'asset-id',
        platform: 'darwin',
        arch: 'arm64',
        filename: 'Tuff-2.5.0-arm64.dmg',
        contentType: 'application/octet-stream',
        size: 510_237_046,
        fileKey: null,
        downloadUrl: 'https://cdn.example.com/Tuff-2.5.0-arm64.dmg',
        ...assetOverrides,
      },
    ],
  }
}

async function statusOf(run: Promise<unknown>): Promise<number | undefined> {
  try {
    await run
    return undefined
  }
  catch (error) {
    return (error as { statusCode?: number }).statusCode
  }
}

function useValidSignature() {
  signatureMocks.parseReleaseDownloadQuerySignature.mockReturnValue({
    exp: 4_000_000_000,
    sig: 'b'.repeat(64),
  })
  signatureMocks.verifyReleaseDownloadSignature.mockReturnValue({ valid: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  signatureMocks.isUnsignedFallbackAllowed.mockReturnValue(true)
  signatureMocks.parseReleaseDownloadQuerySignature.mockReturnValue(null)
  h3Mocks.getQuery.mockReturnValue({})
  releasesStoreMocks.getReleaseByTag.mockResolvedValue(makeRelease())
  releaseAssetMocks.requireReleaseAsset.mockResolvedValue({
    data: Buffer.from([1, 2, 3]),
    contentType: 'application/octet-stream',
  })
  h3Mocks.sendRedirect.mockReturnValue(REDIRECTED)
  h3Mocks.send.mockImplementation((_event, body) => body)
})

describe('GET release download', () => {
  it('rejects a supplied signature that is invalid while unsigned fallback is enabled', async () => {
    signatureMocks.parseReleaseDownloadQuerySignature.mockReturnValue({
      exp: 1_700_000_000,
      sig: 'f'.repeat(64),
    })
    signatureMocks.verifyReleaseDownloadSignature.mockReturnValue({ valid: false, reason: 'mismatch' })

    const handler = await loadGetHandler()
    expect(await statusOf(handler(makeEvent()))).toBe(403)
    expect(releasesStoreMocks.incrementDownloadCount).not.toHaveBeenCalled()
  })

  it('rejects an expired signature while unsigned fallback is enabled', async () => {
    signatureMocks.parseReleaseDownloadQuerySignature.mockReturnValue({ exp: 1, sig: 'a'.repeat(64) })
    signatureMocks.verifyReleaseDownloadSignature.mockReturnValue({ valid: false, reason: 'expired' })

    const handler = await loadGetHandler()
    expect(await statusOf(handler(makeEvent()))).toBe(403)
  })

  it('increments the count and redirects a linked asset', async () => {
    useValidSignature()

    const handler = await loadGetHandler()
    await expect(handler(makeEvent())).resolves.toBe(REDIRECTED)

    expect(releasesStoreMocks.incrementDownloadCount).toHaveBeenCalledWith(expect.anything(), 'asset-id')
    expect(h3Mocks.sendRedirect).toHaveBeenCalledWith(
      expect.anything(),
      'https://cdn.example.com/Tuff-2.5.0-arm64.dmg',
      302,
    )
    expect(releaseAssetMocks.requireReleaseAsset).not.toHaveBeenCalled()
  })

  it('increments the count and sends the stored asset body', async () => {
    useValidSignature()
    releasesStoreMocks.getReleaseByTag.mockResolvedValueOnce(makeRelease({
      fileKey: 'releases/v2.5.0/darwin-arm64/Tuff-2.5.0-arm64.dmg',
      downloadUrl: '/api/releases/v2.5.0/download/darwin/arm64',
      size: 999,
    }))
    const body = Buffer.from([1, 2, 3])
    releaseAssetMocks.requireReleaseAsset.mockResolvedValueOnce({
      data: body,
      contentType: 'application/octet-stream',
    })

    const handler = await loadGetHandler()
    await expect(handler(makeEvent())).resolves.toEqual(body)

    expect(releasesStoreMocks.incrementDownloadCount).toHaveBeenCalledWith(expect.anything(), 'asset-id')
    expect(releaseAssetMocks.requireReleaseAsset).toHaveBeenCalledOnce()
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(expect.anything(), 'Content-Length', 3)
  })

  it('still serves an unsigned fallback request', async () => {
    const handler = await loadGetHandler()
    await expect(handler(makeEvent())).resolves.toBe(REDIRECTED)
    expect(signatureMocks.verifyReleaseDownloadSignature).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing sig', { exp: '4000000000' }],
    ['a malformed sig', { exp: '4000000000', sig: 'not-a-signature' }],
  ])('rejects an attempted signature with %s instead of treating it as unsigned', async (_name, query) => {
    h3Mocks.getQuery.mockReturnValue(query)

    const handler = await loadGetHandler()
    expect(await statusOf(handler(makeEvent()))).toBe(403)
    expect(releasesStoreMocks.incrementDownloadCount).not.toHaveBeenCalled()
  })

  it('still serves when the server has no secret to judge a supplied signature', async () => {
    signatureMocks.parseReleaseDownloadQuerySignature.mockReturnValue({
      exp: 4_000_000_000,
      sig: 'c'.repeat(64),
    })
    signatureMocks.verifyReleaseDownloadSignature.mockReturnValue({
      valid: false,
      reason: 'missing-secret',
    })

    const handler = await loadGetHandler()
    await expect(handler(makeEvent())).resolves.toBe(REDIRECTED)
  })
})

describe('HEAD release download', () => {
  it('rejects a supplied signature that is invalid while unsigned fallback is enabled', async () => {
    signatureMocks.parseReleaseDownloadQuerySignature.mockReturnValue({
      exp: 1_700_000_000,
      sig: 'f'.repeat(64),
    })
    signatureMocks.verifyReleaseDownloadSignature.mockReturnValue({ valid: false, reason: 'mismatch' })

    const handler = await loadHeadHandler()
    expect(await statusOf(handler(makeEvent()))).toBe(403)
    expect(releasesStoreMocks.incrementDownloadCount).not.toHaveBeenCalled()
    expect(releaseAssetMocks.requireReleaseAsset).not.toHaveBeenCalled()
  })

  it('rejects an expired signature while unsigned fallback is enabled', async () => {
    signatureMocks.parseReleaseDownloadQuerySignature.mockReturnValue({ exp: 1, sig: 'a'.repeat(64) })
    signatureMocks.verifyReleaseDownloadSignature.mockReturnValue({ valid: false, reason: 'expired' })

    const handler = await loadHeadHandler()
    expect(await statusOf(handler(makeEvent()))).toBe(403)
  })

  it('redirects a linked asset without counting or reading storage', async () => {
    useValidSignature()

    const handler = await loadHeadHandler()
    await expect(handler(makeEvent())).resolves.toBe(REDIRECTED)

    expect(h3Mocks.sendRedirect).toHaveBeenCalledWith(
      expect.anything(),
      'https://cdn.example.com/Tuff-2.5.0-arm64.dmg',
      302,
    )
    expect(releasesStoreMocks.incrementDownloadCount).not.toHaveBeenCalled()
    expect(releaseAssetMocks.requireReleaseAsset).not.toHaveBeenCalled()
  })

  it('returns stored asset metadata with no body, count, or storage read', async () => {
    useValidSignature()
    releasesStoreMocks.getReleaseByTag.mockResolvedValueOnce(makeRelease({
      fileKey: 'releases/v2.5.0/darwin-arm64/Tuff-2.5.0-arm64.dmg',
      downloadUrl: '/api/releases/v2.5.0/download/darwin/arm64',
      contentType: 'application/x-apple-diskimage',
      size: 510_237_046,
    }))

    const handler = await loadHeadHandler()
    await expect(handler(makeEvent())).resolves.toBeUndefined()

    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      'Content-Type',
      'application/x-apple-diskimage',
    )
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      'Content-Length',
      510_237_046,
    )
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      'Cache-Control',
      'public, max-age=3600',
    )
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      expect.anything(),
      'Content-Disposition',
      'attachment; filename="Tuff-2.5.0-arm64.dmg"',
    )
    expect(h3Mocks.send).not.toHaveBeenCalled()
    expect(h3Mocks.sendRedirect).not.toHaveBeenCalled()
    expect(releasesStoreMocks.incrementDownloadCount).not.toHaveBeenCalled()
    expect(releaseAssetMocks.requireReleaseAsset).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing exp', { sig: 'b'.repeat(64) }],
    ['a malformed exp', { exp: 'invalid', sig: 'b'.repeat(64) }],
  ])('rejects an attempted signature with %s instead of treating it as unsigned', async (_name, query) => {
    h3Mocks.getQuery.mockReturnValue(query)

    const handler = await loadHeadHandler()
    expect(await statusOf(handler(makeEvent()))).toBe(403)
    expect(releasesStoreMocks.incrementDownloadCount).not.toHaveBeenCalled()
    expect(releaseAssetMocks.requireReleaseAsset).not.toHaveBeenCalled()
  })
})

describe('release download with unsigned fallback disabled', () => {
  beforeEach(() => {
    signatureMocks.isUnsignedFallbackAllowed.mockReturnValue(false)
  })

  it('rejects GET when the required signature is missing', async () => {
    const handler = await loadGetHandler()
    expect(await statusOf(handler(makeEvent()))).toBe(403)
  })

  it('rejects GET when a signature cannot be verified because the server secret is missing', async () => {
    signatureMocks.parseReleaseDownloadQuerySignature.mockReturnValue({
      exp: 4_000_000_000,
      sig: 'c'.repeat(64),
    })
    signatureMocks.verifyReleaseDownloadSignature.mockReturnValue({
      valid: false,
      reason: 'missing-secret',
    })

    const handler = await loadGetHandler()
    expect(await statusOf(handler(makeEvent()))).toBe(403)
    expect(releasesStoreMocks.incrementDownloadCount).not.toHaveBeenCalled()
  })

  it('rejects HEAD when the required signature is missing', async () => {
    const handler = await loadHeadHandler()
    expect(await statusOf(handler(makeEvent()))).toBe(403)
    expect(releasesStoreMocks.incrementDownloadCount).not.toHaveBeenCalled()
    expect(releaseAssetMocks.requireReleaseAsset).not.toHaveBeenCalled()
  })

  it('rejects HEAD when a signature cannot be verified because the server secret is missing', async () => {
    signatureMocks.parseReleaseDownloadQuerySignature.mockReturnValue({
      exp: 4_000_000_000,
      sig: 'c'.repeat(64),
    })
    signatureMocks.verifyReleaseDownloadSignature.mockReturnValue({
      valid: false,
      reason: 'missing-secret',
    })

    const handler = await loadHeadHandler()
    expect(await statusOf(handler(makeEvent()))).toBe(403)
    expect(releasesStoreMocks.incrementDownloadCount).not.toHaveBeenCalled()
    expect(releaseAssetMocks.requireReleaseAsset).not.toHaveBeenCalled()
  })
})
