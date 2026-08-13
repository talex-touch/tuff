import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Generates SHA-256 hashes for a list of files.
 * @param filePaths - An array of absolute file paths.
 * @param baseDir - The base directory to make file paths relative.
 * @returns A record of relative file paths to their SHA-256 hashes.
 */
export function generateFilesSha256(filePaths: string[], baseDir: string): Record<string, string> {
  const hashes: Record<string, string> = {}
  for (const filePath of filePaths) {
    const fileContent = fs.readFileSync(filePath)
    const hash = crypto.createHash('sha256').update(fileContent).digest('hex')
    const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/')
    hashes[relativePath] = `sha256-${hash}`
  }
  return hashes
}

/**
 * Generates a signature for the files object.
 * The signature is a Base64 encoded MD5 hash of the sorted JSON string of the files object.
 * @param filesObject - The object containing file paths and their hashes.
 * @returns The Base64 encoded signature.
 */
function canonicalFileMapJson(filesObject: Record<string, string>): string {
  const sortedKeys = Object.keys(filesObject).sort()
  const sortedObject: Record<string, string> = {}
  for (const key of sortedKeys) {
    sortedObject[key] = filesObject[key]
  }
  return JSON.stringify(sortedObject)
}

/**
 * A checksum over the file map, written to manifest._signature.
 *
 * Despite the field name this carries no authenticity: it is unkeyed, so anyone repacking the
 * archive recomputes it along with the per-file hashes it covers. Publisher authenticity comes
 * from the separate keyed envelope in pluginSigning, and nothing should read a passing value
 * here as provenance (#893).
 *
 * SHA-256 rather than the previous MD5. The change is not what makes the field safe — it was
 * never a signature — but a collision-broken digest has no place in a field with this name,
 * and verifiers accept both so existing packages keep validating.
 */
export function generateSignature(filesObject: Record<string, string>): string {
  return crypto.createHash('sha256').update(canonicalFileMapJson(filesObject)).digest('base64')
}

/** The pre-2026-08 digest, still accepted by verifiers for packages built before the change. */
export function generateLegacySignature(filesObject: Record<string, string>): string {
  return crypto.createHash('md5').update(canonicalFileMapJson(filesObject)).digest('base64')
}
