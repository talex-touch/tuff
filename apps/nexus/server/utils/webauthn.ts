import { Buffer } from 'node:buffer'
import crypto from 'uncrypto'

const CHALLENGE_BYTES = 32
const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_AT = 0x40

function base64UrlEncode(input: Uint8Array | Buffer): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(input: string): Uint8Array {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) {
    normalized += '='
  }
  return new Uint8Array(Buffer.from(normalized, 'base64'))
}

function readDerLength(buffer: Uint8Array, offset: number): { length: number, offset: number } {
  let length = buffer[offset++]
  if (length & 0x80) {
    const byteCount = length & 0x7f
    if (byteCount === 0 || byteCount > 2) {
      throw new Error('Invalid DER length.')
    }
    length = 0
    for (let i = 0; i < byteCount; i += 1) {
      length = (length << 8) | buffer[offset++]
    }
  }
  return { length, offset }
}

function stripDerLeadingZeros(bytes: Uint8Array): Uint8Array {
  let start = 0
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start += 1
  }
  return bytes.slice(start)
}

function derToRawSignature(signature: Uint8Array, keySizeBytes = 32): Uint8Array {
  let offset = 0
  if (signature[offset++] !== 0x30) {
    throw new Error('Invalid DER signature.')
  }
  const seq = readDerLength(signature, offset)
  offset = seq.offset
  if (signature[offset++] !== 0x02) {
    throw new Error('Invalid DER signature.')
  }
  const rInfo = readDerLength(signature, offset)
  offset = rInfo.offset
  const rBytes = signature.slice(offset, offset + rInfo.length)
  offset += rInfo.length
  if (signature[offset++] !== 0x02) {
    throw new Error('Invalid DER signature.')
  }
  const sInfo = readDerLength(signature, offset)
  offset = sInfo.offset
  const sBytes = signature.slice(offset, offset + sInfo.length)
  const r = stripDerLeadingZeros(rBytes)
  const s = stripDerLeadingZeros(sBytes)
  const output = new Uint8Array(keySizeBytes * 2)
  const rStart = keySizeBytes - Math.min(r.length, keySizeBytes)
  const sStart = keySizeBytes * 2 - Math.min(s.length, keySizeBytes)
  output.set(r.slice(-keySizeBytes), rStart)
  output.set(s.slice(-keySizeBytes), sStart)
  return output
}

async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const inputCopy = Uint8Array.from(input)
  const buffer = inputCopy.buffer as ArrayBuffer
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return new Uint8Array(hash)
}

