#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import {
  EVERYTHING_DIAGNOSTIC_EVIDENCE_KIND,
  EVERYTHING_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION,
  verifyEverythingDiagnosticEvidence
} from '../src/main/modules/platform/everything-diagnostic-verifier'
import type {
  EverythingDiagnosticEvidencePayload,
  EverythingDiagnosticGateOptions
} from '../src/main/modules/platform/everything-diagnostic-verifier'
import type { EverythingBackendType } from '../src/shared/events/everything'

interface CliOptions extends EverythingDiagnosticGateOptions {
  input?: string
  pretty: boolean
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run everything:diagnostic:verify -- --input <evidence.json> [options]

Options:
  --input <path>               Read Everything diagnostic evidence JSON. Defaults to stdin.
  --requireReady               Require verdict.ready.
  --requireEnabled             Require Everything integration enabled.
  --requireAvailable           Require available Everything backend.
  --requireBackend <csv>       Require backend values, e.g. cli,sdk-napi.
  --requireHealthy             Require health=healthy.
  --requireVersion             Require detected Everything version.
  --requireEsPath              Require detected es.exe path.
  --requireFallbackChain <csv> Require fallback chain entries, e.g. sdk-napi,cli.
  --requireCaseIds <csv>       Require reusable manual regression case ids.
  --compact                    Print single-line JSON.
  --help                       Show this help.
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

function parseBackends(value: string | undefined): EverythingBackendType[] | undefined {
  const entries = parseCsv(value)
  if (!entries) return undefined

  const allowed = new Set(['sdk-napi', 'cli', 'unavailable'])
  const invalid = entries.filter((entry) => !allowed.has(entry))
  if (invalid.length > 0) {
    throw new Error(`Invalid Everything backend: ${invalid.join(', ')}`)
  }
  return entries as EverythingBackendType[]
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
    if (arg === '--requireReady') {
      options.requireReady = true
      continue
    }
    if (arg === '--requireEnabled') {
      options.requireEnabled = true
      continue
    }
    if (arg === '--requireAvailable') {
      options.requireAvailable = true
      continue
    }
    if (arg === '--requireBackend' && argv[i + 1]) {
      options.requireBackend = parseBackends(argv[++i])
      continue
    }
    if (arg === '--requireHealthy') {
      options.requireHealthy = true
      continue
    }
    if (arg === '--requireVersion') {
      options.requireVersion = true
      continue
    }
    if (arg === '--requireEsPath') {
      options.requireEsPath = true
      continue
    }
    if (arg === '--requireFallbackChain' && argv[i + 1]) {
      options.requireFallbackChain = parseBackends(argv[++i])
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

function parseEvidence(raw: string): EverythingDiagnosticEvidencePayload {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Everything diagnostic evidence JSON must be an object')
  }

  const evidence = parsed as Partial<EverythingDiagnosticEvidencePayload>
  if (
    evidence.schemaVersion !== EVERYTHING_DIAGNOSTIC_EVIDENCE_SCHEMA_VERSION ||
    evidence.kind !== EVERYTHING_DIAGNOSTIC_EVIDENCE_KIND
  ) {
    throw new Error('Unsupported Everything diagnostic evidence schema')
  }
  if (!evidence.status || !evidence.verdict || !evidence.manualRegression) {
    throw new Error('Everything diagnostic evidence JSON is missing required fields')
  }

  return evidence as EverythingDiagnosticEvidencePayload
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const evidence = parseEvidence(await readInput(options))
  const verified = verifyEverythingDiagnosticEvidence(evidence, options)
  console.log(JSON.stringify(verified, null, options.pretty ? 2 : 0))

  if (!verified.gate.passed) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
