#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  buildQuickOpsEvidenceManifest,
  renderQuickOpsEvidenceCollectionPlan,
  renderQuickOpsEvidenceTemplate
} from '../src/main/modules/quick-ops/quick-ops-evidence'
import packageJson from '../package.json'

export interface CliOptions {
  evidenceDir: string
  output?: string
  writeChecklist: boolean
  writePlan: boolean
  pretty: boolean
}

export interface QuickOpsEvidenceTemplateOutputPaths {
  evidenceDir: string
  manifestPath: string
  checklistPath?: string
  planPath?: string
  writesManifest: boolean
}

const DEFAULT_EVIDENCE_DIR = 'evidence/quickops'

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run quickops:evidence:template -- [options]

Options:
  --evidenceDir <dir>   Evidence directory used in manifest paths. Default: evidence/quickops.
  --output <path>       Write manifest JSON to a file in addition to stdout.
                        When --writeChecklist or --writePlan is set, the manifest is written
                        to evidenceDir/quickops-evidence-manifest.json by default.
  --writeChecklist      Write QuickOps evidence checklist next to the manifest.
  --writePlan           Write QuickOps evidence collection plan next to the manifest.
  --compact             Print single-line JSON.
  --help                Show this help.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    writeChecklist: false,
    writePlan: false,
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
    if (arg === '--writePlan') {
      options.writePlan = true
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

export function resolveQuickOpsEvidenceTemplateOutputPaths(
  options: CliOptions
): QuickOpsEvidenceTemplateOutputPaths {
  const evidenceDir = normalizeEvidenceDir(options.evidenceDir)
  return {
    evidenceDir,
    manifestPath: options.output ?? `${evidenceDir}/quickops-evidence-manifest.json`,
    checklistPath: options.writeChecklist
      ? path.resolve(evidenceDir, 'QUICKOPS_EVIDENCE_CHECKLIST.md')
      : undefined,
    planPath: options.writePlan
      ? path.resolve(evidenceDir, 'QUICKOPS_EVIDENCE_COLLECTION_PLAN.md')
      : undefined,
    writesManifest: Boolean(options.output || options.writeChecklist || options.writePlan)
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const outputPaths = resolveQuickOpsEvidenceTemplateOutputPaths(options)
  const manifest = buildQuickOpsEvidenceManifest({
    baselineVersion: packageJson.version,
    evidenceDir: outputPaths.evidenceDir
  })
  const output = `${JSON.stringify(manifest, null, options.pretty ? 2 : 0)}\n`

  if (outputPaths.writesManifest) {
    await mkdir(path.dirname(path.resolve(outputPaths.manifestPath)), { recursive: true })
    await writeFile(outputPaths.manifestPath, output, 'utf8')
  }

  if (outputPaths.checklistPath) {
    await mkdir(path.dirname(outputPaths.checklistPath), { recursive: true })
    await writeFile(outputPaths.checklistPath, renderQuickOpsEvidenceTemplate(manifest), 'utf8')
  }

  if (outputPaths.planPath) {
    await mkdir(path.dirname(outputPaths.planPath), { recursive: true })
    await writeFile(outputPaths.planPath, renderQuickOpsEvidenceCollectionPlan(manifest), 'utf8')
  }

  process.stdout.write(output)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
