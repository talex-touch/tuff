#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import {
  APP_INDEX_DIAGNOSTIC_EVIDENCE_KIND,
  APP_INDEX_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION,
  verifyAppIndexDiagnosticEvidence
} from '../src/main/modules/platform/app-index-diagnostic-verifier'
import type {
  AppIndexDiagnosticEvidencePayload,
  AppIndexDiagnosticGateOptions
} from '../src/main/modules/platform/app-index-diagnostic-verifier'
import type { AppIndexEntryLaunchKind } from '@talex-touch/utils/transport/events/types'

interface CliOptions extends AppIndexDiagnosticGateOptions {
  input?: string
  pretty: boolean
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input <evidence.json> [options]

Options:
  --input <path>              Read app-index diagnostic evidence JSON. Defaults to stdin.
  --requireSuccess            Require diagnosis.success and status=found.
  --requireQueryHit           Require at least one matched query stage.
  --requireLaunchKind <csv>   Require launchKind values, e.g. uwp,shortcut,path.
  --requireLaunchTarget       Require app.launchTarget.
  --requireLaunchArgs         Require app.launchArgs.
  --requireWorkingDirectory   Require app.workingDirectory.
  --requireBundleOrIdentity   Require app.bundleId or app.appIdentity.
  --requireCleanDisplayName   Require clean or fallback displayName status.
  --requireIcon               Require app.iconPresent=true.
  --requireReindex            Require successful reindex summary.
  --requireCaseIds <csv>      Require reusable manual regression case ids.
  --compact                   Print single-line JSON.
  --help                      Show this help.
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

function parseLaunchKinds(value: string | undefined): AppIndexEntryLaunchKind[] | undefined {
  const entries = parseCsv(value)
  if (!entries) return undefined

  const allowed = new Set(['path', 'shortcut', 'uwp'])
  const invalid = entries.filter((entry) => !allowed.has(entry))
  if (invalid.length > 0) {
    throw new Error(`Invalid launchKind: ${invalid.join(', ')}`)
  }
  return entries as AppIndexEntryLaunchKind[]
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
    if (arg === '--requireSuccess') {
      options.requireSuccess = true
      continue
    }
    if (arg === '--requireQueryHit') {
      options.requireQueryHit = true
      continue
    }
    if (arg === '--requireLaunchKind' && argv[i + 1]) {
      options.requireLaunchKind = parseLaunchKinds(argv[++i])
      continue
    }
    if (arg === '--requireLaunchTarget') {
      options.requireLaunchTarget = true
      continue
    }
    if (arg === '--requireLaunchArgs') {
      options.requireLaunchArgs = true
      continue
    }
    if (arg === '--requireWorkingDirectory') {
      options.requireWorkingDirectory = true
      continue
    }
    if (arg === '--requireBundleOrIdentity') {
      options.requireBundleOrIdentity = true
      continue
    }
    if (arg === '--requireCleanDisplayName') {
      options.requireCleanDisplayName = true
      continue
    }
    if (arg === '--requireIcon') {
      options.requireIcon = true
      continue
    }
    if (arg === '--requireReindex') {
      options.requireReindex = true
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

function parseEvidence(raw: string): AppIndexDiagnosticEvidencePayload {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('App index diagnostic evidence JSON must be an object')
  }

  const evidence = parsed as Partial<AppIndexDiagnosticEvidencePayload>
  if (
    evidence.schemaVersion !== APP_INDEX_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION ||
    evidence.kind !== APP_INDEX_DIAGNOSTIC_EVIDENCE_KIND
  ) {
    throw new Error('Unsupported app index diagnostic evidence schema')
  }
  if (!evidence.input || !evidence.diagnosis || !evidence.manualRegression) {
    throw new Error('App index diagnostic evidence JSON is missing required fields')
  }

  return evidence as AppIndexDiagnosticEvidencePayload
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const evidence = parseEvidence(await readInput(options))
  const verified = verifyAppIndexDiagnosticEvidence(evidence, options)
  console.log(JSON.stringify(verified, null, options.pretty ? 2 : 0))

  if (!verified.gate.passed) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
