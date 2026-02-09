import { Buffer } from 'node:buffer'
import { createError, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import { consumeWebAuthnChallenge, createLoginToken, getPasskeyByCredentialId, getUserById, logLoginAttempt, updatePasskeyCounter } from '../../utils/authStore'
import { verifyAssertionResponse } from '../../utils/webauthn'

function decodeBase64Url(input: string): string {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }
  return Buffer.from(normalized, 'base64').toString('utf8')
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const credential = body?.credential
  if (!credential?.id || !credential?.response?.clientDataJSON) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid credential.' })
  }
  const challenge = JSON.parse(decodeBase64Url(credential.response.clientDataJSON))?.challenge
  if (!challenge) {
    throw createError({ statusCode: 400, statusMessage: 'Missing challenge.' })
  }

  const storedChallenge = await consumeWebAuthnChallenge(event, challenge, 'login')
  if (!storedChallenge) {
    throw createError({ statusCode: 400, statusMessage: 'Challenge expired.' })
  }

  const passkey = await getPasskeyByCredentialId(event, credential.id)
  if (!passkey) {
    throw createError({ statusCode: 404, statusMessage: 'Passkey not found.' })
  }
  if (storedChallenge.userId && storedChallenge.userId !== passkey.user_id) {
    throw createError({ statusCode: 400, statusMessage: 'Passkey does not match challenge.' })
  }
  const resolvedUserId = storedChallenge.userId ?? passkey.user_id
  if (!resolvedUserId) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  const origin = useRuntimeConfig().auth?.origin as string | undefined
  if (!origin) {
    throw createError({ statusCode: 500, statusMessage: 'AUTH_ORIGIN missing.' })
  }
  const rpId = new URL(origin).hostname
  const publicKeyJwk = JSON.parse(passkey.public_key as string)
  if (process.env.NODE_ENV !== 'production') {
    console.info('[passkey] verify', {
      expectedOrigin: origin,
      expectedRpId: rpId,
      keyCrv: publicKeyJwk?.crv,
      signatureLength: credential.response.signature?.length ?? 0
    })
  }

  const result = await verifyAssertionResponse({
    authenticatorData: credential.response.authenticatorData,
    clientDataJSON: credential.response.clientDataJSON,
    signature: credential.response.signature,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRpId: rpId,
    publicKeyJwk,
    previousCounter: Number(passkey.counter ?? 0)
  })

  await updatePasskeyCounter(event, credential.id, result.counter)

  const user = await getUserById(event, resolvedUserId)
  if (!user || user.status !== 'active') {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  await logLoginAttempt(event, { userId: user.id, deviceId: null, success: true, reason: 'passkey' })
  const loginToken = await createLoginToken(event, user.id, 'passkey', 1000 * 60 * 10)

  return { token: loginToken }
})
