/* eslint-disable no-console */
import type {
  PluginSecurityScanReport,
  PluginSecurityScanWaiver,
} from '@talex-touch/utils/plugin'
import process from 'node:process'
import { scanPluginPackage } from '@talex-touch/utils/plugin'
import fs from 'fs-extra'
import { globSync } from 'glob'
import path from 'pathe'
import { readTpexSecurityScanInput } from './tpex-security-reader'

export interface ScanBuiltPluginPackageOptions {
  packagePath: string
  waivers?: readonly PluginSecurityScanWaiver[]
}

export interface SecurityScanCliOptions {
  root: string
  packagePath?: string
  waiversPath?: string
  json: boolean
}

/**
 * Conventional waiver file, looked up in the plugin root when `--waivers` is not given.
 */
export const SECURITY_WAIVERS_FILENAME = 'security-waivers.json'

const WAIVER_REQUIRED_FIELDS = [
  'id',
  'ruleId',
  'owner',
  'reason',
  'createdAt',
  'expiresAt',
] as const

/** At least one of these must be present; a waiver with no scope would cover everything. */
const WAIVER_SCOPE_FIELDS = ['artifactSha256', 'fileSha256'] as const

function describeWaiverLocation(filePath: string, index: number): string {
  return `${filePath} [${index}]`
}

/**
 * Reads and validates a waiver file.
 *
 * Every entry must be complete. A malformed entry is a hard error rather than a skipped one:
 * silently dropping it would surface as "the finding is still blocked" with no hint that the
 * waiver itself was the problem, which is exactly when someone reaches for a blanket bypass.
 */
export function loadSecurityScanWaivers(filePath: string): PluginSecurityScanWaiver[] {
  if (!fs.pathExistsSync(filePath))
    throw new Error(`Security waiver file not found: ${filePath}`)

  let parsed: unknown
  try {
    parsed = fs.readJsonSync(filePath)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Security waiver file is not valid JSON (${filePath}): ${message}`)
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { waivers?: unknown })?.waivers)
      ? (parsed as { waivers: unknown[] }).waivers
      : undefined

  if (!entries)
    throw new Error(`Security waiver file must be an array or { "waivers": [...] }: ${filePath}`)

  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object')
      throw new Error(`Security waiver must be an object: ${describeWaiverLocation(filePath, index)}`)

    const record = entry as Record<string, unknown>
    for (const field of WAIVER_REQUIRED_FIELDS) {
      const value = record[field]
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(
          `Security waiver is missing "${field}": ${describeWaiverLocation(filePath, index)}`,
        )
      }
    }

    for (const field of ['createdAt', 'expiresAt'] as const) {
      if (!Number.isFinite(Date.parse(String(record[field])))) {
        throw new TypeError(
          `Security waiver has an invalid "${field}" timestamp: ${describeWaiverLocation(filePath, index)}`,
        )
      }
    }

    const scopes = WAIVER_SCOPE_FIELDS.filter(
      field => typeof record[field] === 'string' && String(record[field]).trim(),
    )
    if (!scopes.length) {
      throw new Error(
        `Security waiver needs "fileSha256" or "artifactSha256": ${describeWaiverLocation(filePath, index)}`,
      )
    }

    return {
      id: String(record.id),
      ruleId: String(record.ruleId),
      owner: String(record.owner),
      reason: String(record.reason),
      createdAt: String(record.createdAt),
      expiresAt: String(record.expiresAt),
      ...(scopes.includes('artifactSha256')
        ? { artifactSha256: String(record.artifactSha256) }
        : {}),
      ...(scopes.includes('fileSha256') ? { fileSha256: String(record.fileSha256) } : {}),
      ...(typeof record.ticket === 'string' && record.ticket.trim()
        ? { ticket: record.ticket }
        : {}),
    } as PluginSecurityScanWaiver
  })
}

/**
 * Resolves waivers for a build: the explicit path when given, otherwise the conventional file
 * in the plugin root. Returns an empty list when neither exists — absence of waivers is normal.
 */
export function resolveSecurityScanWaivers(options: {
  root: string
  waiversPath?: string
}): PluginSecurityScanWaiver[] {
  if (options.waiversPath)
    return loadSecurityScanWaivers(options.waiversPath)

  const conventional = path.join(options.root, SECURITY_WAIVERS_FILENAME)
  return fs.pathExistsSync(conventional) ? loadSecurityScanWaivers(conventional) : []
}

function resolveLatestTpex(root: string): string | undefined {
  const candidates = globSync('*.tpex', {
    cwd: root,
    absolute: true,
    nodir: true,
  }).map(filePath => ({
    filePath,
    mtimeMs: fs.statSync(filePath).mtimeMs,
  }))
  return candidates
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]
    ?.filePath
}

export function scanBuiltPluginPackage(
  options: ScanBuiltPluginPackageOptions,
): PluginSecurityScanReport {
  const archive = readTpexSecurityScanInput(options.packagePath)
  return scanPluginPackage({
    artifactSha256: archive.artifactSha256,
    policyVersion: archive.policy.policyVersion,
    policyPassed: archive.policy.ok && archive.integrityPassed,
    manifest: archive.manifest,
    files: archive.files,
    waivers: options.waivers,
  })
}

export function assertPluginSecurityScan(
  report: PluginSecurityScanReport,
  waivers: readonly PluginSecurityScanWaiver[] = [],
): void {
  if (report.decision === 'passed' || report.decision === 'review-required')
    return
  const blocking = report.findings.find(finding => !finding.waiver)
  const code = report.failure?.code ?? blocking?.code ?? 'PLUGIN_SCAN_BLOCKED'

  // An artifact-scoped waiver is bound to a digest that changes on every rebuild. Without this
  // hint the second build after writing one fails identically to the first, and the obvious
  // conclusion is that waivers do not work at all.
  const staleArtifact = blocking && waivers.find(waiver =>
    waiver.ruleId === blocking.ruleId
    && waiver.artifactSha256
    && waiver.artifactSha256 !== report.artifactSha256)
  const staleFile = blocking && waivers.find(waiver =>
    waiver.ruleId === blocking.ruleId
    && waiver.fileSha256
    && waiver.fileSha256 !== blocking.fileSha256)

  let hint = ''
  if (staleArtifact) {
    hint = ` A waiver exists for ${blocking.ruleId} but targets a different artifact.`
      + ` The .tpex digest changes on every rebuild — scope the waiver with fileSha256`
      + ` ${blocking.fileSha256 ?? '(unavailable for this finding)'} instead.`
  }
  else if (staleFile) {
    hint = ` A waiver exists for ${blocking.ruleId} but targets different file contents.`
      + ` ${blocking.location.path} is now ${blocking.fileSha256}.`
  }

  throw new Error(`Plugin security scan rejected package: ${code}.${hint}`)
}

function requireValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`)
  }
  return value
}

