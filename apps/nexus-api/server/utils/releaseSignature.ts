import type { H3Event } from 'h3'
import type { AppRelease, ReleaseAsset } from './releasesStore'
import { createSignedReleaseDownloadPath } from './releaseDownloadSignature'

export const RELEASE_METADATA_EDGE_TTL_SECONDS = 60

function readSignedUrlExpiry(url: string | null | undefined): string | null {
  try {
    return new URL(url ?? '', 'https://signed.invalid').searchParams.get('exp')
  }
  catch {
    return null
  }
}

export function getReleaseMetadataEdgeTtlSeconds(
  releases: AppRelease | AppRelease[] | null | undefined,
): number {
  let seconds = RELEASE_METADATA_EDGE_TTL_SECONDS
  const now = Math.floor(Date.now() / 1000)
  const entries = Array.isArray(releases) ? releases : [releases]
  for (const release of entries) {
    for (const asset of release?.assets ?? []) {
      const exp = Number(readSignedUrlExpiry(asset.downloadUrl))
      if (Number.isFinite(exp) && exp > 0)
        seconds = Math.min(seconds, Math.floor((exp - now) / 10))
    }
  }
  return seconds
}

export function attachSignatureUrls(release: AppRelease, event?: H3Event): AppRelease {
  if (!release.assets || release.assets.length === 0) {
    return release
  }

  const assets = release.assets.map((asset) => {
    const signedDownloadUrl = event
      ? createSignedReleaseDownloadPath(event, {
          tag: release.tag,
          platform: asset.platform,
          arch: asset.arch
        })
      : null
    const signatureUrl = asset.signatureUrl ?? undefined
    return {
      ...(asset as ReleaseAsset),
      downloadUrl: signedDownloadUrl || asset.downloadUrl,
      fallbackDownloadUrl: asset.downloadUrl,
      signatureUrl,
    }
  })

  return {
    ...release,
    assets,
  }
}
