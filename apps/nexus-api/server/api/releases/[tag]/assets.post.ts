import type { AssetArch, AssetPlatform } from '../../../utils/releasesStore'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createError, defineEventHandler, readFormData } from 'h3'
import { requireAdminOrApiKey } from '../../../utils/auth'
import { uploadReleaseAsset } from '../../../utils/releaseAssetStorage'
import { createReleaseAsset, getReleaseByTag } from '../../../utils/releasesStore'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdminOrApiKey(event, ['release:assets'])

  const tag = event.context.params?.tag

  if (!tag)
    throw createError({ statusCode: 400, statusMessage: 'Release tag is required.' })

  const release = await getReleaseByTag(event, tag, false)

  if (!release)
    throw createError({ statusCode: 404, statusMessage: 'Release not found.' })

  const formData = await readFormData(event)

  const platform = formData.get('platform') as AssetPlatform
  const arch = formData.get('arch') as AssetArch
  const file = formData.get('file')
  const signatureFile = formData.get('signature')

  if (!platform || !arch)
    throw createError({ statusCode: 400, statusMessage: 'Platform and arch are required.' })

  if (!isFile(file) || file.size === 0)
    throw createError({ statusCode: 400, statusMessage: 'File is required.' })

  const fileKey = `releases/${tag}/${platform}-${arch}/${file.name}`
  const downloadUrl = `/api/releases/${tag}/download/${platform}/${arch}`
  let signatureKey: string | null = null

  const buffer = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  await uploadReleaseAsset(event, fileKey, buffer, file.type, {
    actorId: userId,
    resourceType: 'release-asset',
  })

  if (isFile(signatureFile) && signatureFile.size > 0) {
    signatureKey = `${fileKey}.sig`
    const signatureBuffer = Buffer.from(await signatureFile.arrayBuffer())
    await uploadReleaseAsset(
      event,
      signatureKey,
      signatureBuffer,
      signatureFile.type || 'application/octet-stream',
      {
        actorId: userId,
        resourceType: 'release-signature',
      },
    )
  }

  const asset = await createReleaseAsset(event, {
    releaseId: release.id,
    platform,
    arch,
    filename: file.name,
    sourceType: 'upload',
    fileKey,
    signatureKey,
    signatureUrl: signatureKey ? `/api/releases/${tag}/signature/${platform}/${arch}` : null,
    downloadUrl,
    size: file.size,
    sha256,
    contentType: file.type || 'application/octet-stream',
  })

  return {
    asset,
    message: 'Asset uploaded successfully.',
  }
})
