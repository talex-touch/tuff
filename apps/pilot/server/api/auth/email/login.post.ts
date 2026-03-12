import { readBody } from 'h3'
import { mergePilotGuestDataAfterAuth } from '../../../utils/pilot-guest-merge'
import {
  ensurePilotLocalAuthSchema,
  isPilotLocalEmail,
  normalizePilotLocalEmail,
  verifyPilotLocalUserLogin,
} from '../../../utils/pilot-local-auth'
import { writePilotSessionCookie } from '../../../utils/pilot-session'
import { quotaError, quotaOk } from '../../../utils/quota-api'

interface LoginBody {
  email?: string
  password?: string
}

export default defineEventHandler(async (event) => {
  await ensurePilotLocalAuthSchema(event)

  const body = await readBody<LoginBody>(event)
  const email = normalizePilotLocalEmail(body?.email)
  const password = String(body?.password || '')

  if (!isPilotLocalEmail(email)) {
    return quotaError(400, '邮箱格式不正确', null)
  }

  if (!password) {
    return quotaError(400, '密码不能为空', null)
  }

  const user = await verifyPilotLocalUserLogin(event, {
    email,
    password,
  })

  if (!user) {
    return quotaError(401, '邮箱或密码错误', null)
  }

  writePilotSessionCookie(event, user.userId)
  const mergeReport = await mergePilotGuestDataAfterAuth(event, user.userId, 'login')

  return quotaOk({
    userId: user.userId,
    email: user.email,
    nickname: user.nickname,
    source: 'local',
    merged: mergeReport,
  })
})
