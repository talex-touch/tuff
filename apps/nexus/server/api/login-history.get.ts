import { requireAuth } from '../utils/auth'
import { listLoginHistory } from '../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const records = await listLoginHistory(event, userId, 90)
  return records.map(record => ({
    id: record.id,
    success: record.success,
    ip: record.ip,
    ipMasked: record.ip_masked,
    created_at: record.created_at,
    location: {
      countryCode: record.country_code,
      regionCode: record.region_code,
      regionName: record.region_name,
      city: record.city,
      latitude: record.latitude,
      longitude: record.longitude,
    },
  }))
})
