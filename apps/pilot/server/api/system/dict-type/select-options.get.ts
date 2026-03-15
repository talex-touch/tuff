import { listPilotCompatEntitiesAll } from '../../../utils/pilot-compat-store'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const rows = await listPilotCompatEntitiesAll<Record<string, any>>(event, 'system.dict_type')
  const data = rows.map(item => ({
    id: item.id,
    label: item.name || item.code || item.id,
    value: item.id,
    code: item.code || '',
    name: item.name || '',
  }))
  return quotaOk(data)
})
