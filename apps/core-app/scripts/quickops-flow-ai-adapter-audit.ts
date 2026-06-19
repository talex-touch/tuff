#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createQuickOpsFlowAiAdapterAuditFromFiles } from '../src/main/modules/quick-ops/quick-ops-flow-ai-adapter-audit'

interface CliOptions {
  output?: string
  pretty: boolean
  strict: boolean
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run quickops:flow-ai:audit -- [options]

Options:
  --output <path>  Write audit JSON to a file in addition to stdout.
  --compact        Print single-line JSON.
  --strict         Exit 1 when the audit gate fails.
  --help           Show this help.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    pretty: true,
    strict: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--output' && argv[i + 1]) {
      options.output = argv[++i]
      continue
    }
    if (arg === '--compact') {
      options.pretty = false
      continue
    }
    if (arg === '--strict') {
      options.strict = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const audit = await createQuickOpsFlowAiAdapterAuditFromFiles({
    repoRoot: path.resolve(process.cwd(), '../..')
  })
  const output = `${JSON.stringify(audit, null, options.pretty ? 2 : 0)}\n`

  if (options.output) {
    await mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
    await writeFile(options.output, output, 'utf8')
  }

  process.stdout.write(output)
  if (options.strict && !audit.gate.passed) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
