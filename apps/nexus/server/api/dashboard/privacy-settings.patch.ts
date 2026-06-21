import { createError, readBody } from 'h3'
import { requireSessionAuth } from '../../utils/auth'
import { DEFAULT_USER_PRIVACY_SETTINGS, setUserPrivacySettings, type UserPrivacySettings } from '../../utils/authStore'

type PrivacySettingKey = keyof UserPrivacySettings

const PRIVACY_SETTING_KEYS: PrivacySettingKey[] = ['analytics', 'crashReports', 'usageData', 'personalization']

function normalizePrivacySettings(body: Partial<Record<PrivacySettingKey, unknown>>): Partial<UserPrivacySettings> {
  const settings: Partial<UserPrivacySettings> = {}

  for (const key of PRIVACY_SETTING_KEYS) {
    const value = body[key]
    if (value === undefined)
      continue
    if (typeof value !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: `${key} must be a boolean.` })
    }
    settings[key] = value
  }

  if (!Object.keys(settings).length) {
    throw createError({ statusCode: 400, statusMessage: 'At least one privacy setting is required.' })
  }

  return settings
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody<Partial<Record<PrivacySettingKey, unknown>>>(event)
  const settings = normalizePrivacySettings(body ?? {})
  const user = await setUserPrivacySettings(event, userId, settings)

  return {
    settings: user?.privacySettings ?? DEFAULT_USER_PRIVACY_SETTINGS,
  }
})
