import { Buffer } from 'node:buffer'
import { createError, readBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import { requireSessionAuth } from '../../utils/auth'
import { consumeWebAuthnChallenge, createPasskey, getPasskeyByCredentialId } from '../../utils/authStore'
import { verifyRegistrationResponse } from '../../utils/webauthn'

function decodeBase64Url(input: string): string {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }
  return Buffer.from(normalized, 'base64').toString('utf8')
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody(event)
  const credential = body?.credential
  if (!credential?.response?.attestationObject || !credential?.response?.clientDataJSON) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid credential.' })
  }

  const origin = useRuntimeConfig().auth?.origin as string | undefined
  if (!origin) {
    throw createError({ statusCode: 500, statusMessage: 'AUTH_ORIGIN missing.' })
  }
  const rpId = new URL(origin).hostname
  const challenge = JSON.parse(decodeBase64Url(credential.response.clientDataJSON))?.challenge
  if (!challenge) {
    throw createError({ statusCode: 400, statusMessage: 'Missing challenge.' })
  }
  const storedChallenge = await consumeWebAuthnChallenge(event, challenge, 'register')
  if (!storedChallenge || storedChallenge.userId !== userId) {
    throw createError({ statusCode: 400, statusMessage: 'Challenge expired.' })
  }

  const result = await verifyRegistrationResponse({
    attestationObject: credential.response.attestationObject,
    clientDataJSON: credential.response.clientDataJSON,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRpId: rpId
  })

  const existing = await getPasskeyByCredentialId(event, result.credentialId)
  if (existing) {
    throw createError({ statusCode: 400, statusMessage: 'Passkey already registered.' })
  }

  await createPasskey(event, {
    userId,
    credentialId: result.credentialId,
    publicKeyJwk: result.publicKeyJwk,
    counter: result.counter,
    transports: credential.transports ?? null
  })

  return { success: true }
})
