import { readBody } from 'h3'
import { mergePilotGuestDataAfterAuth } from '../../../utils/pilot-guest-merge'
import {
  createPilotLocalUser,
  ensurePilotLocalAuthSchema,
  getPilotLocalUserByEmail,
  isPilotLocalEmail,
  normalizePilotLocalEmail,
  normalizePilotLocalNickname,
} from '../../../utils/pilot-local-auth'
import { writePilotSessionCookie } from '../../../utils/pilot-session'
import { quotaError, quotaOk } from '../../../utils/quota-api'

interface RegisterBody {
  email?: string
  password?: string
  nickname?: string
}

function validatePassword(password: unknown): string {
  return String(password || '')
}

export default defineEventHandler(async (event) => {
  await ensurePilotLocalAuthSchema(event)

  const body = await readBody<RegisterBody>(event)
  const email = normalizePilotLocalEmail(body?.email)
  const password = validatePassword(body?.password)
  const nickname = normalizePilotLocalNickname(body?.nickname, email)

  if (!isPilotLocalEmail(email)) {
    return quotaError(400, '邮箱格式不正确', null)
  }

  if (password.length < 6 || password.length > 128) {
    return quotaError(400, '密码长度需为 6-128 位', null)
  }

  const existed = await getPilotLocalUserByEmail(event, email)
  if (existed) {
    return quotaError(409, '该邮箱已注册', null)
  }

  const user = await createPilotLocalUser(event, {
    email,
    password,
    nickname,
  })

  const token = await writePilotSessionCookie(event, user.userId)
  const mergeReport = await mergePilotGuestDataAfterAuth(event, user.userId, 'register')

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
