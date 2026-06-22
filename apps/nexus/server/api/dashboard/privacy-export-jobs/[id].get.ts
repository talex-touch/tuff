import { createError } from 'h3'
import { requireSessionAuth } from '../../../utils/auth'
import { advancePrivacyExportJob } from '../../../utils/privacyDataStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const jobId = getRouterParam(event, 'id')?.trim()
  if (!jobId)
    throw createError({ statusCode: 400, statusMessage: 'Export job id is required.' })

  const job = await advancePrivacyExportJob(event, userId, jobId)
  if (!job)
    throw createError({ statusCode: 404, statusMessage: 'Export job not found.' })

  return {
    jobId: job.id,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    expiresAt: job.expiresAt,
    downloadUrl: job.status === 'succeeded'
      ? `/api/dashboard/privacy-export-jobs/${encodeURIComponent(job.id)}/download`
      : null,
  }
})
