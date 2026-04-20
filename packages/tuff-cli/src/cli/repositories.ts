import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import fs from 'fs-extra'
import { getCliConfigDir } from './runtime-config'

export interface RepositoryEntry {
  path: string
  name: string
  version?: string
  lastAction: string
  lastOpenedAt: string
}

export function getRepositoriesPath(): string {
  return path.join(getCliConfigDir(), 'repositories.json')
}

async function readRepositoryFile(): Promise<RepositoryEntry[]> {
  const repoPath = getRepositoriesPath()
  try {
    if (await fs.pathExists(repoPath)) {
      const data = await fs.readJson(repoPath)
      return Array.isArray(data) ? data as RepositoryEntry[] : []
    }
  }
  catch {
    // Ignore
  }
  return []
}

async function writeRepositoryFile(entries: RepositoryEntry[]): Promise<void> {
  const repoPath = getRepositoriesPath()
  await fs.ensureDir(path.dirname(repoPath))
  await fs.writeJson(repoPath, entries, { spaces: 2 })
}

function isPathInsideRoot(filePath: string, rootPath: string): boolean {
  const relative = path.relative(rootPath, filePath)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

async function resolvePathVariants(filePath: string): Promise<string[]> {
  const variants = new Set<string>([path.resolve(filePath)])
  try {
    variants.add(await fs.realpath(filePath))
  }
  catch {
    // Ignore paths that no longer exist.
  }
  return [...variants]
}

async function getTemporaryRoots(): Promise<string[]> {
  const rawTmp = path.resolve(os.tmpdir())
  const roots = new Set<string>([rawTmp])
  if (rawTmp.startsWith('/var/'))
    roots.add(path.join('/private', rawTmp.replace(/^\/+/, '')))
  try {
    const realTmp = await fs.realpath(rawTmp)
    roots.add(realTmp)
    if (realTmp.startsWith('/var/'))
      roots.add(path.join('/private', realTmp.replace(/^\/+/, '')))
  }
  catch {
    // Ignore
  }
  return [...roots]
}

async function isTemporaryRepositoryPath(repoPath: string): Promise<boolean> {
  const [variants, roots] = await Promise.all([
    resolvePathVariants(repoPath),
    getTemporaryRoots(),
  ])
  return variants.some(variant => roots.some(root => isPathInsideRoot(variant, root)))
}

function resolveRepoName(manifest: any, pkg: any, cwd: string): string {
  const manifestName = typeof manifest?.name === 'string' ? manifest.name.trim() : ''
  if (manifestName)
    return manifestName
  const packageName = typeof pkg?.name === 'string' ? pkg.name.trim() : ''
  if (packageName)
    return packageName
  return path.basename(cwd)
}

async function readManifest(cwd: string): Promise<any | null> {
  const manifestPath = path.join(cwd, 'manifest.json')
  if (await fs.pathExists(manifestPath)) {
    try {
      return await fs.readJson(manifestPath)
    }
    catch {
      return null
    }
  }
  return null
}

async function readPackageJson(cwd: string): Promise<any | null> {
  const pkgPath = path.join(cwd, 'package.json')
  if (await fs.pathExists(pkgPath)) {
    try {
      return await fs.readJson(pkgPath)
    }
    catch {
      return null
    }
  }
  return null
}

export async function trackRepository(action: string, cwd = process.cwd()): Promise<void> {
  if (await isTemporaryRepositoryPath(cwd))
    return

  const manifest = await readManifest(cwd)
  if (!manifest)
    return

  const pkg = await readPackageJson(cwd)
  const name = resolveRepoName(manifest, pkg, cwd)
  const version = typeof manifest?.version === 'string' ? manifest.version : (typeof pkg?.version === 'string' ? pkg.version : undefined)
  const now = new Date().toISOString()
  const entries = await readRepositoryFile()
  const existing = entries.find(item => item.path === cwd)

  if (existing) {
    existing.name = name
    existing.version = version
    existing.lastAction = action
    existing.lastOpenedAt = now
  }
  else {
    entries.push({
      path: cwd,
      name,
      version,
      lastAction: action,
      lastOpenedAt: now,
    })
  }

  entries.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
  await writeRepositoryFile(entries)
}

export async function listRepositories(): Promise<RepositoryEntry[]> {
  const entries = await readRepositoryFile()
  const visibleEntries = []
  for (const entry of entries) {
    if (await isTemporaryRepositoryPath(entry.path))
      continue
    visibleEntries.push(entry)
  }
  return visibleEntries.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
}
