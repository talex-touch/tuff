#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { evaluateClipboardStressSummary } from '../src/main/modules/platform/clipboard-stress-verifier'
import type {
  ClipboardStressGateOptions,
  ClipboardStressSummary
} from '../src/main/modules/platform/clipboard-stress-verifier'

interface CliOptions extends ClipboardStressGateOptions {
  input?: string
  pretty: boolean
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function parseIntervals(value: string | undefined): number[] | undefined {
  if (!value) return undefined
  const intervals = value
    .split(',')
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isFinite(item) && item > 0)
  return intervals.length > 0 ? Array.from(new Set(intervals)) : undefined
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run clipboard:stress:verify -- --input <summary.json> [options]

Options:
  --input <path>                    Read clipboard stress summary JSON. Defaults to stdin.
  --strict                          Require clipboard-stress-summary/v1 schema.
  --minDurationMs <ms>              Fail scenarios shorter than this duration.
  --requireIntervals <csv>          Require interval scenarios, e.g. 500,250.
  --maxP95SchedulerDelayMs <ms>     Fail when p95 scheduler delay is above this value.
  --maxSchedulerDelayMs <ms>        Fail when max scheduler delay is above this value.
  --maxRealtimeQueuedPeak <count>   Fail when realtime queued peak is above this value.
  --maxDroppedCount <count>         Fail when dropped count is above this value.
  --allowTimeouts                   Do not fail timeoutCount > 0.
  --allowErrors                     Do not fail errorCount > 0.
  --compact                         Print single-line JSON.
  --help                            Show this help.
`)
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
    if (arg === '--strict') {
      options.strict = true
      continue
    }
    if (arg === '--minDurationMs' && argv[i + 1]) {
      options.minDurationMs = parsePositiveNumber(argv[++i])
      continue
    }
    if (arg === '--requireIntervals' && argv[i + 1]) {
      options.requireIntervals = parseIntervals(argv[++i])
      continue
    }
    if (arg === '--maxP95SchedulerDelayMs' && argv[i + 1]) {
      options.maxP95SchedulerDelayMs = parsePositiveNumber(argv[++i])
      continue
    }
    if (arg === '--maxSchedulerDelayMs' && argv[i + 1]) {
      options.maxSchedulerDelayMs = parsePositiveNumber(argv[++i])
      continue
    }
    if (arg === '--maxRealtimeQueuedPeak' && argv[i + 1]) {
      options.maxRealtimeQueuedPeak = parsePositiveNumber(argv[++i])
      continue
    }
    if (arg === '--maxDroppedCount' && argv[i + 1]) {
      options.maxDroppedCount = parsePositiveNumber(argv[++i])
      continue
    }
    if (arg === '--allowTimeouts') {
      options.allowTimeouts = true
      continue
    }
    if (arg === '--allowErrors') {
      options.allowErrors = true
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

function parseSummary(raw: string): ClipboardStressSummary {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Clipboard stress summary JSON must be an object')
  }

  const summary = parsed as Partial<ClipboardStressSummary>
  if (!Array.isArray(summary.results)) {
    throw new Error('Clipboard stress summary JSON is missing results')
  }

  return summary as ClipboardStressSummary
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const summary = parseSummary(await readInput(options))
  const gate = evaluateClipboardStressSummary(summary, options)
  const output = { ...summary, gate }
  console.log(JSON.stringify(output, null, options.pretty ? 2 : 0))

  if (!gate.passed) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