export function generateChallenge(): string {
  const bytes = new Uint8Array(CHALLENGE_BYTES)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

interface CborResult<T = any> {
  value: T
  offset: number
}

function decodeCbor(data: Uint8Array, offset = 0): CborResult {
  if (offset >= data.length)
    throw new Error('CBOR: unexpected end')
  const initial = data[offset++] ?? 0
  const major = initial >> 5
  let additional = initial & 0x1f
  const readLength = () => {
    if (additional < 24)
      return additional
    if (additional === 24)
      return data[offset++] ?? 0
    if (additional === 25) {
      const value = ((data[offset] ?? 0) << 8) | (data[offset + 1] ?? 0)
      offset += 2
      return value
    }
    if (additional === 26) {
      const value = ((data[offset] ?? 0) << 24)
        | ((data[offset + 1] ?? 0) << 16)
        | ((data[offset + 2] ?? 0) << 8)
        | (data[offset + 3] ?? 0)
      offset += 4
      return value >>> 0
    }
    throw new Error('CBOR: length too large')
  }

  switch (major) {
    case 0: {
      const value = readLength()
      return { value, offset }
    }
    case 1: {
      const value = readLength()
      return { value: -1 - value, offset }
    }
    case 2: {
      const length = readLength()
      const value = data.slice(offset, offset + length)
      offset += length
      return { value, offset }
    }
    case 3: {
      const length = readLength()
      const value = Buffer.from(data.slice(offset, offset + length)).toString('utf8')
      offset += length
      return { value, offset }
    }
    case 4: {
      const length = readLength()
      const items = []
      for (let i = 0; i < length; i++) {
        const res = decodeCbor(data, offset)
        items.push(res.value)
        offset = res.offset
      }
      return { value: items, offset }
    }
    case 5: {
      const length = readLength()
      const map = new Map<any, any>()
      for (let i = 0; i < length; i++) {
        const keyRes = decodeCbor(data, offset)
        offset = keyRes.offset
        const valueRes = decodeCbor(data, offset)
        offset = valueRes.offset
        map.set(keyRes.value, valueRes.value)
      }
      return { value: map, offset }
    }
    default:
      throw new Error(`CBOR: unsupported major type ${major}`)
  }
}

function decodeClientDataJSON(clientDataJSON: Uint8Array) {
  const json = Buffer.from(clientDataJSON).toString('utf8')
  return JSON.parse(json) as { challenge: string, origin: string, type: string }
}

function parseAuthenticatorData(authData: Uint8Array) {
  if (authData.length < 37)
    throw new Error('Invalid authenticator data.')
  const rpIdHash = authData.slice(0, 32)
  const flags = authData[32] ?? 0
  const counter = ((authData[33] ?? 0) << 24)
    | ((authData[34] ?? 0) << 16)
    | ((authData[35] ?? 0) << 8)
    | (authData[36] ?? 0)
  let offset = 37
  let credentialId: Uint8Array | null = null
  let cosePublicKey: Uint8Array | null = null
  if (flags & FLAG_AT) {
    offset += 16 // aaguid
    const idLen = ((authData[offset] ?? 0) << 8) | (authData[offset + 1] ?? 0)
    offset += 2
    credentialId = authData.slice(offset, offset + idLen)
    offset += idLen
    cosePublicKey = authData.slice(offset)
  }
  return { rpIdHash, flags, counter, credentialId, cosePublicKey }
}

function coseToJwk(coseKey: Map<any, any>) {
  const kty = coseKey.get(1)
  const crv = coseKey.get(-1)
  const x = coseKey.get(-2)
  const y = coseKey.get(-3)
  if (kty !== 2 || crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
    throw new Error('Unsupported COSE key.')
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(x),
    y: base64UrlEncode(y)
  }
}

export async function verifyRegistrationResponse(params: {
  attestationObject: string
  clientDataJSON: string
  expectedChallenge: string
  expectedOrigin: string
  expectedRpId: string
}) {
  const attestation = decodeCbor(base64UrlDecode(params.attestationObject)).value as Map<any, any>
  const authData = attestation.get('authData') as Uint8Array
  if (!authData)
    throw new Error('Missing authData.')
  const clientData = decodeClientDataJSON(base64UrlDecode(params.clientDataJSON))
  if (clientData.type !== 'webauthn.create')
    throw new Error('Invalid clientData type.')
  if (clientData.challenge !== params.expectedChallenge)
    throw new Error('Challenge mismatch.')
  if (clientData.origin !== params.expectedOrigin)
    throw new Error('Origin mismatch.')
  const parsed = parseAuthenticatorData(authData)
  const rpIdHash = await sha256(Buffer.from(params.expectedRpId))
  if (!Buffer.from(parsed.rpIdHash).equals(Buffer.from(rpIdHash)))
    throw new Error('RP ID hash mismatch.')
  if (!(parsed.flags & FLAG_UP))
    throw new Error('User presence required.')
  if (!parsed.credentialId || !parsed.cosePublicKey)
    throw new Error('Missing credential data.')
  const coseKey = decodeCbor(parsed.cosePublicKey).value as Map<any, any>
  const jwk = coseToJwk(coseKey)
  return {
    credentialId: base64UrlEncode(parsed.credentialId),
    publicKeyJwk: jwk,
    counter: parsed.counter
  }
}

export async function verifyAssertionResponse(params: {
  authenticatorData: string
  clientDataJSON: string
  signature: string
  expectedChallenge: string
  expectedOrigin: string
  expectedRpId: string
  publicKeyJwk: JsonWebKey
  previousCounter: number
}) {
  const authData = base64UrlDecode(params.authenticatorData)
  const clientDataJSON = base64UrlDecode(params.clientDataJSON)
  const clientData = decodeClientDataJSON(clientDataJSON)
  if (clientData.type !== 'webauthn.get')
    throw new Error('Invalid clientData type.')
  if (clientData.challenge !== params.expectedChallenge)
    throw new Error('Challenge mismatch.')
  if (clientData.origin !== params.expectedOrigin)
    throw new Error('Origin mismatch.')
  const parsed = parseAuthenticatorData(authData)
  const rpIdHash = await sha256(Buffer.from(params.expectedRpId))
  if (!Buffer.from(parsed.rpIdHash).equals(Buffer.from(rpIdHash)))
    throw new Error('RP ID hash mismatch.')
  if (!(parsed.flags & FLAG_UP))
    throw new Error('User presence required.')
  const clientHash = await sha256(clientDataJSON)
  const signedData = Buffer.concat([Buffer.from(authData), Buffer.from(clientHash)])
  const key = await crypto.subtle.importKey(
    'jwk',
    params.publicKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )
  const signatureBytes = base64UrlDecode(params.signature)
  const signatureCopy = Uint8Array.from(signatureBytes)
  const signatureBuffer = signatureCopy.buffer as ArrayBuffer
  let verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signatureBuffer,
    signedData
  )
  if (!verified) {
    try {
      const rawSignature = derToRawSignature(signatureBytes, 32)
      verified = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        rawSignature,
        signedData
      )
    }
    catch {
      // ignore invalid DER formats
    }
  }
  if (!verified)
    throw new Error('Invalid signature.')
  const currentCounter = parsed.counter
  const previousCounter = params.previousCounter
  const shouldCheckCounter = currentCounter > 0 && previousCounter > 0
  if (shouldCheckCounter && currentCounter <= previousCounter)
    throw new Error('Authenticator counter did not increase.')
  const nextCounter = currentCounter === 0 && previousCounter > 0 ? previousCounter : currentCounter
  return { counter: nextCounter, userVerified: Boolean(parsed.flags & FLAG_UV) }
}
