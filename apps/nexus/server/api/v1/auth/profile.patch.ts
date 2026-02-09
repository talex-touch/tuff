import { readBody } from 'h3'
import { requireAppAuth } from '../../../utils/auth'
import { updateUserProfile } from '../../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAppAuth(event)
  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : null
  const image = typeof body?.image === 'string' ? body.image.trim() : null
  const locale = typeof body?.locale === 'string' ? body.locale.trim() : null
  return await updateUserProfile(event, userId, { name, image, locale })
})
