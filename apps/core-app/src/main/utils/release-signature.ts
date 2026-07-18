import crypto from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { getNetworkService } from '../modules/network'
import { createLogger } from './logger'

const signatureVerifierLog = createLogger('SignatureVerifier')

export interface SignatureVerificationResult {
  valid: boolean
  reason?: string
}

export interface ReleaseSigningTrustRootEnvironment {
  appPath: string
  resourcesPath?: string
  cwd: string
}

export function releaseSigningPublicKeyCandidates(
  environment: ReleaseSigningTrustRootEnvironment = {
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath || undefined,
    cwd: process.cwd()
  }
): string[] {
  const relativePath = path.join('resources', 'keys', 'release-signing-public.pem')
  return [
    path.join(environment.appPath, relativePath),
    ...(environment.resourcesPath
      ? [
          path.join(environment.resourcesPath, 'app', relativePath),
          path.join(environment.resourcesPath, relativePath)
        ]
      : []),
    path.join(environment.cwd, relativePath)
  ]
}

export class SignatureVerifier {
  private embeddedKeyCache: string | null = null

  async verifyFileSignature(
    filePath: string,
    signatureUrl: string
  ): Promise<SignatureVerificationResult> {
    const signaturePayload = await this.fetchSignaturePayload(signatureUrl)
    if (!signaturePayload) {
      return { valid: false, reason: 'Signature file not available' }
    }
    return await this.verifySignaturePayload(filePath, signaturePayload)
  }

  async verifyFileSignatureWithCache(
    filePath: string,
    signatureUrl: string,
    signatureCachePath: string
  ): Promise<SignatureVerificationResult> {
    let signaturePayload: Buffer | null = null
    try {
      signaturePayload = await fs.readFile(signatureCachePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        return { valid: false, reason: 'Signature cache is unreadable' }
      }
    }

    if (!signaturePayload) {
      signaturePayload = await this.fetchSignaturePayload(signatureUrl)
      if (!signaturePayload) {
        return { valid: false, reason: 'Signature file not available' }
      }
      await fs.mkdir(path.dirname(signatureCachePath), { recursive: true })
      const tempPath = `${signatureCachePath}.${process.pid}.tmp`
      await fs.writeFile(tempPath, signaturePayload, { mode: 0o600 })
      await fs.rename(tempPath, signatureCachePath)
    }

    return await this.verifySignaturePayload(filePath, signaturePayload)
  }

  private async verifySignaturePayload(
    filePath: string,
    signaturePayload: Buffer
  ): Promise<SignatureVerificationResult> {
    const publicKey = await this.fetchSignaturePublicKey()
    if (!publicKey) {
      return { valid: false, reason: 'Embedded signature public key not available' }
    }

    const signature = this.decodeSignaturePayload(signaturePayload)
    if (!signature) {
      return { valid: false, reason: 'Signature payload invalid' }
    }

    try {
      const verifier = crypto.createVerify('RSA-SHA256')
      for await (const chunk of createReadStream(filePath)) {
        verifier.update(chunk)
      }
      verifier.end()
      const isValid = verifier.verify(publicKey, signature)
      return { valid: isValid, reason: isValid ? undefined : 'Signature mismatch' }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''
      return { valid: false, reason: message || 'Signature verification failed' }
    }
  }

  private async loadEmbeddedPublicKey(): Promise<string | null> {
    if (this.embeddedKeyCache !== null) {
      return this.embeddedKeyCache || null
    }
    const candidates = releaseSigningPublicKeyCandidates()
    for (const candidate of candidates) {
      try {
        const key = (await fs.readFile(candidate, 'utf8')).trim()
        if (key) {
          this.embeddedKeyCache = key
          return key
        }
      } catch {
        // try the next candidate path
      }
    }
    this.embeddedKeyCache = ''
    return null
  }

  private async fetchSignaturePublicKey(): Promise<string | null> {
    return this.loadEmbeddedPublicKey()
  }

  private async fetchSignaturePayload(signatureUrl: string): Promise<Buffer | null> {
    try {
      const response = await getNetworkService().request<ArrayBuffer>({
        method: 'GET',
        url: signatureUrl,
        timeoutMs: 10000,
        responseType: 'arrayBuffer',
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
      signatureVerifierLog.warn('Failed to fetch signature payload', {
        meta: { reason: error instanceof Error ? error.message : String(error) }
      })
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
