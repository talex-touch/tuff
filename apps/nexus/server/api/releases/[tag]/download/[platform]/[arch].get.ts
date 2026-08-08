import type { AssetArch, AssetPlatform, ReleaseAsset } from '../../../../../utils/releasesStore'
import { Buffer } from 'node:buffer'
import { createError, send, sendRedirect, setResponseHeader } from 'h3'
import {
  isUnsignedFallbackAllowed,
  parseReleaseDownloadQuerySignature,
  verifyReleaseDownloadSignature,
} from '../../../../../utils/releaseDownloadSignature'
import { requireReleaseAsset } from '../../../../../utils/releaseAssetStorage'
import { getReleaseByTag, incrementDownloadCount } from '../../../../../utils/releasesStore'

export default defineEventHandler(async (event) => {
  const { tag, platform, arch } = event.context.params ?? {}

  if (!tag || !platform || !arch)
    throw createError({ statusCode: 400, statusMessage: 'Tag, platform, and arch are required.' })

  const release = await getReleaseByTag(event, tag, true)

  if (!release)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  if (release.status !== 'published')
    throw createError({ statusCode: 403, statusMessage: 'Release is not published.' })

  const asset = release.assets?.find(
    (a: ReleaseAsset) => a.platform === (platform as AssetPlatform) && a.arch === (arch as AssetArch),
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
    // A signature the server can actually evaluate is always enforced. allowUnsignedFallback
    // governs whether a request may arrive *without* a signature — it is not permission to
    // present a broken one. Treating the two the same made an expired or forged sig
    // indistinguishable from no sig at all, so under the default config (fallback on, which
    // is what every deployment runs) the signed-URL control rejected nothing at all (#919).
    // Clients that cannot sign still have the documented unsigned path: attachSignatureUrls
    // returns fallbackDownloadUrl alongside the signed downloadUrl.
    //
    // 'missing-secret' is excluded deliberately: that is the server saying it cannot judge
    // the signature, not that the signature is bad. Failing those closed would 403 a stale
    // signed bookmark on a deployment that has no signing secret configured, which is a
    // misconfiguration to report, not an attack to block.
    if (!verification.valid && verification.reason !== 'missing-secret') {
      throw createError({ statusCode: 403, statusMessage: 'Download signature is invalid or expired.' })
    }
  } else if (!allowUnsignedFallback) {
    throw createError({ statusCode: 403, statusMessage: 'Signed download URL is required.' })
  }

  // Increment download count
  await incrementDownloadCount(event, asset.id)

  if (!asset.fileKey) {
    if (asset.downloadUrl.startsWith('https://') || asset.downloadUrl.startsWith('http://')) {
      return sendRedirect(event, asset.downloadUrl, 302)
    }
    throw createError({ statusCode: 404, statusMessage: 'Asset file is not available.' })
  }

  const result = await requireReleaseAsset(event, asset.fileKey, {
    governanceResourceId: `release:${tag}:${platform}:${arch}`,
    resourceType: 'release-asset',
  })
  const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data)

  setResponseHeader(event, 'Content-Type', asset.contentType || result.contentType)
  setResponseHeader(event, 'Content-Length', buffer.length)
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${asset.filename}"`)

  return send(event, buffer)
})
