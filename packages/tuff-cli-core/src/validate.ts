/* eslint-disable no-console */
import path from 'node:path'
import process from 'node:process'
import {
  CURRENT_SDK_VERSION,
  formatPluginPackageViolation,
  validatePluginPackagePolicy,
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

  const result = validatePluginPackagePolicy({
    profile: 'source-manifest',
    manifest,
  })
  const errors = result.ok
    ? []
    : result.violations.map(formatPluginPackageViolation)
  const warnings: string[] = []

  if (result.ok && result.identity.sdkapi < CURRENT_SDK_VERSION) {
    warnings.push(
      `Outdated sdkapi (${result.identity.sdkapi}). Recommended: ${CURRENT_SDK_VERSION}`,
    )
  }
  if (result.ok && result.identity.permissions.length === 0) {
    warnings.push('No declared permissions found in manifest.permissions')
  }
  if (options.strict && warnings.length > 0) {
    errors.push('Strict mode enabled: warnings treated as errors')
  }

  if (errors.length > 0) {
    errors.forEach(message => console.error(`✖ ${message}`))
    warnings.forEach(message => console.warn(`⚠ ${message}`))
    throw new Error(`Manifest validation failed (${errors.length} error(s))`)
  }

  console.log(`✔ Manifest is valid: ${options.manifestPath}`)
  warnings.forEach(message => console.warn(`⚠ ${message}`))
}
