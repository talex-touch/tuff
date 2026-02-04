import { requireAuth } from '../../utils/auth'
import { listCreditLedger } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  return listCreditLedger(event, userId)
})

