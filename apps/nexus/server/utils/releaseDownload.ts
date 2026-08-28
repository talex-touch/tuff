import type { H3Event } from 'h3'
import type { AssetArch, AssetPlatform, ReleaseAsset } from './releasesStore'
import { createError, getQuery } from 'h3'
import {
  isUnsignedFallbackAllowed,
  parseReleaseDownloadQuerySignature,
  verifyReleaseDownloadSignature,
} from './releaseDownloadSignature'
import { getReleaseByTag } from './releasesStore'

export interface ResolvedReleaseDownload {
  tag: string
  platform: string
  arch: string
  asset: ReleaseAsset
}

function hasReleaseDownloadSignatureQuery(event: H3Event): boolean {
  const query = getQuery(event)
  return (
    Object.prototype.hasOwnProperty.call(query, 'exp')
    || Object.prototype.hasOwnProperty.call(query, 'sig')
  )
}

export async function resolveReleaseDownload(event: H3Event): Promise<ResolvedReleaseDownload> {
  const { tag, platform, arch } = event.context.params ?? {}

  if (!tag || !platform || !arch)
    throw createError({ statusCode: 400, statusMessage: 'Tag, platform, and arch are required.' })

  const release = await getReleaseByTag(event, tag, true)

  if (!release)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  if (release.status !== 'published')
    throw createError({ statusCode: 403, statusMessage: 'Release is not published.' })

  const asset = release.assets?.find(
    (candidate: ReleaseAsset) =>
      candidate.platform === (platform as AssetPlatform) && candidate.arch === (arch as AssetArch),
  )

  if (!asset)
    throw createError({ statusCode: 404, statusMessage: 'Asset not found for this platform/arch.' })

  const signedQuery = parseReleaseDownloadQuerySignature(event)
  const allowUnsignedFallback = isUnsignedFallbackAllowed(event)
  if (signedQuery) {
    const verification = verifyReleaseDownloadSignature(event, {
      tag,
      platform,
      arch,
      signature: signedQuery,
    })
    // A missing server secret is compatible only while unsigned fallback is explicitly enabled.
    if (
      !verification.valid
      && (verification.reason !== 'missing-secret' || !allowUnsignedFallback)
    ) {
      throw createError({ statusCode: 403, statusMessage: 'Download signature is invalid or expired.' })
    }
  }
  else if (hasReleaseDownloadSignatureQuery(event)) {
    throw createError({ statusCode: 403, statusMessage: 'Download signature is invalid or expired.' })
  }
  else if (!allowUnsignedFallback) {
    throw createError({ statusCode: 403, statusMessage: 'Signed download URL is required.' })
  }

  return { tag, platform, arch, asset }
}
