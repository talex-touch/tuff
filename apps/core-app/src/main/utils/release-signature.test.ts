import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignatureVerifier } from './release-signature'

describe('SignatureVerifier', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('decodes JSON wrapped base64 signature payloads', () => {
    const verifier = new SignatureVerifier()
    const base64 = Buffer.from('hello').toString('base64')
    const payload = Buffer.from(JSON.stringify({ signature: base64 }))

    const decoded = (verifier as any).decodeSignaturePayload(payload) as Buffer
    expect(decoded).toEqual(Buffer.from('hello'))
  })

  it('decodes hex signature payloads', () => {
    const verifier = new SignatureVerifier()
    const payload = Buffer.from('deadbeef')

    const decoded = (verifier as any).decodeSignaturePayload(payload) as Buffer
    expect(decoded).toEqual(Buffer.from('deadbeef', 'hex'))
  })

  it('returns mismatch when signature verification fails', async () => {
    const verifier = new SignatureVerifier()
    const verifierAny = verifier as any
    verifierAny.fetchSignaturePayload = vi.fn().mockResolvedValue(Buffer.from('deadbeef'))
    verifierAny.fetchSignaturePublicKey = vi
      .fn()
      .mockResolvedValue('-----BEGIN PUBLIC KEY-----\nmock\n-----END PUBLIC KEY-----')

    vi.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from('file-content'))
    const cryptoAny = crypto as unknown as { verify: (...args: unknown[]) => boolean }
    vi.spyOn(cryptoAny, 'verify').mockReturnValue(false)

    const result = await verifier.verifyFileSignature('/fake/path', 'https://example.com/app.sig')
    expect(result).toEqual({ valid: false, reason: 'Signature mismatch' })
  })
})
