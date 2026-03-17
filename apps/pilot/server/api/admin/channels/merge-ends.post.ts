import { requirePilotAdmin } from '../../../utils/pilot-admin-auth'
import { mergePilotAdminChannelsFromEnds } from '../../../utils/pilot-channel-merge-ends'
import { quotaOk } from '../../../utils/quota-api'

interface MergeEndsBody {
  endsRoot?: string
  dryRun?: boolean
}

function toBooleanFlag(value: unknown): boolean {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on'
}

export default defineEventHandler(async (event) => {
  await requirePilotAdmin(event)
  let body: MergeEndsBody = {}
  try {
    body = await readBody<MergeEndsBody>(event)
  }
  catch {
    body = {}
  }
  const result = await mergePilotAdminChannelsFromEnds(event, {
    endsRoot: String(body?.endsRoot || ''),
    dryRun: toBooleanFlag(body?.dryRun),
  })
  return quotaOk(result)
})
