#!/usr/bin/env node

/**
 * Batch npm plugin packager for monorepo plugins.
 *
 * Stages `dist/npm/`, validates each plugin against the `'npm-package'` package policy
 * and static security scanner, and produces reproducible POSIX/ustar `.tgz` tarballs.
 *
 * Usage:
 *   node scripts/pack-npm-plugins.mjs [--dry-run] [--filter <plugin>] [--out <dir>] [--skip-build] [--json]
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const pluginsDir = process.env.TUFF_PLUGINS_DIR
  ? path.resolve(process.env.TUFF_PLUGINS_DIR)
  : path.resolve(rootDir, 'plugins')

function printHelp() {
  console.log('Usage: node scripts/pack-npm-plugins.mjs [options]')
  console.log('')
  console.log('Options:')
  console.log('  --dry-run                Build/stage into a temp dir, validate policy+scan, clean up')
  console.log('  --filter <name>          Filter plugin dir or package name (repeatable or comma-separated)')
  console.log('  --out <dir>              Write/copy packed .tgz tarballs and report JSON into <dir>')
  console.log('  --skip-build             Reuse existing dist/build/ instead of rebuilding first')
  console.log('  --include-manifest-only  Include manifest-only plugins that lack package.json')
  console.log('  --json                   Emit machine-readable JSON summary')
  console.log('  --help, -h               Show this help message')
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    filters: [],
    outDir: null,
    skipBuild: false,
    includeManifestOnly: false,
    json: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      options.help = true
    }
    else if (arg === '--dry-run') {
      options.dryRun = true
    }
    else if (arg === '--skip-build') {
      options.skipBuild = true
    }
    else if (arg === '--include-manifest-only') {
      options.includeManifestOnly = true
    }
    else if (arg === '--json') {
      options.json = true
    }
    else if (arg === '--filter') {
      const next = argv[i + 1]
      if (!next || next.startsWith('-'))
        throw new Error('Missing value for --filter')
      options.filters.push(...next.split(',').map(v => v.trim()).filter(Boolean))
      i += 1
    }
    else if (arg.startsWith('--filter=')) {
      const value = arg.slice('--filter='.length)
      if (!value)
        throw new Error('Missing value for --filter')
      options.filters.push(...value.split(',').map(v => v.trim()).filter(Boolean))
    }
    else if (arg === '--out') {
      const next = argv[i + 1]
      if (!next || next.startsWith('-'))
        throw new Error('Missing value for --out')
      options.outDir = path.resolve(process.cwd(), next)
      i += 1
    }
    else if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length)
      if (!value)
        throw new Error('Missing value for --out')
      options.outDir = path.resolve(process.cwd(), value)
    }
    else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

async function loadCliCore() {
  const cliCoreDist = path.resolve(rootDir, 'packages', 'tuff-cli-core', 'dist', 'index.js')
  if (!fs.existsSync(cliCoreDist)) {
    throw new Error(
      `Missing built @talex-touch/tuff-cli-core at ${cliCoreDist}. Run \`pnpm -F @talex-touch/tuff-cli-core build\` first.`,
    )
  }
  return await import(pathToFileURL(cliCoreDist).href)
}

function hasViteConfig(pluginDir) {
  return ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']
    .some(file => fs.existsSync(path.join(pluginDir, file)))
}

function discoverPlugins(options) {
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'))

  const selected = []
  const skipped = []

  for (const dirName of entries) {
    const pluginDir = path.join(pluginsDir, dirName)
    const manifestPath = path.join(pluginDir, 'manifest.json')
    const packageJsonPath = path.join(pluginDir, 'package.json')
    const hasManifest = fs.existsSync(manifestPath)
    const hasPackageJson = fs.existsSync(packageJsonPath)

    let pkgName = null
    if (hasPackageJson) {
      try {
        pkgName = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')).name ?? null
      }
      catch {
        pkgName = null
      }
    }

    if (options.filters.length > 0) {
      const matches = options.filters.some(filter =>
        filter === dirName || (pkgName && filter === pkgName),
      )
      if (!matches)
        continue
    }

    if (!hasManifest) {
      skipped.push({ plugin: dirName, reason: 'no manifest.json (Surface-only)' })
      continue
    }

    if (!hasPackageJson && !options.includeManifestOnly) {
      skipped.push({ plugin: dirName, reason: 'manifest-only plugin (no package.json)' })
      continue
    }

    selected.push({ dirName, pluginDir, pkgName, hasPackageJson })
  }

  return { selected, skipped }
}

async function runQuietly(enabled, fn) {
  if (!enabled)
    return await fn()

  const origLog = console.log
  const origInfo = console.info
  const origWarn = console.warn
  console.log = () => {}
  console.info = () => {}
  console.warn = () => {}
  try {
    return await fn()
  }
  finally {
    console.log = origLog
    console.info = origInfo
    console.warn = origWarn
  }
}

async function packSinglePlugin(plugin, options, cliCore) {
  const { build, packNpmPlugin } = cliCore
  const { dirName, pluginDir } = plugin

  const tempRoot = options.dryRun
    ? fs.mkdtempSync(path.join(os.tmpdir(), `tuff-npm-pack-${dirName}-`))
    : null

  const outDir = tempRoot ? path.join(tempRoot, 'dist') : path.join(pluginDir, 'dist')
  const buildDir = path.join(outDir, 'build')
  const npmDir = path.join(outDir, 'npm')

  try {
    const existingBuildManifest = path.join(pluginDir, 'dist', 'build', 'manifest.json')
    let effectiveBuildDir = buildDir

    if (options.skipBuild && fs.existsSync(existingBuildManifest)) {
      effectiveBuildDir = path.join(pluginDir, 'dist', 'build')
    }
    else {
      const customBuildScript = path.join(pluginDir, 'build.mjs')
      if (hasViteConfig(pluginDir)) {
        const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
        execFileSync(
          pnpmCmd,
          ['--dir', pluginDir, 'exec', 'vite', 'build', '--outDir', outDir],
          {
            cwd: rootDir,
            stdio: options.json ? 'pipe' : 'inherit',
            shell: process.platform === 'win32',
          },
        )
        await runQuietly(options.json, () =>
          build({
            root: pluginDir,
            outDir,
            format: 'npm',
          }))
      }
      else if (fs.existsSync(customBuildScript)) {
        execFileSync(process.execPath, [customBuildScript, outDir], {
          cwd: pluginDir,
          stdio: options.json ? 'pipe' : 'inherit',
        })
      }
      else {
        await runQuietly(options.json, () =>
          build({
            root: pluginDir,
            outDir,
            format: 'npm',
          }))
      }
    }

    const tarballOutDir = !options.dryRun && options.outDir ? options.outDir : outDir
    const result = await packNpmPlugin({
      root: pluginDir,
      outDir,
      buildDir: effectiveBuildDir,
      npmDir,
      tarballOutDir,
      writeTarball: !options.dryRun,
    })

    return {
      ok: true,
      plugin: dirName,
      packageName: result.packageName,
      version: result.version,
      tarballFilename: result.tarballFilename,
      tarballPath: result.tarballPath ?? null,
      tarballSize: result.tarballSize,
      fileCount: result.fileCount,
      artifactSha256: result.artifactSha256,
      integrity: result.integrity,
      shasum: result.shasum,
      scanDecision: result.securityScan.decision,
    }
  }
  catch (error) {
    return {
      ok: false,
      plugin: dirName,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  finally {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const cliCore = await loadCliCore()
  const { selected, skipped } = discoverPlugins(options)

  if (selected.length === 0) {
    const message = options.filters.length > 0
      ? `No plugins matched --filter (${options.filters.join(', ')})`
      : 'No packable plugins found in plugins/'
    if (options.json) {
      console.log(JSON.stringify({ ok: false, error: message, results: [], skipped }, null, 2))
    }
    else {
      console.error(`\x1B[31m✗ ${message}\x1B[0m`)
    }
    process.exitCode = 1
    return
  }

  if (!options.dryRun && options.outDir) {
    fs.mkdirSync(options.outDir, { recursive: true })
  }

  if (!options.json) {
    const modeLabel = options.dryRun ? 'dry-run' : 'pack'
    console.log(`\nNPM plugin batch ${modeLabel}: ${selected.length} plugin(s)\n`)
    for (const item of skipped) {
      console.log(`  \x1B[33m-\x1B[0m [${item.plugin}] skipped (${item.reason})`)
    }
  }

  const results = []
  for (const plugin of selected) {
    const result = await packSinglePlugin(plugin, options, cliCore)
    results.push(result)

    if (!options.json) {
      if (result.ok) {
        const sizeKB = (result.tarballSize / 1024).toFixed(1)
        const dest = result.tarballPath ? ` -> ${path.relative(rootDir, result.tarballPath)}` : ' (dry-run)'
        console.log(
          `  \x1B[32m✓\x1B[0m [${result.plugin}] ${result.packageName}@${result.version}`
          + ` (${result.fileCount} files, ${sizeKB} KB, scan=${result.scanDecision})${dest}`,
        )
      }
      else {
        console.error(`  \x1B[31m✗\x1B[0m [${result.plugin}] ${result.error}`)
      }
    }
  }

  const passed = results.filter(r => r.ok)
  const failed = results.filter(r => !r.ok)

  const summary = {
    ok: failed.length === 0,
    dryRun: options.dryRun,
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    skipped,
    results,
  }

  if (!options.dryRun && options.outDir) {
    fs.writeFileSync(
      path.join(options.outDir, 'npm-pack-report.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf-8',
    )
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2))
  }
  else {
    console.log(`\n${passed.length}/${results.length} plugin(s) packed successfully.\n`)
  }

  if (failed.length > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
