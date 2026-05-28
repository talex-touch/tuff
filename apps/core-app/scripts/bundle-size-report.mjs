#!/usr/bin/env node
import { lstat, mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const coreAppRoot = path.resolve(__dirname, '..')

function printUsage() {
  console.log(`Usage:
  pnpm -C "apps/core-app" run perf:bundle:size [-- --json] [-- --output <file>]

Options:
  --root <path>     Core app root. Defaults to apps/core-app.
  --output <path>   Write the report to a file.
  --top <count>     Number of largest files to show. Default: 25.
  --json            Print JSON instead of Markdown.
  --help            Show this help.
`)
}

function parseArgs(argv) {
  const options = {
    root: coreAppRoot,
    output: null,
    top: 25,
    json: false
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      printUsage()
      return null
    }
    if (arg === '--root' && argv[i + 1]) {
      options.root = path.resolve(argv[++i])
      continue
    }
    if (arg === '--output' && argv[i + 1]) {
      options.output = argv[++i]
      continue
    }
    if (arg === '--top' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[++i], 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        options.top = parsed
      }
      continue
    }
    if (arg === '--json') {
      options.json = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

async function safeLstat(targetPath) {
  try {
    return await lstat(targetPath)
  } catch {
    return null
  }
}

async function walkDirectory(targetPath, rootPath = targetPath, entries = []) {
  let dirEntries = []
  try {
    dirEntries = await readdir(targetPath, { withFileTypes: true })
  } catch {
    return entries
  }

  for (const dirent of dirEntries) {
    const fullPath = path.join(targetPath, dirent.name)
    if (dirent.isSymbolicLink()) {
      continue
    }
    if (dirent.isDirectory()) {
      await walkDirectory(fullPath, rootPath, entries)
      continue
    }
    if (!dirent.isFile()) {
      continue
    }
    const stat = await safeLstat(fullPath)
    if (!stat) continue
    entries.push({
      path: path.relative(rootPath, fullPath) || dirent.name,
      absolutePath: fullPath,
      bytes: stat.size
    })
  }
  return entries
}

async function summarizePath(root, relativePath, topCount) {
  const absolutePath = path.resolve(root, relativePath)
  const stat = await safeLstat(absolutePath)
  if (!stat) {
    return {
      path: relativePath,
      exists: false,
      type: 'missing',
      bytes: 0,
      files: 0,
      topFiles: []
    }
  }

  if (stat.isFile()) {
    return {
      path: relativePath,
      exists: true,
      type: 'file',
      bytes: stat.size,
      files: 1,
      topFiles: [{ path: path.basename(relativePath), bytes: stat.size }]
    }
  }

  if (!stat.isDirectory()) {
    return {
      path: relativePath,
      exists: true,
      type: 'other',
      bytes: 0,
      files: 0,
      topFiles: []
    }
  }

  const files = await walkDirectory(absolutePath)
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0)
  const topFiles = files
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, topCount)
    .map((file) => ({ path: file.path, bytes: file.bytes }))

  return {
    path: relativePath,
    exists: true,
    type: 'directory',
    bytes,
    files: files.length,
    topFiles
  }
}

function createKnownTargets() {
  return [
    'out',
    'out/main',
    'out/preload',
    'out/renderer',
    'out/renderer/assets',
    'dist',
    'dist/mac-arm64/tuff.app/Contents/Resources',
    'dist/mac/tuff.app/Contents/Resources',
    'dist/win-unpacked/resources',
    'dist/linux-unpacked/resources'
  ]
}

function collectLargestFiles(targets, topCount) {
  const byPath = new Map()
  for (const target of targets) {
    for (const file of target.topFiles) {
      const scopedPath = `${target.path}/${file.path}`.replace(/\\/g, '/')
      const existing = byPath.get(scopedPath)
      if (!existing || existing.bytes < file.bytes) {
        byPath.set(scopedPath, { path: scopedPath, bytes: file.bytes })
      }
    }
  }
  return [...byPath.values()].sort((a, b) => b.bytes - a.bytes).slice(0, topCount)
}

function toMarkdown(report) {
  const lines = [
    '# CoreApp bundle size report',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Root: ${report.root}`,
    '',
    '## Target summary',
    '',
    '| Path | Status | Type | Files | Size |',
    '| --- | --- | --- | ---: | ---: |'
  ]

  for (const target of report.targets) {
    lines.push(
      `| ${target.path} | ${target.exists ? 'present' : 'missing'} | ${target.type} | ${target.files} | ${formatBytes(target.bytes)} |`
    )
  }

  lines.push('', '## Largest files', '', '| File | Size |', '| --- | ---: |')
  for (const file of report.largestFiles) {
    lines.push(`| ${file.path} | ${formatBytes(file.bytes)} |`)
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- This report only inspects existing build artifacts; run `build:vite` or `build:unpack` before comparing baselines.',
    '- Use JSON output for CI artifacts or spreadsheet comparison: `-- --json --output <file>`.'
  )

  return `${lines.join('\n')}\n`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options) return

  const targets = []
  for (const target of createKnownTargets()) {
    targets.push(await summarizePath(options.root, target, options.top))
  }

  const report = {
    generatedAt: new Date().toISOString(),
    root: options.root,
    targets,
    largestFiles: collectLargestFiles(targets, options.top)
  }
  const output = options.json ? `${JSON.stringify(report, null, 2)}\n` : toMarkdown(report)

  if (options.output) {
    const outputPath = path.resolve(options.output)
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, output, 'utf8')
  }

  process.stdout.write(output)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
