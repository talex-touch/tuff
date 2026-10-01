#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  evaluateEverythingCoreBoxUiEvidence,
  EVERYTHING_COREBOX_SEARCH_MODES,
  EVERYTHING_COREBOX_UI_EVIDENCE_KIND,
  EVERYTHING_COREBOX_UI_EVIDENCE_SCHEMA_VERSION,
  verifyEverythingCoreBoxUiArtifacts
} from '../src/main/modules/platform/everything-corebox-ui-verifier'
import type {
  EverythingCoreBoxSearchModeId,
  EverythingCoreBoxUiEvidencePayload,
  EverythingCoreBoxUiGateOptions
} from '../src/main/modules/platform/everything-corebox-ui-verifier'
import type { EverythingBackendType } from '../src/shared/events/everything'

interface CliOptions extends EverythingCoreBoxUiGateOptions {
  input?: string
  /**
   * Directory the mode/empty screenshot names resolve against for the filesystem half of the gate.
   * Defaults to the evidence file's own directory so a normal `--input` run needs no extra flag.
   */
  artifactRoot?: string
  pretty: boolean
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run everything:corebox-ui:verify -- --input <evidence.json> [options]

Options:
  --input <path>                  Read packaged CoreBox UI evidence JSON. Defaults to stdin.
  --artifact-root <dir>           Directory screenshot/DOM names resolve against. Defaults to the
                                  evidence file's directory; required with --requireScreenshots when
                                  reading from stdin.
  --requireModes <csv>            Require search modes, e.g. normal,explicit-file,structured-filter.
  --requireBackend <csv>          Require the observed backend, e.g. sdk-napi,cli,unavailable.
  --requireAvailable              Require the observed backend to be available.
  --requireDegraded               Require an unavailable backend with a visible degraded state.
  --requireEmptyState             Require an observed empty CoreBox state.
  --requireResultRows             Require in-scope modes to render packaged CoreBox rows.
  --requireMarkerMatches          Require in-scope modes to render the probe marker result.
  --requireScreenshots            Require packaged UI screenshots for every required mode.
  --requirePlatform <platform>    Require the recorded runtime platform, e.g. win32.
  --maxModeDurationMs <ms>        Reject a mode slower than this duration.
  --compact                       Print single-line JSON.
  --help                          Show this help.
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

function parseModes(value: string | undefined): EverythingCoreBoxSearchModeId[] | undefined {
  const entries = parseCsv(value)
  if (!entries) return undefined

  const invalid = entries.filter(
    (entry): boolean =>
      !EVERYTHING_COREBOX_SEARCH_MODES.includes(entry as EverythingCoreBoxSearchModeId)
  )
  if (invalid.length > 0) {
    throw new Error(`Invalid CoreBox search mode: ${invalid.join(', ')}`)
  }
  return entries as EverythingCoreBoxSearchModeId[]
}

function parseBackends(value: string | undefined): EverythingBackendType[] | undefined {
  const entries = parseCsv(value)
  if (!entries) return undefined

  const allowed: EverythingBackendType[] = ['sdk-napi', 'cli', 'unavailable']
  const invalid = entries.filter(
    (entry): boolean => !allowed.includes(entry as EverythingBackendType)
  )
  if (invalid.length > 0) {
    throw new Error(`Invalid Everything backend: ${invalid.join(', ')}`)
  }
  return entries as EverythingBackendType[]
}

function parseNonNegativeNumber(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number`)
  }
  return parsed
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
    if (arg === '--artifact-root' && argv[i + 1]) {
      options.artifactRoot = argv[++i]
      continue
    }
    if (arg === '--requireModes' && argv[i + 1]) {
      options.requireModes = parseModes(argv[++i])
      continue
    }
    if (arg === '--requireBackend' && argv[i + 1]) {
      options.requireBackend = parseBackends(argv[++i])
      continue
    }
    if (arg === '--requireAvailable') {
      options.requireAvailable = true
      continue
    }
    if (arg === '--requireDegraded') {
      options.requireDegraded = true
      continue
    }
    if (arg === '--requireEmptyState') {
      options.requireEmptyState = true
      continue
    }
    if (arg === '--requireResultRows') {
      options.requireResultRows = true
      continue
    }
    if (arg === '--requireMarkerMatches') {
      options.requireMarkerMatches = true
      continue
    }
    if (arg === '--requireScreenshots') {
      options.requireScreenshots = true
      continue
    }
    if (arg === '--requirePlatform' && argv[i + 1]) {
      options.requirePlatform = argv[++i]
      continue
    }
    if (arg === '--maxModeDurationMs' && argv[i + 1]) {
      options.maxModeDurationMs = parseNonNegativeNumber(argv[++i], '--maxModeDurationMs')
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
  return options.input ? readFile(options.input, 'utf8') : await readStdin()
}

function parseEvidence(raw: string): EverythingCoreBoxUiEvidencePayload {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Windows Everything CoreBox UI evidence must be a JSON object')
  }
  if (
    (parsed as { kind?: unknown }).kind !== EVERYTHING_COREBOX_UI_EVIDENCE_KIND ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !==
      EVERYTHING_COREBOX_UI_EVIDENCE_SCHEMA_VERSION
  ) {
    throw new Error('Windows Everything CoreBox UI evidence has an unsupported schema')
  }
  return parsed as EverythingCoreBoxUiEvidencePayload
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const evidence = parseEvidence(await readInput(options))
  const gate = evaluateEverythingCoreBoxUiEvidence(evidence, options)

  // A name in the artifact array is not proof a screenshot exists; the filesystem half of the gate
  // checks each listed file is a real, non-empty PNG inside the evidence root. It runs against the
  // evidence file's own directory unless `--artifact-root` says otherwise (required for stdin).
  const baseDir = options.artifactRoot
    ? path.resolve(options.artifactRoot)
    : options.input
      ? path.dirname(path.resolve(options.input))
      : undefined
  const artifactGate = await verifyEverythingCoreBoxUiArtifacts(evidence, {
    baseDir,
    requireScreenshots: options.requireScreenshots === true
  })
  gate.failures.push(...artifactGate.failures)
  gate.passed = gate.failures.length === 0

  console.log(
    JSON.stringify(
      {
        ...evidence,
        gate
      },
      null,
      options.pretty ? 2 : 0
    )
  )

  if (!gate.passed) {
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
