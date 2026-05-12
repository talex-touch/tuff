#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import {
  UPDATE_DIAGNOSTIC_EVIDENCE_KIND,
  UPDATE_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION,
  verifyUpdateDiagnosticEvidence
} from '../src/main/modules/platform/update-diagnostic-verifier'
import type {
  UpdateDiagnosticEvidencePayload,
  UpdateDiagnosticGateOptions,
  UpdateDiagnosticInstallMode
} from '../src/main/modules/platform/update-diagnostic-verifier'

interface CliOptions extends UpdateDiagnosticGateOptions {
  input?: string
  pretty: boolean
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run update:diagnostic:verify -- --input <evidence.json> [options]

Options:
  --input <path>                 Read update diagnostic evidence JSON. Defaults to stdin.
  --requireSettingsEnabled       Require update settings enabled.
  --requireAutoDownload          Require autoDownload=true.
  --requireDownloadReady         Require downloaded update status.
  --requireReadyToInstall        Require verdict.readyToInstall.
  --requirePlatform <csv>        Require runtime platform values, e.g. win32.
  --requireArch <csv>            Require runtime arch values, e.g. x64,arm64.
  --requireInstallMode <csv>     Require install mode, e.g. windows-installer-handoff.
  --requireUserConfirmation      Require user-confirmed handoff/manual install path.
  --requireAutoInstallEnabled    Require autoInstallDownloadedUpdates=true.
  --requireUnattendedDisabled    Require unattended auto install disabled.
  --requireUnattendedEnabled     Require unattended auto install enabled.
  --requireCachedRelease         Require cached release summary.
  --requireMatchingAsset         Require at least one matching runtime asset.
  --requireChecksums             Require checksums on all matching assets.
  --requireInstalledVersion      Require installed app version evidence.
  --requireInstalledVersionMatchesTarget
                                  Require installed version to match the target update version.
  --requireCaseIds <csv>         Require reusable manual regression case ids.
  --compact                      Print single-line JSON.
  --help                         Show this help.
`)
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined
  const entries = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return entries.length > 0 ? Array.from(new Set(entries)) : undefined
}

function parseInstallModes(value: string | undefined): UpdateDiagnosticInstallMode[] | undefined {
  const entries = parseCsv(value)
  if (!entries) return undefined

  const allowed = new Set([
    'mac-auto-updater',
    'windows-installer-handoff',
    'windows-auto-installer-handoff',
    'manual-installer',
    'not-ready'
  ])
  const invalid = entries.filter((entry) => !allowed.has(entry))
  if (invalid.length > 0) {
    throw new Error(`Invalid update installMode: ${invalid.join(', ')}`)
  }
  return entries as UpdateDiagnosticInstallMode[]
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    pretty: true
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--input' && argv[i + 1]) {
      options.input = argv[++i]
      continue
    }
    if (arg === '--requireSettingsEnabled') {
      options.requireSettingsEnabled = true
      continue
    }
    if (arg === '--requireAutoDownload') {
      options.requireAutoDownload = true
      continue
    }
    if (arg === '--requireDownloadReady') {
      options.requireDownloadReady = true
      continue
    }
    if (arg === '--requireReadyToInstall') {
      options.requireReadyToInstall = true
      continue
    }
    if (arg === '--requirePlatform' && argv[i + 1]) {
      options.requirePlatform = parseCsv(argv[++i])
      continue
    }
    if (arg === '--requireArch' && argv[i + 1]) {
      options.requireArch = parseCsv(argv[++i])
      continue
    }
    if (arg === '--requireInstallMode' && argv[i + 1]) {
      options.requireInstallMode = parseInstallModes(argv[++i])
      continue
    }
    if (arg === '--requireUserConfirmation') {
      options.requireUserConfirmation = true
      continue
    }
    if (arg === '--requireAutoInstallEnabled') {
      options.requireAutoInstallEnabled = true
      continue
    }
    if (arg === '--requireUnattendedDisabled') {
      options.requireUnattendedDisabled = true
      continue
    }
    if (arg === '--requireUnattendedEnabled') {
      options.requireUnattendedEnabled = true
      continue
    }
    if (arg === '--requireCachedRelease') {
      options.requireCachedRelease = true
      continue
    }
    if (arg === '--requireMatchingAsset') {
      options.requireMatchingAsset = true
      continue
    }
    if (arg === '--requireChecksums') {
      options.requireChecksums = true
      continue
    }
    if (arg === '--requireInstalledVersion') {
      options.requireInstalledVersion = true
      continue
    }
    if (arg === '--requireInstalledVersionMatchesTarget') {
      options.requireInstalledVersionMatchesTarget = true
      continue
    }
    if (arg === '--requireCaseIds' && argv[i + 1]) {
      options.requireCaseIds = parseCsv(argv[++i])
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function readInput(options: CliOptions): Promise<string> {
  if (options.input) {
    return readFile(options.input, 'utf8')
  }
  return readStdin()
}

function parseEvidence(raw: string): UpdateDiagnosticEvidencePayload {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Update diagnostic evidence JSON must be an object')
  }

  const evidence = parsed as Partial<UpdateDiagnosticEvidencePayload>
  if (
    evidence.schemaVersion !== UPDATE_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION ||
    evidence.kind !== UPDATE_DIAGNOSTIC_EVIDENCE_KIND
  ) {
    throw new Error('Unsupported update diagnostic evidence schema')
  }
  if (
    !evidence.status ||
    !evidence.runtimeTarget ||
    !evidence.verdict ||
    !evidence.manualRegression
  ) {
    throw new Error('Update diagnostic evidence JSON is missing required fields')
  }

  return evidence as UpdateDiagnosticEvidencePayload
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const evidence = parseEvidence(await readInput(options))
  const verified = verifyUpdateDiagnosticEvidence(evidence, options)
  console.log(JSON.stringify(verified, null, options.pretty ? 2 : 0))

  if (!verified.gate.passed) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
