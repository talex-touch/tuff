import { requireVerifiedEmail } from '../../utils/auth'
import { listCreditLedger } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  return listCreditLedger(event, userId)
})
