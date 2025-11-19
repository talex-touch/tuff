import path from 'node:path'

import fse from 'fs-extra'

/**
 * Get application version from package.json or environment variable
 * Priority: package.json > environment variable (APP_VERSION)
 *
 * @returns Application version string (e.g., "2.1.0")
 */
export function getAppVersion(): string {
  // Priority 1: Environment variable (set by polyfills.ts or build process)
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION
  }

  // Priority 2: Global package object (set by polyfills.ts)
  // @ts-ignore - globalThis.$pkg is defined in polyfills.ts
  if (typeof globalThis.$pkg !== 'undefined' && globalThis.$pkg?.version) {
    // @ts-ignore
    return globalThis.$pkg.version
  }

  // Priority 3: Try to read from package.json using process.env.DIST
  try {
    const distPath = process.env.DIST || path.join(__dirname, '..')
    const packageJsonPath = path.resolve(distPath, '../../package.json')

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
