/* eslint-disable no-console */
import path from 'node:path'
import process from 'node:process'
import {
  normalizePermissionId,
  permissionRegistry,
} from '@talex-touch/utils/permission'
import {
  CATEGORY_REQUIRED_MIN_VERSION,
  checkSdkCompatibility,
  CURRENT_SDK_VERSION,
  resolveSdkApiVersion,
} from '@talex-touch/utils/plugin'
import fs from 'fs-extra'

export interface ValidateOptions {
  manifestPath: string
  strict: boolean
}

export function parseValidateArgs(args: string[]): ValidateOptions {
  let strict = false
  let manifestPath = path.resolve(process.cwd(), 'manifest.json')

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--strict') {
      strict = true
      continue
    }
    if (arg === '--manifest') {
      const next = args[i + 1]
      if (!next || next.startsWith('-')) {
        throw new Error('Missing value for --manifest')
      }
      manifestPath = path.resolve(process.cwd(), next)
      i += 1
      continue
    }
    if (arg.startsWith('--manifest=')) {
      const value = arg.slice('--manifest='.length)
      if (!value) {
        throw new Error('Missing value for --manifest')
      }
      manifestPath = path.resolve(process.cwd(), value)
    }
  }

  return { manifestPath, strict }
}

export function collectRawPermissionIds(manifest: Record<string, unknown>): string[] {
  const permissions = manifest.permissions
  if (Array.isArray(permissions)) {
    return permissions.filter((id): id is string => typeof id === 'string')
  }
  if (!permissions || typeof permissions !== 'object') {
    return []
  }
  const required = Array.isArray((permissions as { required?: unknown }).required)
    ? ((permissions as { required?: unknown[] }).required || [])
    : []
  const optional = Array.isArray((permissions as { optional?: unknown }).optional)
    ? ((permissions as { optional?: unknown[] }).optional || [])
    : []
  return [...required, ...optional].filter((id): id is string => typeof id === 'string')
}

export async function runValidate(args: string[] = []): Promise<void> {
  const options = parseValidateArgs(args)
  if (!(await fs.pathExists(options.manifestPath))) {
    throw new Error(`Manifest not found: ${options.manifestPath}`)
  }

  let manifest: Record<string, unknown>
  try {
    manifest = (await fs.readJson(options.manifestPath)) as Record<string, unknown>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON in manifest: ${message}`)
  }

  const errors: string[] = []
  const warnings: string[] = []

  const name = typeof manifest.name === 'string' ? manifest.name.trim() : ''
  if (!name) {
    errors.push('Missing required field: "name"')
  }
  const version = typeof manifest.version === 'string' ? manifest.version.trim() : ''
  if (!version) {
    errors.push('Missing required field: "version"')
  }

  const sdkapi = manifest.sdkapi
  const sdkCompatibility = checkSdkCompatibility(sdkapi, name || 'plugin')
  const resolvedSdkapi = resolveSdkApiVersion(sdkapi)
  if (!sdkCompatibility.compatible) {
    errors.push(sdkCompatibility.warning ?? `Invalid "sdkapi". Current required sdkapi: ${CURRENT_SDK_VERSION}`)
  }
  else if (typeof resolvedSdkapi === 'number' && resolvedSdkapi < CURRENT_SDK_VERSION) {
    warnings.push(`Outdated sdkapi (${resolvedSdkapi}). Recommended: ${CURRENT_SDK_VERSION}`)
  }

  const category = typeof manifest.category === 'string' ? manifest.category.trim() : ''
  if (
    typeof resolvedSdkapi === 'number'
    && resolvedSdkapi >= CATEGORY_REQUIRED_MIN_VERSION
    && !category
  ) {
    errors.push(
      `Missing required "category" when sdkapi >= ${CATEGORY_REQUIRED_MIN_VERSION}`,
    )
  }

  const rawPermissionIds = collectRawPermissionIds(manifest)
  const normalizedPermissionIds = [...new Set(rawPermissionIds.map(id => normalizePermissionId(id)))]
  const unknownPermissions = normalizedPermissionIds.filter(id => !permissionRegistry.has(id))
  if (unknownPermissions.length > 0) {
    errors.push(`Unknown permissions: ${unknownPermissions.join(', ')}`)
  }

  if (normalizedPermissionIds.length === 0) {
    warnings.push('No declared permissions found in manifest.permissions')
  }

  const resultWarnings = options.strict ? [...warnings] : warnings
  if (options.strict && warnings.length > 0) {
    errors.push('Strict mode enabled: warnings treated as errors')
  }

  if (errors.length > 0) {
    errors.forEach(message => console.error(`✖ ${message}`))
    if (resultWarnings.length > 0) {
      resultWarnings.forEach(message => console.warn(`⚠ ${message}`))
    }
    throw new Error(`Manifest validation failed (${errors.length} error(s))`)
  }

  console.log(`✔ Manifest is valid: ${options.manifestPath}`)
  if (warnings.length > 0) {
    warnings.forEach(message => console.warn(`⚠ ${message}`))
  }
}
