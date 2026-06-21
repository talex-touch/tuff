import type { AssetArch, AssetPlatform } from '../../../utils/releasesStore'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createError, readFormData } from 'h3'
import { requireAdminOrApiKey } from '../../../utils/auth'
import { uploadReleaseAsset } from '../../../utils/releaseAssetStorage'
import { createReleaseAsset, getReleaseByTag } from '../../../utils/releasesStore'
import {
  completeUploadGovernance,
  failUploadGovernance,
  startUploadGovernance,
  type UploadGovernanceContext,
} from '../../../utils/uploadGovernance'

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function classifyReleaseAssetUploadFailure(error: unknown): string {
  const record = readRecord(error)
  const statusCode = record?.statusCode
  const data = readRecord(record?.data)
  const uploadRetry = readRecord(data?.uploadRetry)
  const message = String(record?.statusMessage ?? record?.message ?? '').toLowerCase()

  if (statusCode === 429 || message.includes('policy exceeded') || message.includes('policy block'))
    return 'storage-policy-blocked'
  if (uploadRetry) {
    const retryCount = uploadRetry.retryCount
    const maxRetries = uploadRetry.maxRetries
    if (typeof retryCount === 'number' && typeof maxRetries === 'number' && retryCount >= maxRetries)
      return 'storage-write-retry-exhausted'
    return 'storage-write-retry-failed'
  }
  if (message.includes('storage') || message.includes('r2') || message.includes('s3') || message.includes('oss'))
    return 'storage-write-failed'
  return 'release-asset-upload-failed'
}

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
  const uploadResourceId = `release:${tag}:${platform}:${arch}`
  const downloadUrl = `/api/releases/${tag}/download/${platform}/${arch}`
  const uploadAttempt = await startUploadGovernance(event, {
    actorId: userId,
    resourceType: 'release-asset',
    resourceId: uploadResourceId,
    file,
    metadata: {
      tag,
      platform,
      arch,
      surface: 'release-assets',
    },
  })
  let signatureKey: string | null = null
  let sha256 = ''

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    sha256 = createHash('sha256').update(buffer).digest('hex')
    const uploadResult = await uploadReleaseAsset(event, fileKey, buffer, file.type, {
      actorId: userId,
      governanceResourceId: uploadResourceId,
      resourceType: 'release-asset',
    })
    await completeUploadGovernance(event, uploadAttempt, {
      resourceId: uploadResourceId,
      contentType: uploadResult.contentType,
      size: uploadResult.size,
      storageChannel: uploadResult.storageChannel,
      storageProvider: uploadResult.storageProvider,
      metadata: uploadResult.uploadRetry ? { ...uploadResult.uploadRetry } : undefined,
    })
  }
  catch (error) {
    await failUploadGovernance(event, uploadAttempt, error, {
      reason: classifyReleaseAssetUploadFailure(error),
    })
    throw error
  }

  if (isFile(signatureFile) && signatureFile.size > 0) {
    signatureKey = `${fileKey}.sig`
    const signatureResourceId = `${uploadResourceId}:signature`
    const signatureAttempt: UploadGovernanceContext = await startUploadGovernance(event, {
      actorId: userId,
      resourceType: 'release-signature',
      resourceId: signatureResourceId,
      file: signatureFile,
      metadata: {
        tag,
        platform,
        arch,
        surface: 'release-assets',
      },
    })
    try {
      const signatureBuffer = Buffer.from(await signatureFile.arrayBuffer())
      const signatureUploadResult = await uploadReleaseAsset(
        event,
        signatureKey,
        signatureBuffer,
        signatureFile.type || 'application/octet-stream',
        {
          actorId: userId,
          governanceResourceId: signatureResourceId,
          resourceType: 'release-signature',
        },
      )
      await completeUploadGovernance(event, signatureAttempt, {
        resourceId: signatureResourceId,
        contentType: signatureUploadResult.contentType,
        size: signatureUploadResult.size,
        storageChannel: signatureUploadResult.storageChannel,
        storageProvider: signatureUploadResult.storageProvider,
        metadata: signatureUploadResult.uploadRetry ? { ...signatureUploadResult.uploadRetry } : undefined,
      })
    }
    catch (error) {
      await failUploadGovernance(event, signatureAttempt, error, {
        reason: classifyReleaseAssetUploadFailure(error),
      })
      throw error
    }
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
