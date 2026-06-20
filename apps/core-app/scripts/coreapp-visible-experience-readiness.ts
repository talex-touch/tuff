#!/usr/bin/env tsx
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  buildCoreAppVisibleExperienceCaptureReadiness,
  type CoreAppVisibleExperienceReadinessReport
} from '../src/main/modules/platform/coreapp-visible-experience-evidence'
import packageJson from '../package.json'

interface CliOptions {
  appBundle: string
  browserSmokeReport?: string
  electronDevCaptureReport?: string
  remoteDebuggingUrl?: string
  screenRecording?: 'granted' | 'denied' | 'unchecked'
  output?: string
  pretty: boolean
}

const DEFAULT_APP_BUNDLE = 'dist/mac-arm64/tuff.app'
const DEFAULT_BROWSER_SMOKE_REPORT =
  '../../docs/engineering/reports/coreapp-visible-browser-smoke-2026-05-17/README.md'
const DEFAULT_ELECTRON_DEV_CAPTURE_REPORT =
  '../../docs/engineering/reports/coreapp-visible-electron-dev-capture-2026-05-17/README.md'

function printUsage(): void {
  console.log(`Usage:
  corepack pnpm -C "apps/core-app" run visible:experience:readiness -- [options]

Options:
  --appBundle <path>                 Packaged .app bundle path. Default: dist/mac-arm64/tuff.app.
  --browserSmokeReport <path>        Browser-only smoke boundary report path.
  --electronDevCaptureReport <path>  Electron dev capture report path.
  --remoteDebuggingUrl <url>         Optional Electron remote debugging /json URL to probe.
  --screenRecording <state>          macOS Screen Recording state: granted, denied, unchecked.
  --output <path>                    Write readiness JSON to a file in addition to stdout.
  --compact                          Print single-line JSON.
  --help                             Show this help.
`)
}

function parseArgs(argv: string[]): CliOptions | null {
  const options: CliOptions = {
    appBundle: DEFAULT_APP_BUNDLE,
    browserSmokeReport: DEFAULT_BROWSER_SMOKE_REPORT,
    electronDevCaptureReport: DEFAULT_ELECTRON_DEV_CAPTURE_REPORT,
    screenRecording: 'unchecked',
    pretty: true
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue

    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--appBundle' && argv[i + 1]) {
      options.appBundle = argv[++i]
      continue
    }
    if (arg === '--browserSmokeReport' && argv[i + 1]) {
      options.browserSmokeReport = argv[++i]
      continue
    }
    if (arg === '--electronDevCaptureReport' && argv[i + 1]) {
      options.electronDevCaptureReport = argv[++i]
      continue
    }
    if (arg === '--remoteDebuggingUrl' && argv[i + 1]) {
      options.remoteDebuggingUrl = argv[++i]
      continue
    }
    if (arg === '--screenRecording' && argv[i + 1]) {
      const value = argv[++i]
      if (value !== 'granted' && value !== 'denied' && value !== 'unchecked') {
        throw new Error(`Invalid --screenRecording value: ${value}`)
      }
      options.screenRecording = value
      continue
    }
    if (arg === '--output' && argv[i + 1]) {
      options.output = argv[++i]
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

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

function extractPlistString(raw: string, key: string): string | null {
  const pattern = new RegExp(`<key>${escapeRegExp(key)}</key>\\s*<string>([^<]*)</string>`)
  return raw.match(pattern)?.[1]?.trim() ?? null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function readAppBundleVersion(appBundlePath: string): Promise<string | null> {
  const plistPath = path.join(appBundlePath, 'Contents', 'Info.plist')
  const raw = await readTextIfExists(plistPath)
  if (!raw) return null
  return (
    extractPlistString(raw, 'CFBundleShortVersionString') ??
    extractPlistString(raw, 'CFBundleVersion')
  )
}

async function probeRemoteDebugging(url: string | undefined): Promise<boolean> {
  if (!url) return false
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2_000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return false
    const payload = (await response.json()) as unknown
    return Array.isArray(payload) && payload.length > 0
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function buildReport(options: CliOptions): Promise<CoreAppVisibleExperienceReadinessReport> {
  const appBundlePath = path.resolve(options.appBundle)
  const appBundleExists = await exists(appBundlePath)
  const appBundleVersion = appBundleExists ? await readAppBundleVersion(appBundlePath) : null
  const browserSmokePath = options.browserSmokeReport
    ? path.resolve(options.browserSmokeReport)
    : undefined
  const browserSmokeText = browserSmokePath ? await readTextIfExists(browserSmokePath) : null
  const electronDevCapturePath = options.electronDevCaptureReport
    ? path.resolve(options.electronDevCaptureReport)
    : undefined
  const electronDevCaptureAttempted = electronDevCapturePath
    ? await exists(electronDevCapturePath)
    : false
  const remoteDebuggingAvailable = await probeRemoteDebugging(options.remoteDebuggingUrl)

  return buildCoreAppVisibleExperienceCaptureReadiness({
    expectedVersion: packageJson.version,
    packagedArtifact: {
      exists: appBundleExists,
      version: appBundleVersion,
      path: appBundlePath
    },
    browserSmoke: {
      archived: Boolean(browserSmokeText),
      hasIpcRendererMissingError: Boolean(browserSmokeText?.includes('ipcRenderer')),
      path: browserSmokePath
    },
    electronDevCapture: {
      attempted: electronDevCaptureAttempted,
      remoteDebuggingAvailable,
      path: electronDevCapturePath
    },
    screenRecording: {
      checked: options.screenRecording !== 'unchecked',
      granted: options.screenRecording === 'granted'
    }
  })
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const report = await buildReport(options)
  const output = `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`
  if (options.output) {
    const outputPath = path.resolve(options.output)
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, output, 'utf8')
  }
  process.stdout.write(output)
  if (!report.ready) process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
