import type { H3Event } from 'h3'
import type { AppRelease, ReleaseAsset } from './releasesStore'
import { createSignedReleaseDownloadPath } from './releaseDownloadSignature'

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
    const signatureUrl = asset.fileKey
      ? `/api/releases/${release.tag}/signature/${asset.platform}/${asset.arch}`
      : undefined
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
