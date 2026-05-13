#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import {
  WINDOWS_CAPABILITY_EVIDENCE_SCHEMA,
  verifyWindowsCapabilityEvidence
} from '../src/main/modules/platform/windows-capability-evidence'
import type {
  WindowsCapabilityEvidence,
  WindowsCapabilityGateOptions
} from '../src/main/modules/platform/windows-capability-evidence'

interface CliOptions extends WindowsCapabilityGateOptions {
  input?: string
  pretty: boolean
}

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run windows:capability:verify -- --input <evidence.json> [options]
  pnpm -C "apps/core-app" run windows:capability:evidence -- --compact | pnpm -C "apps/core-app" run windows:capability:verify -- --strict

Options:
  --input <path>              Read evidence JSON from file. Defaults to stdin.
  --requireEverything         Require Everything CLI evidence.
  --requireEverythingTargets  Require Everything target query matches.
  --requireTargets            Require all requested targets to be found.
  --requireUwp                Require at least one UWP app from Get-StartApps.
  --requireRegistryFallback   Require registry uninstall fallback executable candidates.
  --requireShortcutMetadata   Require resolved .lnk target metadata.
  --requireApprefMs           Require at least one Start Menu .appref-ms entry.
  --requireShortcutArguments  Require at least one .lnk entry with arguments.
  --requireShortcutWorkingDirectory
                              Require at least one .lnk entry with a working directory.
  --requireInstallerHandoff   Require supported NSIS/MSI installer dry-run handoff evidence.
  --strict                    Exit 1 on gate failure; non-Windows skipped evidence also fails.
  --compact                   Print single-line JSON.
  --help                      Show this help.
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
    if (arg === '--requireEverything') {
      options.requireEverything = true
      continue
    }
    if (arg === '--requireEverythingTargets') {
      options.requireEverythingTargets = true
      continue
    }
    if (arg === '--requireTargets') {
      options.requireTargets = true
      continue
    }
    if (arg === '--requireUwp') {
      options.requireUwp = true
      continue
    }
    if (arg === '--requireRegistryFallback') {
      options.requireRegistryFallback = true
      continue
    }
    if (arg === '--requireShortcutMetadata') {
      options.requireShortcutMetadata = true
      continue
    }
    if (arg === '--requireApprefMs') {
      options.requireApprefMs = true
      continue
    }
    if (arg === '--requireShortcutArguments') {
      options.requireShortcutArguments = true
      continue
    }
    if (arg === '--requireShortcutWorkingDirectory') {
      options.requireShortcutWorkingDirectory = true
      continue
    }
    if (arg === '--requireInstallerHandoff') {
      options.requireInstallerHandoff = true
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

function parseEvidence(raw: string): WindowsCapabilityEvidence {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Evidence JSON must be an object')
  }

  const evidence = parsed as Partial<WindowsCapabilityEvidence>
  if (evidence.schema !== WINDOWS_CAPABILITY_EVIDENCE_SCHEMA) {
    throw new Error(`Unsupported evidence schema: ${String(evidence.schema)}`)
  }
  if (!evidence.checks || typeof evidence.platform !== 'string') {
    throw new Error('Evidence JSON is missing required fields')
  }

  return evidence as WindowsCapabilityEvidence
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const raw = await readInput(options)
  const evidence = parseEvidence(raw)
  const verified = verifyWindowsCapabilityEvidence(evidence, options)
  console.log(JSON.stringify(verified, null, options.pretty ? 2 : 0))

  if (!verified.gate.passed) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
