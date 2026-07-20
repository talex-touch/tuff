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
  json: boolean
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

export function assertPluginSecurityScan(report: PluginSecurityScanReport): void {
  if (report.decision === 'passed' || report.decision === 'review-required')
    return
  const code = report.failure?.code
    ?? report.findings.find(finding => !finding.waiver)?.code
    ?? 'PLUGIN_SCAN_BLOCKED'
  throw new Error(`Plugin security scan rejected package: ${code}`)
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
    else {
      throw new Error(`Unknown security scan option: ${arg}`)
    }
  }

  return {
    root,
    packagePath,
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
  const report = scanBuiltPluginPackage({ packagePath })
  if (options.json)
    console.log(JSON.stringify(report))
  else printHumanReport(report)
  assertPluginSecurityScan(report)
  return report
}
