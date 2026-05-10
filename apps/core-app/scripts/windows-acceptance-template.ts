#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE,
  WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA,
  WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE,
  WINDOWS_REQUIRED_CASE_IDS
} from '../src/main/modules/platform/windows-acceptance-manifest-verifier'
import type {
  WindowsAcceptanceCaseStatus,
  WindowsAcceptanceManifest,
  WindowsRequiredCaseId
} from '../src/main/modules/platform/windows-acceptance-manifest-verifier'

interface CliOptions {
  evidenceDir: string
  output?: string
  status: WindowsAcceptanceCaseStatus
  pretty: boolean
}

interface CaseTemplate {
  capabilityEvidencePath: string
  diagnosticEvidencePath: string
  capabilityVerifierCommand: string
  diagnosticVerifierCommand: string
}

const DEFAULT_EVIDENCE_DIR = 'evidence/windows'

function printUsage(): void {
  console.log(`Usage:
  pnpm -C "apps/core-app" run windows:acceptance:template -- [options]

Options:
  --evidenceDir <dir>     Evidence directory used in manifest paths. Default: evidence/windows.
  --output <path>         Write manifest JSON to a file in addition to stdout.
  --status <status>       Initial case status: blocked, skipped, failed, passed. Default: blocked.
  --compact               Print single-line JSON.
  --help                  Show this help.
`)
}

