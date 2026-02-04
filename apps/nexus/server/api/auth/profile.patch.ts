import { readBody } from 'h3'
import { requireAuth } from '../../utils/auth'
import { updateUserProfile } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : null
  const image = typeof body?.image === 'string' ? body.image.trim() : null
  const locale = typeof body?.locale === 'string' ? body.locale.trim() : null
  const user = await updateUserProfile(event, userId, { name, image, locale })
  return user
})

