import type { ReleaseEvidenceItemStatus } from '../../../utils/releaseEvidenceStore'
import { readBody } from 'h3'
import { requireAdminOrApiKey } from '../../../utils/auth'
import { createReleaseEvidenceRun, upsertReleaseEvidenceItem } from '../../../utils/releaseEvidenceStore'

function runStatusFromItemStatus(status: ReleaseEvidenceItemStatus) {
  if (status === 'passed')
    return 'passed'
  if (status === 'failed' || status === 'blocked')
    return 'failed'
  return 'partial'
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdminOrApiKey(event, ['release:evidence'])
  const body = await readBody(event)
  const status = (body?.status ?? 'passed') as ReleaseEvidenceItemStatus

  const run = await createReleaseEvidenceRun(event, {
    version: body?.version ?? '2.5.0',
    platform: 'all',
    scope: 'docs',
    status: runStatusFromItemStatus(status),
    notes: body?.notes,
    createdBy: userId,
  })

  const item = await upsertReleaseEvidenceItem(event, run.id, {
    category: 'docs',
    caseId: 'docs-guard',
    status,
    requiredForRelease: true,
    evidence: body?.evidence ?? {
      command: 'pnpm docs:guard',
      summary: 'docs guard result recorded',
    },
    notes: body?.notes,
  })

  return { run, item }
})
