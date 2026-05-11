import { buildPilotServeStat } from '../../../utils/pilot-serve-stat'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async () => {
  return quotaOk(await buildPilotServeStat())
})
