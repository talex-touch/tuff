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
  if (typeof resolvedUserId !== 'string' || !resolvedUserId) {
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

  await logLoginAttempt(event, { userId: user.id, deviceId: null, success: true, reason: 'passkey', clientType: 'app' })

  // The assertion's UV flag decides what the resulting token is allowed to prove (#923).
  //
  // Options are requested with userVerification: 'preferred', so an authenticator with no PIN
  // or biometric enrolled answers with the UV flag clear — a single touch. That is fine for
  // signing in, which is what possession of the key has always meant, but it is not a second
  // factor, and requireAdminStepUp / requireAdminSessionChannel were treating the token as
  // exactly that. Someone holding an admin's PIN-less key could clear 'Passkey step-up
  // required' on emergency admin actions with one touch.
  //
  // Encoding the difference in the token's reason means no schema change and no new check at
  // the call sites: every consumer that matches on 'passkey' is a step-up path, while the
  // ordinary sign-in in api/auth/[...].ts consumes without a reason and keeps working. A
  // presence-only key therefore still logs in and simply cannot elevate.
  const reason = result.userVerified ? 'passkey' : 'passkey-presence'
  const loginToken = await createLoginToken(event, user.id, reason, 1000 * 60 * 10)

  // Surfaced so a client can explain why an elevation prompt will not accept this key,
  // rather than letting it fail later as an opaque rejection.
  return { token: loginToken, userVerified: result.userVerified }
})
