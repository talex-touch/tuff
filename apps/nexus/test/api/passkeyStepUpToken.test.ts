import { readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What a passkey assertion is allowed to prove (#923).
 *
 * Options are requested with `userVerification: 'preferred'`, so a key with no PIN or
 * biometric enrolled answers with the UV flag clear. The handler dropped `result.userVerified`
 * and minted a `'passkey'` token regardless — the same token requireAdminStepUp and the admin
 * control-plane guard accept as second-factor proof. One touch of a PIN-less key cleared
 * "Passkey step-up required" on emergency admin actions.
 */

const createLoginToken = vi.fn(async () => 'issued-token')
const verifyAssertionResponse = vi.fn()

vi.mock('../../server/utils/authStore', () => ({
  createLoginToken,
  consumeWebAuthnChallenge: vi.fn(async () => ({ challenge: 'chal', userId: 'user-1' })),
  // snake_case: this is the DB row shape the handler reads (passkey.user_id / public_key).
  getPasskeyByCredentialId: vi.fn(async () => ({
    id: 'cred-1',
    user_id: 'user-1',
    counter: 0,
    public_key: JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }),
  })),
  getUserById: vi.fn(async () => ({ id: 'user-1', status: 'active' })),
  logLoginAttempt: vi.fn(async () => {}),
  updatePasskeyCounter: vi.fn(async () => {}),
}))

vi.mock('../../server/utils/webauthn', () => ({ verifyAssertionResponse }))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({ auth: { origin: 'http://localhost' } }),
}))

vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)

type Handler = (event: unknown) => Promise<{ token: string, userVerified: boolean }>

/** A clientDataJSON whose decoded challenge is non-empty, which is all the handler reads. */
const clientDataJSON = Buffer.from(JSON.stringify({ challenge: 'chal' }), 'utf8')
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '')

function event() {
  return {
    context: {},
    node: { req: { headers: {} } },
    __body: {
      credential: {
        id: 'cred-1',
        response: { clientDataJSON, authenticatorData: 'ad', signature: 'sig' },
      },
    },
  }
}

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readBody: vi.fn(async (e: { __body?: unknown }) => e.__body) }
})

async function run(userVerified: boolean) {
  verifyAssertionResponse.mockResolvedValue({ counter: 1, userVerified })
  const mod = await import('../../server/api/passkeys/verify.post')
  const handler = mod.default as unknown as Handler
  return await handler(event())
}

describe('passkey verify token reason', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mints a step-up-eligible token when the assertion was user-verified', () => {
    return run(true).then((result) => {
      expect(createLoginToken).toHaveBeenCalledWith(expect.anything(), 'user-1', 'passkey', expect.any(Number))
      expect(result.userVerified).toBe(true)
    })
  })

  it('marks a presence-only assertion so it cannot satisfy a step-up', () => {
    // The regression: this used to be 'passkey', which requireAdminStepUp accepts.
    return run(false).then((result) => {
      expect(createLoginToken).toHaveBeenCalledWith(expect.anything(), 'user-1', 'passkey-presence', expect.any(Number))
      expect(result.userVerified).toBe(false)
    })
  })

  it('still issues a token for a presence-only assertion, so ordinary sign-in keeps working', () => {
    return run(false).then((result) => {
      expect(result.token).toBe('issued-token')
    })
  })
})

/**
 * The invariant the fix rests on, guarded at source level because breaking it is invisible.
 *
 * Encoding step-up eligibility in the token's `reason` only works while *every* consumer that
 * matches on 'passkey' is a step-up path, and while ordinary sign-in consumes without a
 * reason. A future call site consuming 'passkey' for something routine, or a sign-in changed
 * to match on it, would re-open #923 with nothing failing.
 */
describe('login token reason invariant', () => {
  const root = fileURLToPath(new URL('../../server/', import.meta.url))

  const STEP_UP_CONSUMERS = [
    'api/team/invitations/[id]/accept.post.ts',
    'api/v1/keys/recover-device.post.ts',
    'api/v1/keys/issue-device.post.ts',
    'utils/auth.ts',
    'utils/adminControlPlaneGuard.ts',
  ]

  it.each(STEP_UP_CONSUMERS)('%s consumes a passkey token by reason', (file) => {
    expect(readFileSync(root + file, 'utf8')).toContain("consumeLoginToken(event, ")
  })

  it('leaves ordinary sign-in matching no reason at all', () => {
    // If this ever gains a 'passkey' argument, a presence-only key stops being able to sign
    // in — the opposite failure, and equally silent.
    const source = readFileSync(root + 'api/auth/[...].ts', 'utf8')
    expect(source).toContain('consumeLoginToken(authEvent, loginToken)')
    expect(source).not.toContain("consumeLoginToken(authEvent, loginToken, 'passkey')")
  })

  it('has exactly one producer of passkey login tokens', () => {
    // A second producer could mint 'passkey' without consulting the UV flag, which is how
    // this class of fix usually rots.
    const verify = readFileSync(root + 'api/passkeys/verify.post.ts', 'utf8')
    expect(verify).toContain("result.userVerified ? 'passkey' : 'passkey-presence'")
  })
})
