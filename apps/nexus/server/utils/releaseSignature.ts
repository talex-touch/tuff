import type { AppRelease, ReleaseAsset } from './releasesStore'

export function attachSignatureUrls(release: AppRelease): AppRelease {
  if (!release.assets || release.assets.length === 0) {
    return release
  }

  const assets = release.assets.map((asset) => {
    const signatureUrl = asset.fileKey
      ? `/api/releases/${release.tag}/signature/${asset.platform}/${asset.arch}`
      : undefined
    return {
      ...(asset as ReleaseAsset),
      signatureUrl,
    }
  })

  return {
    ...release,
    assets,
  }
}
