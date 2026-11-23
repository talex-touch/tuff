/* eslint-disable no-console */
import type { NpmPackageIdentityIssue } from '@talex-touch/utils/plugin'
import path from 'node:path'
import process from 'node:process'
import {
  CURRENT_SDK_VERSION,
  formatPluginPackageViolation,
  getTuffPackageMetadataSource,
  hasTuffNpmDiscoveryKeyword,
  NPM_PLUGIN_CANONICAL_KEYWORD,
  validateNpmPackageIdentity,
  validatePluginPackagePolicy,
} from '@talex-touch/utils/plugin'
import fs from 'fs-extra'

export interface ValidateOptions {
  manifestPath: string
  strict: boolean
  npm?: boolean
}

function formatNpmIdentityIssue(issue: NpmPackageIdentityIssue): string {
  if (!issue.meta || Object.keys(issue.meta).length === 0)
    return `${issue.code} at ${issue.location}`
  const details = Object.entries(issue.meta)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ')
  return `${issue.code} at ${issue.location} (${details})`
}

export function parseValidateArgs(args: string[]): ValidateOptions {
  let strict = false
  let npm = false
  let manifestPath = path.resolve(process.cwd(), 'manifest.json')

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--strict') {
      strict = true
      continue
    }
    if (arg === '--npm') {
      npm = true
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

  return { manifestPath, strict, npm }
}

function validateSiblingPackageJson(
  packageJson: unknown,
  manifest: Record<string, unknown>,
  options: { enforceNpmPublishable: boolean },
  errors: string[],
  warnings: string[],
): void {
  const identityResult = validateNpmPackageIdentity({
    packageJson,
    manifest,
    requireNamingConvention: options.enforceNpmPublishable,
    requireDiscoveryKeyword: options.enforceNpmPublishable,
    allowLegacyKeyword: true,
    forbidPrivate: options.enforceNpmPublishable,
    forbidRuntimeDependencies: options.enforceNpmPublishable,
    forbidLifecycleScripts: options.enforceNpmPublishable,
  })

  if (!identityResult.ok) {
    for (const issue of identityResult.issues) {
      errors.push(formatNpmIdentityIssue(issue))
    }
  }

  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson))
    return

  const pkg = packageJson as Record<string, unknown>

  if (identityResult.ok && identityResult.classification.kind === 'explicit') {
    warnings.push(
      `package.json.name "${identityResult.packageName}" does not follow Tuff plugin npm conventions (@talex-touch/<slug>-plugin or tuff-plugin-<slug>)`,
    )
  }

  if (pkg.keywords !== undefined) {
    if (
      !Array.isArray(pkg.keywords)
      || pkg.keywords.some(item => typeof item !== 'string' || !item.trim())
    ) {
      errors.push('NPM_PACKAGE_KEYWORDS_INVALID at package.json.keywords (must be an array of non-empty strings)')
    }
    else if (!hasTuffNpmDiscoveryKeyword(pkg.keywords, { includeLegacy: true })) {
      if (!options.enforceNpmPublishable) {
        errors.push(
          `NPM_PACKAGE_DISCOVERY_KEYWORD_MISSING at package.json.keywords (expected=${NPM_PLUGIN_CANONICAL_KEYWORD})`,
        )
      }
    }
  }
  else if (!options.enforceNpmPublishable) {
    warnings.push(
      `package.json is missing discovery keyword "${NPM_PLUGIN_CANONICAL_KEYWORD}" in package.json.keywords`,
    )
  }

  const tuffMetadataSource = getTuffPackageMetadataSource(pkg)
  if (!tuffMetadataSource) {
    if (options.enforceNpmPublishable) {
      errors.push('NPM_PACKAGE_TUFF_METADATA_MISSING at package.json.tuff')
    }
    else {
      warnings.push('package.json is missing canonical "tuff" metadata block')
    }
  }
  else if (tuffMetadataSource === 'tuffPlugin') {
    warnings.push('package.json uses legacy "tuffPlugin" metadata block; migrate to canonical "tuff"')
  }
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

  const siblingPackageJsonPath = path.join(path.dirname(options.manifestPath), 'package.json')
  if (await fs.pathExists(siblingPackageJsonPath)) {
    let packageJson: unknown
    try {
      packageJson = await fs.readJson(siblingPackageJsonPath)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`Invalid JSON in package.json: ${message}`)
    }

    if (packageJson !== undefined) {
      validateSiblingPackageJson(
        packageJson,
        manifest,
        { enforceNpmPublishable: Boolean(options.npm) },
        errors,
        warnings,
      )
    }
  }
  else if (options.npm) {
    errors.push(`package.json not found alongside manifest: ${siblingPackageJsonPath}`)
  }

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
