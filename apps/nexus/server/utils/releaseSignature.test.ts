import { describe, expect, it, vi } from 'vitest'
import type { AppRelease } from './releasesStore'
import { attachSignatureUrls } from './releaseSignature'

vi.mock('./releaseDownloadSignature', () => ({
  createSignedReleaseDownloadPath: vi.fn(() => null),
}))

function release(signatureUrl: string | null): AppRelease {
  return {
    id: 'release-id',
    tag: 'v2.5.0',
    name: 'Tuff v2.5.0',
    channel: 'RELEASE',
    version: '2.5.0',
    notes: { zh: '发布', en: 'Release' },
    status: 'published',
    publishedAt: '2026-06-21T00:00:00.000Z',
    minAppVersion: null,
    isCritical: false,
    createdBy: 'release-admin',
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    assets: [
      {
        id: 'asset-id',
        releaseId: 'release-id',
        platform: 'darwin',
        arch: 'arm64',
        filename: 'Tuff-2.5.0-arm64.dmg',
        sourceType: 'upload',
        fileKey: 'releases/v2.5.0/darwin-arm64/Tuff-2.5.0-arm64.dmg',
        signatureKey: signatureUrl ? 'releases/v2.5.0/darwin-arm64/Tuff-2.5.0-arm64.dmg.sig' : null,
        signatureUrl,
        downloadUrl: '/api/releases/v2.5.0/download/darwin/arm64',
        size: 42,
        sha256: 'a'.repeat(64),
        contentType: 'application/octet-stream',
        downloadCount: 0,
        createdAt: '2026-06-21T00:00:00.000Z',
        updatedAt: '2026-06-21T00:00:00.000Z',
      },
    ],
  }
}

describe('release signature matrix', () => {
  it('does not publish a signatureUrl when no artifact signature is recorded', () => {
    const result = attachSignatureUrls(release(null))

    expect(result.assets?.[0]?.signatureUrl).toBeUndefined()
  })

  it('keeps Nexus metadata pointed at the recorded signature endpoint', () => {
    const signatureUrl = '/api/releases/v2.5.0/signature/darwin/arm64'
    const result = attachSignatureUrls(release(signatureUrl))

    expect(result.assets?.[0]).toMatchObject({
      downloadUrl: '/api/releases/v2.5.0/download/darwin/arm64',
      signatureUrl,
      sha256: 'a'.repeat(64),
    })
  })

  it('keeps linked GitHub signature URLs in the Nexus release matrix', () => {
    const signatureUrl = 'https://github.com/talex-touch/tuff/releases/download/v2.5.0/Tuff-2.5.0-arm64.dmg.sig'
    const result = attachSignatureUrls(release(signatureUrl))

    expect(result.assets?.[0]?.signatureUrl).toBe(signatureUrl)
  })
})
