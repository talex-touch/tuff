import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import process from 'node:process'
import { createError } from 'h3'

const ENC_PREFIX = 'enc:v1'
const MIN_KEY_LENGTH = 16

function normalizeSecret(value: unknown): string {
  return String(value || '').trim()
}

function requireEncryptionSecret(): string {
  const secret = normalizeSecret(process.env.PILOT_CONFIG_ENCRYPTION_KEY)
  if (secret.length < MIN_KEY_LENGTH) {
    throw createError({
      statusCode: 500,
      statusMessage: 'PILOT_CONFIG_ENCRYPTION_KEY is not configured.',
    })
  }
  return secret
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest()
}

function toHex(value: Buffer): string {
  return value.toString('hex')
}

function fromHex(value: string): Buffer {
  return Buffer.from(value, 'hex')
}

export function isEncryptedConfigValue(value: string): boolean {
  return String(value || '').trim().startsWith(`${ENC_PREFIX}:`)
}

export function encryptConfigValue(plainText: string): string {
  const raw = String(plainText || '')
  if (!raw) {
    return ''
  }

  const secret = requireEncryptionSecret()
  const key = deriveKey(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(raw, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return `${ENC_PREFIX}:${toHex(iv)}:${toHex(encrypted)}:${toHex(authTag)}`
}

export function decryptConfigValue(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }
  if (!isEncryptedConfigValue(raw)) {
    return raw
  }

  const [prefix, ivHex, encryptedHex, authTagHex] = raw.split(':')
  if (prefix !== ENC_PREFIX || !ivHex || !encryptedHex || !authTagHex) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Encrypted config payload is invalid.',
    })
  }

  const secret = requireEncryptionSecret()
  const key = deriveKey(secret)
  const decipher = createDecipheriv('aes-256-gcm', key, fromHex(ivHex))
  decipher.setAuthTag(fromHex(authTagHex))
  const decrypted = Buffer.concat([
    decipher.update(fromHex(encryptedHex)),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
