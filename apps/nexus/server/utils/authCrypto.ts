import { Buffer } from 'node:buffer'
import crypto from 'uncrypto'

const PBKDF2_ITERATIONS = 210_000
const PBKDF2_HASH = 'SHA-256'
const SALT_BYTES = 16
const HASH_BYTES = 32

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

export function generatePasswordSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function deriveKey(password: string, salt: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const saltBytes = base64UrlDecode(salt)
  const saltCopy = Uint8Array.from(saltBytes)
  const saltBuffer = saltCopy.buffer as ArrayBuffer
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH
    },
    keyMaterial,
    HASH_BYTES * 8
  )
  return derived
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = await deriveKey(password, salt)
  return base64UrlEncode(new Uint8Array(derived))
}

export async function verifyPassword(password: string, salt: string, hash: string): Promise<boolean> {
  const derived = await deriveKey(password, salt)
  const expected = base64UrlDecode(hash)
  const actual = new Uint8Array(derived)
  if (expected.length !== actual.length)
    return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    const expectedByte = expected[i] ?? 0
    const actualByte = actual[i] ?? 0
    diff |= expectedByte ^ actualByte
  }
  return diff === 0
}
