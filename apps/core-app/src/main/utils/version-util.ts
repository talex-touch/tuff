import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fse from 'fs-extra'

/**
 * Get application version from package.json or environment variable
 * Priority: package.json > environment variable (APP_VERSION)
 *
 * @returns Application version string (e.g., "2.1.0")
 */
export function getAppVersion(): string {
  // Try to read from package.json first (priority 1)
  try {
    // Use the same path resolution as in polyfills.ts
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    // Go up from utils to main, then to core-app root
    const packageJsonPath = path.resolve(__dirname, '../../../package.json')

    if (fse.existsSync(packageJsonPath)) {
      const pkg = fse.readJsonSync(packageJsonPath)
      if (pkg.version) {
        return pkg.version
      }
    }
  }
  catch (error) {
    console.warn('[version-util] Failed to read version from package.json:', error)
  }

  // Fallback to environment variable (priority 2)
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION
  }

  // Last resort fallback
  console.error(
    '[version-util] Unable to determine version from package.json or APP_VERSION env var',
  )
  return '0.0.0'
}

/**
 * Get version from global package.json (if available)
 * This is faster as it uses the already-loaded package.json from polyfills.ts
 *
 * @returns Application version string or null if not available
 */
export function getAppVersionFromGlobal(): string | null {
  // @ts-ignore - globalThis.$pkg is defined in polyfills.ts
  if (typeof globalThis.$pkg !== 'undefined' && globalThis.$pkg?.version) {
    // @ts-ignore - globalThis.$pkg is defined in polyfills.ts
    return globalThis.$pkg.version
  }
  return null
}

/**
 * Get application version with fallback strategy
 * Uses global package.json if available, then package.json file, then env var
 *
 * @returns Application version string
 */
export function getAppVersionSafe(): string {
  // Try global first (fastest, already loaded in polyfills.ts)
  const globalVersion = getAppVersionFromGlobal()
  if (globalVersion) {
    return globalVersion
  }

  // Fallback to file read or env var
  return getAppVersion()
}
