#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  evaluateSearchTracePerformance,
  summarizeSearchTracePerformance
} from '../src/main/modules/box-tool/search-engine/search-trace-stats'

interface CliOptions {
  input?: string
  output?: string
  minSamples?: number
  slowThresholdMs?: number
  maxFirstResultP95Ms?: number
  maxSessionEndP95Ms?: number
  maxSlowRatio?: number
  strict: boolean
  pretty: boolean
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run search:trace:stats -- --input <log-file> [options]
  cat search.log | pnpm -C "apps/core-app" run search:trace:stats -- --strict

Options:
  --input <path>                 Read search-trace logs from a file. Defaults to stdin.
  --output <path>                Write search-trace-stats JSON to a file in addition to stdout.
  --minSamples <count>           Minimum paired session count. Default: 200.
  --slowThresholdMs <ms>         Slow query threshold. Default: 800.
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
    if (arg === '--') {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }

    if (arg === '--input' && argv[i + 1]) {
      options.input = argv[++i]
      continue
    }
    if (arg === '--output' && argv[i + 1]) {
      options.output = argv[++i]
      continue
    }
    if (arg === '--minSamples' && argv[i + 1]) {
      options.minSamples = parsePositiveNumber(argv[++i])
      continue
    }
    if (arg === '--slowThresholdMs' && argv[i + 1]) {
      options.slowThresholdMs = parsePositiveNumber(argv[++i])
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const content = await readInput(options)
  const lines = content.split(/\r?\n/).filter(Boolean)
  const summary = summarizeSearchTracePerformance(lines, {
    minSamples: options.minSamples,
    slowThresholdMs: options.slowThresholdMs
  })
  const gate = evaluateSearchTracePerformance(summary, {
    strict: options.strict,
    maxFirstResultP95Ms: options.maxFirstResultP95Ms,
    maxSessionEndP95Ms: options.maxSessionEndP95Ms,
    maxSlowRatio: options.maxSlowRatio
  })
  const output = {
    ...summary,
    gate
  }
  const serialized = `${JSON.stringify(output, null, options.pretty ? 2 : 0)}\n`

  if (options.output) {
    await mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
    await writeFile(options.output, serialized, 'utf8')
  }

  process.stdout.write(serialized)
  if (!gate.passed) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
