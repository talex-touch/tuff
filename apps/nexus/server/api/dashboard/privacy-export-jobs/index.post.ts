import { requireSessionAuth } from '../../../utils/auth'
import { createPrivacyExportJob } from '../../../utils/privacyDataStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const job = await createPrivacyExportJob(event, userId)

  return {
    jobId: job.id,
    status: job.status,
    expiresAt: job.expiresAt,
  }
})
