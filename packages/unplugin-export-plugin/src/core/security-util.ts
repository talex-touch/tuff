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
    const relativePath = path.relative(baseDir, filePath)
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
export function generateSignature(filesObject: Record<string, string>): string {
  const sortedKeys = Object.keys(filesObject).sort()
  const sortedObject: Record<string, string> = {}
  for (const key of sortedKeys) {
    sortedObject[key] = filesObject[key]
  }
  const jsonString = JSON.stringify(sortedObject)
  const md5Hash = crypto.createHash('md5').update(jsonString).digest('base64')
  return md5Hash
}