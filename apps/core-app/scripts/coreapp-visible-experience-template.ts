#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  buildCoreAppVisibleExperienceManifest,
  renderCoreAppVisibleExperienceEvidenceTemplate
} from '../src/main/modules/platform/coreapp-visible-experience-evidence'
import packageJson from '../package.json'

interface CliOptions {
  evidenceDir: string
  output?: string
  writeChecklist: boolean
  pretty: boolean
}

const DEFAULT_EVIDENCE_DIR = 'evidence/coreapp-visible'

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run visible:experience:template -- [options]

Options:
  --evidenceDir <dir>   Evidence directory used in manifest paths. Default: evidence/coreapp-visible.
  --output <path>       Write manifest JSON to a file in addition to stdout.
  --writeChecklist      Write CoreApp visible experience checklist next to the manifest.
  --compact             Print single-line JSON.
  --help                Show this help.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    writeChecklist: false,
    pretty: true
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--evidenceDir' && argv[i + 1]) {
      options.evidenceDir = argv[++i]
      continue
    }
    if (arg === '--output' && argv[i + 1]) {
      options.output = argv[++i]
      continue
    }
    if (arg === '--writeChecklist') {
      options.writeChecklist = true
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

function normalizeEvidenceDir(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '') || DEFAULT_EVIDENCE_DIR
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const evidenceDir = normalizeEvidenceDir(options.evidenceDir)
  const outputPath = options.output ?? `${evidenceDir}/coreapp-visible-experience-manifest.json`
  const manifest = buildCoreAppVisibleExperienceManifest({
    baselineVersion: packageJson.version,
    evidenceDir
  })
  const output = `${JSON.stringify(manifest, null, options.pretty ? 2 : 0)}\n`

  if (options.output) {
    await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true })
    await writeFile(outputPath, output, 'utf8')
  }

  if (options.writeChecklist) {
    const checklistPath = path.resolve(evidenceDir, 'COREAPP_VISIBLE_EXPERIENCE_CHECKLIST.md')
    await mkdir(path.dirname(checklistPath), { recursive: true })
    await writeFile(checklistPath, renderCoreAppVisibleExperienceEvidenceTemplate(manifest), 'utf8')
  }

  process.stdout.write(output)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
