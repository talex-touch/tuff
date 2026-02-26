import { createError, readBody } from 'h3'
import { requireSessionAuth } from '../../utils/auth'
import { updateUserProfile } from '../../utils/authStore'
import { normalizeLocaleCode } from '../../utils/locale'

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody(event)
  const hasName = Object.prototype.hasOwnProperty.call(body ?? {}, 'name')
  const hasImage = Object.prototype.hasOwnProperty.call(body ?? {}, 'image')
  const hasLocale = Object.prototype.hasOwnProperty.call(body ?? {}, 'locale')

  const name = hasName
    ? typeof body?.name === 'string'
      ? body.name.trim()
      : body?.name === null
        ? null
        : undefined
    : undefined
  const image = hasImage
    ? typeof body?.image === 'string'
      ? body.image.trim()
      : body?.image === null
        ? null
        : undefined
    : undefined

  let locale: 'en' | 'zh' | null | undefined
  if (!hasLocale) {
    locale = undefined
  }
  else if (body?.locale === null) {
    locale = null
  }
  else if (typeof body?.locale === 'string') {
    const normalized = normalizeLocaleCode(body.locale)
    if (!normalized && body.locale.trim().length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid locale. Only en, zh, or null is allowed.',
      })
    }
    locale = normalized
  }
  else {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid locale. Only en, zh, or null is allowed.',
    })
  }

  if (hasName && name === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid name. Expected string or null.',
    })
  }

  if (hasImage && image === undefined) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid image. Expected string or null.',
    })
  }

  return await updateUserProfile(event, userId, { name, image, locale })
})
