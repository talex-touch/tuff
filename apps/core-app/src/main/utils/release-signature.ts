import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import axios from 'axios'

export interface SignatureVerificationResult {
  valid: boolean
  reason?: string
}

export class SignatureVerifier {
  private readonly keyCache = new Map<string, { key: string; fetchedAt: number }>()
  private readonly cacheTtlMs: number

  constructor(cacheTtlMs = 60 * 60 * 1000) {
    this.cacheTtlMs = cacheTtlMs
  }

  async verifyFileSignature(
    filePath: string,
    signatureUrl: string,
    signatureKeyUrl?: string
  ): Promise<SignatureVerificationResult> {
    const signaturePayload = await this.fetchSignaturePayload(signatureUrl)
    if (!signaturePayload) {
      return { valid: false, reason: 'Signature file not available' }
    }

    const publicKey = await this.fetchSignaturePublicKey(signatureUrl, signatureKeyUrl)
    if (!publicKey) {
      return { valid: false, reason: 'Signature public key not available' }
    }

    const signature = this.decodeSignaturePayload(signaturePayload)
    if (!signature) {
      return { valid: false, reason: 'Signature payload invalid' }
    }

    try {
      const fileBuffer = await fs.readFile(filePath)
      const isValid = crypto.verify('RSA-SHA256', fileBuffer, publicKey, signature)
      return { valid: isValid, reason: isValid ? undefined : 'Signature mismatch' }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''
      return { valid: false, reason: message || 'Signature verification failed' }
    }
  }

  private resolveSignatureKeyUrl(signatureUrl?: string, signatureKeyUrl?: string): string | null {
    if (signatureKeyUrl) {
      return signatureKeyUrl
    }

    const envUrl =
      process.env.TUFF_UPDATE_SIGNATURE_KEY_URL ||
      process.env.TUFF_RELEASE_SIGNATURE_KEY_URL ||
      process.env.TUFF_UPDATE_SIGNATURE_PUBLIC_KEY_URL ||
      process.env.TUFF_RELEASE_SIGNATURE_PUBLIC_KEY_URL

    if (envUrl) {
      return envUrl
    }

    if (signatureUrl) {
      try {
        const parsed = new URL(signatureUrl)
        if (parsed.pathname.includes('/api/releases/')) {
          return `${parsed.origin}/api/releases/signing-key`
        }
      } catch {
        return null
      }
    }

    return null
  }

  private async fetchSignaturePublicKey(
    signatureUrl?: string,
    signatureKeyUrl?: string
  ): Promise<string | null> {
    const resolvedUrl = this.resolveSignatureKeyUrl(signatureUrl, signatureKeyUrl)
    if (!resolvedUrl) {
      return null
    }

    const cached = this.keyCache.get(resolvedUrl)
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return cached.key
    }

    try {
      const response = await axios.get(resolvedUrl, {
        timeout: 8000,
        headers: {
          Accept: 'application/json,text/plain',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      })

      let key: string | null = null
      if (typeof response.data === 'string') {
        const raw = response.data.trim()
        if (raw.startsWith('{')) {
          try {
            const parsed = JSON.parse(raw) as { publicKey?: string; key?: string }
            key = parsed.publicKey || parsed.key || null
          } catch {
            key = raw
          }
        } else {
          key = raw
        }
      } else if (response.data && typeof response.data.publicKey === 'string') {
        key = response.data.publicKey
      } else if (response.data && typeof response.data.key === 'string') {
        key = response.data.key
      }

      if (!key || !key.trim()) {
        return null
      }

      const normalizedKey = key.trim()
      this.keyCache.set(resolvedUrl, {
        key: normalizedKey,
        fetchedAt: Date.now()
      })

      return normalizedKey
    } catch (error) {
      console.warn('[SignatureVerifier] Failed to fetch signature public key:', error)
      return null
    }
  }

  private async fetchSignaturePayload(signatureUrl: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(signatureUrl, {
        timeout: 10000,
        responseType: 'arraybuffer',
        headers: {
          Accept: '*/*',
          'User-Agent': 'TalexTouch-Updater/2.0'
        }
      })

      if (!response.data) {
        return null
      }

      return Buffer.from(response.data)
    } catch (error) {
      console.warn('[SignatureVerifier] Failed to fetch signature payload:', error)
      return null
    }
  }

  private decodeSignaturePayload(payload: Buffer): Buffer | null {
    if (!payload.length) {
      return null
    }

    const text = payload.toString('utf8').trim()
    if (!text) {
      return payload
    }

    if (text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text) as { signature?: string }
        if (typeof parsed.signature === 'string' && parsed.signature.trim()) {
          return this.decodeSignatureString(parsed.signature)
        }
      } catch {
        return this.decodeSignatureString(text) || payload
      }
    }

    return this.decodeSignatureString(text) || payload
  }

  private decodeSignatureString(signature: string): Buffer | null {
    const trimmed = signature.trim()
    if (!trimmed) {
      return null
    }

    const withoutPem = trimmed
      .replace(/-----BEGIN[\s\S]*?-----/g, '')
      .replace(/-----END[\s\S]*?-----/g, '')
    const compact = withoutPem.replace(/\s+/g, '')

    if (/^[0-9a-f]+$/i.test(compact) && compact.length % 2 === 0) {
      return Buffer.from(compact, 'hex')
    }

    if (/^[A-Z0-9+/=]+$/i.test(compact)) {
      try {
        return Buffer.from(compact, 'base64')
      } catch {
        return null
      }
    }

    return Buffer.from(trimmed)
  }
}
