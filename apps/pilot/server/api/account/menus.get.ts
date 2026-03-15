import { listPilotSystemResource } from '../../utils/pilot-system-resource'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const data = await listPilotSystemResource(event, 'menus', {
    page: 1,
    pageSize: 999,
  })
  return quotaOk(data)
})