function parseStatus(value: string | undefined): WindowsAcceptanceCaseStatus {
  if (value === 'passed' || value === 'failed' || value === 'blocked' || value === 'skipped') {
    return value
  }
  return 'blocked'
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    evidenceDir: DEFAULT_EVIDENCE_DIR,
    status: 'blocked',
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
    if (arg === '--status' && argv[i + 1]) {
      options.status = parseStatus(argv[++i])
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

function joinEvidencePath(evidenceDir: string, fileName: string): string {
  return `${normalizeEvidenceDir(evidenceDir)}/${fileName}`
}

function buildCaseTemplate(caseId: WindowsRequiredCaseId, evidenceDir: string): CaseTemplate {
  const capabilityEvidencePath = joinEvidencePath(evidenceDir, `${caseId}-capability.json`)

  if (caseId === 'windows-everything-file-search') {
    const diagnosticEvidencePath = joinEvidencePath(evidenceDir, `${caseId}-everything.json`)
    return {
      capabilityEvidencePath,
      diagnosticEvidencePath,
      capabilityVerifierCommand:
        'pnpm -C "apps/core-app" run windows:capability:verify -- --input "<capability-evidence.json>" --requireEverything --requireEverythingTargets --strict',
      diagnosticVerifierCommand:
        'pnpm -C "apps/core-app" run everything:diagnostic:verify -- --input "<everything-evidence.json>" --requireReady --requireEnabled --requireAvailable --requireHealthy --requireVersion --requireEsPath --requireFallbackChain sdk-napi,cli --requireCaseIds windows-everything-file-search'
    }
  }

  if (caseId === 'windows-tray-update-plugin-install-exit') {
    const diagnosticEvidencePath = joinEvidencePath(evidenceDir, `${caseId}-update.json`)
    return {
      capabilityEvidencePath,
      diagnosticEvidencePath,
      capabilityVerifierCommand:
        'pnpm -C "apps/core-app" run windows:capability:verify -- --input "<capability-evidence.json>" --requireInstallerHandoff --strict',
      diagnosticVerifierCommand:
        'pnpm -C "apps/core-app" run update:diagnostic:verify -- --input "<update-evidence.json>" --requireAutoDownload --requireDownloadReady --requireReadyToInstall --requirePlatform win32 --requireInstallMode windows-installer-handoff --requireUserConfirmation --requireUnattendedDisabled --requireMatchingAsset --requireChecksums --requireCaseIds windows-tray-update-plugin-install-exit'
    }
  }

  const diagnosticEvidencePath = joinEvidencePath(evidenceDir, `${caseId}-app-index.json`)
  const appIndexVerifierCommand = buildAppIndexVerifierCommand(caseId)
  const capabilityVerifierCommand = buildAppIndexCapabilityVerifierCommand(caseId)

  return {
    capabilityEvidencePath,
    diagnosticEvidencePath,
    capabilityVerifierCommand,
    diagnosticVerifierCommand: appIndexVerifierCommand
  }
}

function buildAppIndexVerifierCommand(caseId: WindowsRequiredCaseId): string {
  if (caseId === 'windows-app-scan-uwp') {
    return 'pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input "<app-index-evidence.json>" --requireSuccess --requireQueryHit --requireLaunchKind uwp --requireLaunchTarget --requireBundleOrIdentity --requireCleanDisplayName --requireReindex --requireCaseIds windows-app-scan-uwp'
  }

  if (caseId === 'windows-shortcut-launch-args') {
    return 'pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input "<app-index-evidence.json>" --requireSuccess --requireQueryHit --requireLaunchKind shortcut --requireLaunchTarget --requireLaunchArgs --requireWorkingDirectory --requireCleanDisplayName --requireReindex --requireCaseIds windows-shortcut-launch-args'
  }

  return 'pnpm -C "apps/core-app" run app-index:diagnostic:verify -- --input "<app-index-evidence.json>" --requireSuccess --requireQueryHit --requireLaunchKind path,shortcut,uwp --requireLaunchTarget --requireCleanDisplayName --requireReindex --requireCaseIds windows-third-party-app-launch'
}

function buildAppIndexCapabilityVerifierCommand(caseId: WindowsRequiredCaseId): string {
  if (caseId === 'windows-shortcut-launch-args') {
    return 'pnpm -C "apps/core-app" run windows:capability:verify -- --input "<capability-evidence.json>" --requireTargets --requireShortcutMetadata --requireShortcutArguments --requireShortcutWorkingDirectory --strict'
  }

  if (caseId === 'windows-third-party-app-launch') {
    return 'pnpm -C "apps/core-app" run windows:capability:verify -- --input "<capability-evidence.json>" --requireTargets --requireRegistryFallback --requireShortcutMetadata --strict'
  }

  return 'pnpm -C "apps/core-app" run windows:capability:verify -- --input "<capability-evidence.json>" --requireTargets --requireUwp --requireRegistryFallback --requireShortcutMetadata --strict'
}

function buildManifest(options: CliOptions): WindowsAcceptanceManifest {
  const evidenceDir = normalizeEvidenceDir(options.evidenceDir)
  const manifestPath = options.output || '<windows-acceptance-manifest.json>'

  return {
    schema: WINDOWS_ACCEPTANCE_MANIFEST_SCHEMA,
    generatedAt: new Date().toISOString(),
    platform: 'win32',
    verification: {
      recommendedCommand: `pnpm -C "apps/core-app" run windows:acceptance:verify -- --input "${manifestPath}" --strict --requireEvidencePath --requireExistingEvidenceFiles --requireEvidenceGatePassed --requireCaseEvidenceSchemas --requireVerifierCommand --requireVerifierCommandGateFlags --requireRecommendedCommandGateFlags --requireRecommendedCommandInputMatch --requireSearchTrace --requireClipboardStress --requireCommonAppTargets WeChat,Codex,"Apple Music"`
    },
    cases: WINDOWS_REQUIRED_CASE_IDS.map((caseId) => {
      const template = buildCaseTemplate(caseId, evidenceDir)
      return {
        caseId,
        status: options.status,
        requiredForRelease: true,
        evidence: [
          {
            path: template.capabilityEvidencePath,
            verifierCommand: template.capabilityVerifierCommand,
            notes:
              'Replace the placeholder input path after running windows:capability:evidence on a Windows device.'
          },
          {
            path: template.diagnosticEvidencePath,
            verifierCommand: template.diagnosticVerifierCommand,
            notes:
              'Replace the placeholder input path after exporting the matching Settings diagnostic evidence on a Windows device.'
          }
        ]
      }
    }),
    performance: {
      searchTraceStatsPath: joinEvidencePath(evidenceDir, 'search-trace-stats.json'),
      searchTraceVerifierCommand: buildSearchTraceVerifierCommand(),
      clipboardStressSummaryPath: joinEvidencePath(evidenceDir, 'clipboard-stress-summary.json'),
      clipboardStressVerifierCommand: buildClipboardStressVerifierCommand()
    },
    manualChecks: {
      commonAppLaunch: {
        targets: ['WeChat', 'Codex', 'Apple Music'],
        passedTargets: []
      }
    }
  }
}

function buildSearchTraceVerifierCommand(): string {
  return [
    'pnpm -C "apps/core-app" run search:trace:verify -- --input "<search-trace-stats.json>"',
    `--minSamples ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.minSamples}`,
    `--maxFirstResultP95Ms ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxFirstResultP95Ms}`,
    `--maxSessionEndP95Ms ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxSessionEndP95Ms}`,
    `--maxSlowRatio ${WINDOWS_ACCEPTANCE_SEARCH_TRACE_GATE.maxSlowRatio}`,
    '--strict'
  ].join(' ')
}

function buildClipboardStressVerifierCommand(): string {
  return [
    'pnpm -C "apps/core-app" run clipboard:stress:verify -- --input "<clipboard-stress-summary.json>"',
    `--minDurationMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.minDurationMs}`,
    `--requireIntervals ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.requireIntervals.join(',')}`,
    `--maxP95SchedulerDelayMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxP95SchedulerDelayMs}`,
    `--maxSchedulerDelayMs ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxSchedulerDelayMs}`,
    `--maxRealtimeQueuedPeak ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxRealtimeQueuedPeak}`,
    `--maxDroppedCount ${WINDOWS_ACCEPTANCE_CLIPBOARD_STRESS_GATE.maxDroppedCount}`,
    '--strict'
  ].join(' ')
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const manifest = buildManifest(options)
  const output = `${JSON.stringify(manifest, null, options.pretty ? 2 : 0)}\n`

  if (options.output) {
    await mkdir(path.dirname(path.resolve(options.output)), { recursive: true })
    await writeFile(options.output, output, 'utf8')
  }

  process.stdout.write(output)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
