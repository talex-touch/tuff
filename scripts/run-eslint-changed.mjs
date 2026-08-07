#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '..')
const lintExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.vue', '.mjs', '.cjs', '.cts', '.mts'])

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  })

  if (result.stdout)
    process.stdout.write(result.stdout)
  if (result.stderr)
    process.stderr.write(result.stderr)
  return result.status ?? 1
}

function isWorkspaceDirectory(relativePath) {
  return fs.existsSync(path.join(workspaceRoot, relativePath, 'package.json'))
}

function collectWorkspaceDirectories() {
  const directWorkspaces = ['apps/core-app', 'apps/nexus']
  const workspaceParents = ['packages', 'plugins']
  const workspaces = []

  for (const workspace of directWorkspaces) {
    if (isWorkspaceDirectory(workspace)) {
      workspaces.push(workspace)
    }
  }

  for (const parent of workspaceParents) {
    const absoluteParent = path.join(workspaceRoot, parent)
    if (!fs.existsSync(absoluteParent)) {
      continue
    }

    for (const entry of fs.readdirSync(absoluteParent, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }

      const workspace = `${parent}/${entry.name}`
      if (isWorkspaceDirectory(workspace)) {
        workspaces.push(workspace)
      }
    }
  }

  const nestedWorkspaces = ['packages/tuffex/packages/components']
  for (const workspace of nestedWorkspaces) {
    if (isWorkspaceDirectory(workspace)) {
      workspaces.push(workspace)
    }
  }

  return workspaces
    .map(workspace => workspace.replaceAll(path.sep, '/'))
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
}

function getDiffArgs() {
  const baseRef = process.env.GITHUB_BASE_REF
  if (!baseRef) {
    return ['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD']
  }

  const remoteBaseRef = `refs/remotes/origin/${baseRef}`
  const fetchStatus = run('git', ['fetch', '--no-tags', 'origin', `${baseRef}:${remoteBaseRef}`])
  if (fetchStatus !== 0) {
    process.exit(fetchStatus)
  }

  return ['diff', '--name-only', '--diff-filter=ACMRTUXB', `${remoteBaseRef}...HEAD`]
}

function getChangedFiles() {
  const result = spawnSync(
    'git',
    getDiffArgs(),
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
    },
  )

  if (result.status !== 0) {
    if (result.stderr)
      process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }

  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map(file => file.replaceAll(path.sep, '/'))
    .filter(file => lintExtensions.has(path.extname(file)))
}

export function groupByWorkspace(files, workspaces = collectWorkspaceDirectories()) {
  const groups = new Map()
  const rootFiles = []

  for (const file of files) {
    const workspace = workspaces.find(prefix => file === prefix || file.startsWith(`${prefix}/`))
    if (!workspace) {
      rootFiles.push(file)
      continue
    }
    const relativeFile = file.slice(workspace.length + 1)
    if (!relativeFile)
      continue
    const list = groups.get(workspace) ?? []
    list.push(relativeFile)
    groups.set(workspace, list)
  }

  return { groups, rootFiles }
}

/**
 * `--max-warnings=0` mirrors the root `lint` script. Without it this PR gate
 * accepted warning-level violations that the release gate then rejected.
 */
export function buildWorkspaceArgs(workspace, files) {
  return [
    'pnpm',
    '-C',
    workspace,
    'exec',
    'eslint',
    '--cache',
    '--max-warnings=0',
    '--no-warn-ignored',
    ...files,
  ]
}

export function buildRootArgs(files) {
  return ['pnpm', 'exec', 'eslint', '--cache', '--max-warnings=0', '--no-warn-ignored', ...files]
}

function lintWorkspace(workspace, files) {
  console.log(`[lint:changed] ${workspace}: ${files.length} file(s)`)
  return run('corepack', buildWorkspaceArgs(workspace, files))
}

function lintRoot(files) {
  console.log(`[lint:changed] root: ${files.length} file(s)`)
  return run('corepack', buildRootArgs(files))
}

function main() {
  const files = getChangedFiles()
  if (files.length === 0) {
    console.log('[lint:changed] OK: no changed JS/TS/Vue files.')
    return
  }

  const { groups, rootFiles } = groupByWorkspace(files)
  let exitCode = 0

  for (const [workspace, workspaceFiles] of groups.entries()) {
    const code = lintWorkspace(workspace, workspaceFiles)
    if (code !== 0)
      exitCode = code
  }

  if (rootFiles.length > 0) {
    const code = lintRoot(rootFiles)
    if (code !== 0)
      exitCode = code
  }

  if (exitCode !== 0) {
    process.exit(exitCode)
  }

  console.log('[lint:changed] OK')
}

// Guarded so the tests can import the pure helpers without running the gate.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main()
}
