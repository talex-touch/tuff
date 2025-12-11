import crypto from 'node:crypto'
import fse from 'fs-extra'

export interface SignatureVerificationResult {
  valid: boolean
  reason?: string
  signature?: string
  expectedSignature?: string
}

export interface VersionSignatureInfo {
  signature: string
  packageSize: number
}

/**
 * Verify plugin package signature
 * Uses SHA-256 hash of file content compared against expected signature
 */
export async function verifyPackageSignature(
  filePath: string,
  expectedSignature?: string,
  expectedSize?: number,
): Promise<SignatureVerificationResult> {
  try {
    // Check file exists
    if (!(await fse.pathExists(filePath))) {
      return {
        valid: false,
        reason: 'Package file not found',
      }
    }

    // Read file and compute hash
    const fileBuffer = await fse.readFile(filePath)
    const actualSize = fileBuffer.length

    // Verify file size if expected
    if (expectedSize !== undefined && actualSize !== expectedSize) {
      return {
        valid: false,
        reason: `File size mismatch: expected ${expectedSize}, got ${actualSize}`,
      }
    }

    // Compute SHA-256 signature
    const hash = crypto.createHash('sha256')
    hash.update(fileBuffer)
    const computedSignature = hash.digest('hex')

    // If no expected signature provided, just return computed one
    if (!expectedSignature) {
      return {
        valid: true,
        signature: computedSignature,
        reason: 'No signature to verify against',
      }
    }

    // Compare signatures
    const normalizedExpected = expectedSignature.toLowerCase().trim()
    const normalizedComputed = computedSignature.toLowerCase()

    if (normalizedExpected === normalizedComputed) {
      return {
        valid: true,
        signature: computedSignature,
      }
    }

    return {
      valid: false,
      reason: 'Signature mismatch',
      signature: computedSignature,
      expectedSignature: normalizedExpected,
    }
  }
  catch (error: any) {
    return {
      valid: false,
      reason: error?.message || 'Failed to verify signature',
    }
  }
}

/**
 * Extract signature info from API version metadata
 */
export function extractSignatureInfo(
  metadata?: Record<string, unknown>,
): VersionSignatureInfo | undefined {
  if (!metadata)
    return undefined

  const signature = metadata.signature
  const packageSize = metadata.packageSize

  if (typeof signature !== 'string' || !signature.trim())
    return undefined

  return {
    signature: signature.trim(),
    packageSize: typeof packageSize === 'number' ? packageSize : 0,
  }
}