export function parseSecurityScanArgs(
  args: readonly string[],
  cwd = process.cwd(),
): SecurityScanCliOptions {
  let root = cwd
  let packagePath: string | undefined
  let waiversPath: string | undefined
  let json = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--json') {
      json = true
    }
    else if (arg === '--root') {
      root = path.resolve(cwd, requireValue(args, index, arg))
      index += 1
    }
    else if (arg === '--package') {
      packagePath = path.resolve(cwd, requireValue(args, index, arg))
      index += 1
    }
    else if (arg === '--waivers') {
      waiversPath = path.resolve(cwd, requireValue(args, index, arg))
      index += 1
    }
    else {
      throw new Error(`Unknown security scan option: ${arg}`)
    }
  }

  return {
    root,
    packagePath,
    waiversPath,
    json,
  }
}

function printHumanReport(report: PluginSecurityScanReport): void {
  console.log(`Security scan: ${report.decision}`)
  console.log(`Artifact: ${report.artifactSha256}`)
  console.log(`Rules: ${report.ruleSetVersion}; files: ${report.inspectedFiles}; bytes: ${report.inspectedBytes}`)
  for (const finding of report.findings) {
    const position = finding.location.line
      ? `:${finding.location.line}:${finding.location.column ?? 1}`
      : ''
    const waived = finding.waiver ? ` [waived by ${finding.waiver.owner}]` : ''
    console.log(`- ${finding.severity} ${finding.code} ${finding.location.path}${position}${waived}`)
  }
  if (report.failure)
    console.log(`Failure: ${report.failure.code}`)
}

export async function runSecurityScan(args: readonly string[]): Promise<PluginSecurityScanReport> {
  const options = parseSecurityScanArgs(args)
  const packagePath = options.packagePath ?? resolveLatestTpex(path.join(options.root, 'dist'))
  if (!packagePath || !fs.pathExistsSync(packagePath)) {
    throw new Error('No .tpex package found. Build the plugin or pass --package <path>.')
  }
  const waivers = resolveSecurityScanWaivers({
    root: options.root,
    waiversPath: options.waiversPath,
  })
  const report = scanBuiltPluginPackage({ packagePath, waivers })
  if (options.json)
    console.log(JSON.stringify(report))
  else printHumanReport(report)
  assertPluginSecurityScan(report, waivers)
  return report
}
