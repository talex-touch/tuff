#!/usr/bin/env tsx
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA,
  verifyCoreAppVisibleExperienceManifest
} from '../src/main/modules/platform/coreapp-visible-experience-evidence'
import type {
  CoreAppVisibleExperienceGateOptions,
  CoreAppVisibleExperienceManifest
} from '../src/main/modules/platform/coreapp-visible-experience-evidence'

interface CliOptions extends CoreAppVisibleExperienceGateOptions {
  input?: string
  requireExistingArtifacts?: boolean
  requireCurrentVersion?: boolean
  requireNonEmptyArtifacts?: boolean
  pretty: boolean
}

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run visible:experience:verify -- --input <manifest.json> [options]

Options:
  --input <path>              Read visible experience manifest JSON. Defaults to stdin.
  --requireAllPassed          Require every required visible surface to be passed.
  --requireArtifactPaths      Require artifact paths for every required visible surface.
  --requireVisualArtifacts    Require screenshot/recording artifacts for visual surfaces.
  --requireCheckedEvidence    Require every required evidence checklist item to be checked.
  --requireEvidenceTags       Require every required evidence tag, such as AI-STABLE ids, to be checked.
  --requireCurrentVersion     Require manifest baselineVersion to match this CoreApp package.
  --requireExistingArtifacts  Require every referenced artifact path to exist on disk.
  --requireNonEmptyArtifacts  Require referenced artifact paths to be non-empty files.
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
    if (arg === '--requireAllPassed') {
      options.requireAllPassed = true
      continue
    }
    if (arg === '--requireArtifactPaths') {
      options.requireArtifactPaths = true
      continue
    }
    if (arg === '--requireVisualArtifacts') {
      options.requireVisualArtifacts = true
      options.requireArtifactPaths = true
      continue
    }
    if (arg === '--requireCheckedEvidence') {
      options.requireCheckedEvidence = true
      continue
    }
    if (arg === '--requireEvidenceTags') {
      options.requireEvidenceTags = true
      continue
    }
    if (arg === '--requireCurrentVersion') {
      options.requireCurrentVersion = true
      continue
    }
    if (arg === '--requireExistingArtifacts') {
      options.requireExistingArtifacts = true
      options.requireArtifactPaths = true
      continue
    }
    if (arg === '--requireNonEmptyArtifacts') {
      options.requireNonEmptyArtifacts = true
      options.requireExistingArtifacts = true
      options.requireArtifactPaths = true
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
  if (options.input) return readFile(options.input, 'utf8')
  return readStdin()
}

function parseManifest(raw: string): CoreAppVisibleExperienceManifest {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object')
    throw new Error('CoreApp visible experience manifest JSON must be an object')

  const manifest = parsed as Partial<CoreAppVisibleExperienceManifest>
  if (manifest.schema !== COREAPP_VISIBLE_EXPERIENCE_EVIDENCE_SCHEMA) {
    throw new Error(`Unsupported visible experience manifest schema: ${String(manifest.schema)}`)
  }
  if (!Array.isArray(manifest.surfaces) || typeof manifest.baselineVersion !== 'string') {
    throw new Error('CoreApp visible experience manifest JSON is missing required fields')
  }

  return {
    ...(manifest as CoreAppVisibleExperienceManifest),
    surfaces: manifest.surfaces.map((item) => ({
      ...item,
      artifactPaths: Array.isArray(item.artifactPaths) ? item.artifactPaths : [],
      checkedEvidence: Array.isArray(item.checkedEvidence) ? item.checkedEvidence : [],
      evidenceTags: Array.isArray(item.evidenceTags) ? item.evidenceTags : [],
      evidenceTagArtifacts:
        item.evidenceTagArtifacts && typeof item.evidenceTagArtifacts === 'object'
          ? item.evidenceTagArtifacts
          : {}
    }))
  }
}

function collectArtifactPaths(manifest: CoreAppVisibleExperienceManifest): string[] {
  return [
    ...new Set(
      manifest.surfaces.flatMap((item) => [
        ...item.artifactPaths,
        ...Object.values(item.evidenceTagArtifacts ?? {}).flat()
      ])
    )
  ].filter((artifactPath) => artifactPath.trim())
}

async function validateArtifactFiles(
  manifest: CoreAppVisibleExperienceManifest,
  options: CliOptions
): Promise<string[]> {
  if (!options.requireExistingArtifacts && !options.requireNonEmptyArtifacts) return []

  const failures: string[] = []
  const baseDir = options.input ? path.dirname(path.resolve(options.input)) : process.cwd()

  for (const artifactPath of collectArtifactPaths(manifest)) {
    const resolvedPath = path.isAbsolute(artifactPath)
      ? artifactPath
      : path.resolve(baseDir, artifactPath)

    try {
      const stats = await stat(resolvedPath)
      if (options.requireNonEmptyArtifacts && (!stats.isFile() || stats.size === 0)) {
        failures.push(`Visible experience artifact is empty or not a file: ${artifactPath}`)
      }
    } catch {
      failures.push(`Visible experience artifact does not exist: ${artifactPath}`)
    }
  }

  return failures
}

async function validateCurrentVersion(
  manifest: CoreAppVisibleExperienceManifest,
  options: CliOptions
): Promise<string[]> {
  if (!options.requireCurrentVersion) return []

  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  ) as { version?: unknown }
  const currentVersion = typeof packageJson.version === 'string' ? packageJson.version.trim() : ''
  if (!currentVersion) {
    return ['Current CoreApp package version is unavailable']
  }
  if (manifest.baselineVersion === currentVersion) return []

  return [
    `Visible experience baseline version mismatch: manifest=${manifest.baselineVersion}, current=${currentVersion}`
  ]
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const manifest = parseManifest(await readInput(options))
  const gate = verifyCoreAppVisibleExperienceManifest(manifest, options)
  gate.failures.push(...(await validateCurrentVersion(manifest, options)))
  gate.failures.push(...(await validateArtifactFiles(manifest, options)))
  gate.passed = gate.failures.length === 0

  console.log(JSON.stringify({ ...manifest, gate }, null, options.pretty ? 2 : 0))

  if (!gate.passed) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
