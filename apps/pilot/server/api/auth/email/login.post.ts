import { readBody } from 'h3'
import { mergePilotGuestDataAfterAuth } from '../../../utils/pilot-guest-merge'
import {
  createPilotLocalUser,
  ensurePilotLocalAuthSchema,
  getPilotLocalUserByEmail,
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

  if (password.length < 6 || password.length > 128) {
    return quotaError(400, '密码长度需为 6-128 位', null)
  }

  const existed = await getPilotLocalUserByEmail(event, email)
  let mergeReason: 'login' | 'register' = 'login'
  let user: Awaited<ReturnType<typeof verifyPilotLocalUserLogin>> = null

  if (!existed) {
    try {
      user = await createPilotLocalUser(event, {
        email,
        password,
      })
      mergeReason = 'register'
    }
    catch {
      user = await verifyPilotLocalUserLogin(event, {
        email,
        password,
      })
    }
  }
  else {
    user = await verifyPilotLocalUserLogin(event, {
      email,
      password,
    })
  }

  if (!user) {
    return quotaError(401, '邮箱或密码错误', null)
  }

  const token = await writePilotSessionCookie(event, user.userId)
  const mergeReport = await mergePilotGuestDataAfterAuth(event, user.userId, mergeReason)

  return quotaOk({
    userId: user.userId,
    email: user.email,
    nickname: user.nickname,
    source: 'local',
    token: {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresIn: token.expiresIn,
      refreshExpiresIn: token.refreshExpiresIn,
    },
    merged: mergeReport,
  })
})
