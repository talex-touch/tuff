#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { evaluateSearchTracePerformance } from '../src/main/modules/box-tool/search-engine/search-trace-stats'
import type {
  SearchTracePerformanceGateOptions,
  SearchTracePerformanceSummary
} from '../src/main/modules/box-tool/search-engine/search-trace-stats'

interface CliOptions extends SearchTracePerformanceGateOptions {
  input?: string
  pretty: boolean
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run search:trace:verify -- --input <stats.json> [options]

Options:
  --input <path>                 Read search-trace-stats JSON from a file. Defaults to stdin.
  --minSamples <count>           Override minimum paired session count. Default: summary value.
  --maxFirstResultP95Ms <ms>     Fail when first.result P95 is above this value.
  --maxSessionEndP95Ms <ms>      Fail when session.end P95 is above this value.
  --maxSlowRatio <ratio>         Fail when either event slowRatio is above this value.
  --strict                       Exit 1 when paired sessions are below minSamples.
  --compact                      Print single-line JSON.
  --help                         Show this help.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    strict: false,
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
    if (arg === '--minSamples' && argv[i + 1]) {
      options.minSamples = parsePositiveNumber(argv[++i])
      continue
    }
    if (arg === '--maxFirstResultP95Ms' && argv[i + 1]) {
      options.maxFirstResultP95Ms = parsePositiveNumber(argv[++i])
      continue
    }
    if (arg === '--maxSessionEndP95Ms' && argv[i + 1]) {
      options.maxSessionEndP95Ms = parsePositiveNumber(argv[++i])
      continue
    }
    if (arg === '--maxSlowRatio' && argv[i + 1]) {
      options.maxSlowRatio = parsePositiveNumber(argv[++i])
      continue
    }
    if (arg === '--strict') {
      options.strict = true
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

function parseSummary(raw: string): SearchTracePerformanceSummary {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Search trace stats JSON must be an object')
  }

  const summary = parsed as Partial<SearchTracePerformanceSummary>
  if (summary.schema !== 'search-trace-stats/v1') {
    throw new Error(`Unsupported search trace stats schema: ${String(summary.schema)}`)
  }
  if (
    !summary.firstResult ||
    !summary.sessionEnd ||
    typeof summary.pairedSessionCount !== 'number'
  ) {
    throw new Error('Search trace stats JSON is missing required fields')
  }

  return summary as SearchTracePerformanceSummary
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const summary = parseSummary(await readInput(options))
  const gate = evaluateSearchTracePerformance(summary, options)
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
