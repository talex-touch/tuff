import type { AssetArch, AssetPlatform } from '../../../utils/releasesStore'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createError, readFormData } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { uploadReleaseAsset } from '../../../utils/releaseAssetStorage'
import { createReleaseAsset, getReleaseByTag } from '../../../utils/releasesStore'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

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

  // Calculate SHA256
  const buffer = Buffer.from(await file.arrayBuffer())
  const sha256 = createHash('sha256').update(buffer).digest('hex')

  const fileKey = `releases/${tag}/${platform}-${arch}/${file.name}`
  const downloadUrl = `/api/releases/${tag}/download/${platform}/${arch}`

  await uploadReleaseAsset(event, fileKey, buffer, file.type)

  let signatureKey: string | null = null
  if (isFile(signatureFile) && signatureFile.size > 0) {
    const signatureBuffer = Buffer.from(await signatureFile.arrayBuffer())
    signatureKey = `${fileKey}.sig`
    await uploadReleaseAsset(
      event,
      signatureKey,
      signatureBuffer,
      signatureFile.type || 'application/octet-stream',
    )
  }

  const asset = await createReleaseAsset(event, {
    releaseId: release.id,
    platform,
    arch,
    filename: file.name,
    sourceType: 'upload',
    fileKey,
    downloadUrl,
    size: file.size,
    sha256,
    contentType: file.type || 'application/octet-stream',
  })

  const signatureUrl = signatureKey
    ? `/api/releases/${tag}/signature/${platform}/${arch}`
    : null

  return {
    asset: { ...asset, signatureUrl },
    message: 'Asset uploaded successfully.',
  }
})
