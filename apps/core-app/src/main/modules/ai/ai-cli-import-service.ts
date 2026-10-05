import type {
  AiCliProviderId,
  AiConfigImportCandidate,
  AiImportApplyRequest,
  AiImportApplyResult,
  AiImportCandidate,
  AiImportedConfigItem,
  AiImportItemKind,
  AiImportPreviewRequest,
  AiImportScanResult,
  AiImportScope,
  AiImportSourceSnapshot,
  AiMcpImportCandidate
} from '@talex-touch/utils/types/ai-orchestrator'
import type { AiImportHeldMcpServers } from './ai-import-runtime'
import type { AiPreparedImportCommitOptions } from './ai-orchestrator-store'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, opendir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import {
  basename,
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  matchesGlob,
  relative,
  resolve
} from 'node:path'
import process from 'node:process'
import { aiOrchestratorStore } from './ai-orchestrator-store'
import { readBoundedImportFile } from './ai-import-bounded-file'
import { parseConfig, parseMcpProfiles } from './ai-import-config-parser'
import { aiImportRuntimeService } from './ai-import-runtime'
import { aiImportedConfigRuntime, mcpProfilesFromItem } from './ai-imported-config-runtime'

interface SourceLayout {
  provider: AiCliProviderId
  label: string
  command: string
  userRoot: string
  userFiles: Array<{ path: string; kind: AiImportItemKind }>
  userDirs: Array<{ path: string; kind: AiImportItemKind }>
  /**
   * Absolute MCP config files outside `userRoot`. They get their own reader: `.claude.json` is a
   * large application-state document, and the only part of it this feature needs is the `mcpServers`
   * block.
   */
  userMcpFiles?: Array<{ path: string; name: string }>
  projectFiles: Array<{ path: string; kind: AiImportItemKind }>
  projectDirs: Array<{ path: string; kind: AiImportItemKind }>
}

interface CandidateMetadata {
  name?: string
  description?: string
  keyPaths?: string[]
  sensitiveKeyPaths?: string[]
  serverNames?: string[]
  transportTypes?: string[]
  secretKeyPaths?: string[]
  mode?: string
  globs?: string[]
  alwaysApply?: boolean
  frontmatterKeys?: string[]
}

const SENSITIVE_KEY_PATTERN = /token|api.?key|secret|password|credential|authorization|authref/i
const IMPORTABLE_FILE_EXTENSIONS = new Set(['.md', '.json', '.jsonc', '.toml', '.yaml', '.yml'])
const MAX_SCAN_DEPTH = 4
const MAX_SCAN_FILES_PER_SOURCE = 2_000
const MAX_SCAN_ENTRIES_PER_SOURCE = 8_000

function layouts(home: string): SourceLayout[] {
  return [
    {
      provider: 'codex',
      label: 'Codex',
      command: 'codex',
      userRoot: process.env.CODEX_HOME || join(home, '.codex'),
      userFiles: [
        { path: 'config.toml', kind: 'config' },
        { path: 'AGENTS.md', kind: 'instruction' }
      ],
      userDirs: [
        { path: 'skills', kind: 'skill' },
        { path: 'prompts', kind: 'command' }
      ],
      projectFiles: [
        { path: '.codex/config.toml', kind: 'config' },
        { path: 'AGENTS.md', kind: 'instruction' }
      ],
      projectDirs: [
        { path: '.codex/skills', kind: 'skill' },
        { path: '.codex/commands', kind: 'command' },
        { path: '.codex/prompts', kind: 'command' },
        { path: '.agents/skills', kind: 'skill' }
      ]
    },
    {
      provider: 'claude',
      label: 'Claude Code',
      command: 'claude',
      userRoot: join(home, '.claude'),
      userFiles: [
        { path: 'settings.json', kind: 'config' },
        { path: 'CLAUDE.md', kind: 'instruction' }
      ],
      userDirs: [
        { path: 'skills', kind: 'skill' },
        { path: 'commands', kind: 'command' },
        { path: 'agents', kind: 'agent' },
        { path: 'rules', kind: 'rule' }
      ],
      // MCP servers live beside the settings directory rather than inside it. Read as an MCP file,
      // not as a config one: the same document holds the CLI's project history, and importing it as
      // configuration would sweep that in with three server definitions.
      userMcpFiles: [{ path: join(home, '.claude.json'), name: 'Claude Code MCP' }],
      projectFiles: [
        { path: 'CLAUDE.md', kind: 'instruction' },
        { path: '.mcp.json', kind: 'mcp' },
        { path: '.claude/settings.json', kind: 'config' }
      ],
      projectDirs: [
        { path: '.claude/skills', kind: 'skill' },
        { path: '.claude/commands', kind: 'command' },
        { path: '.claude/agents', kind: 'agent' },
        { path: '.claude/rules', kind: 'rule' }
      ]
    },
    {
      provider: 'pi',
      label: 'Pi',
      command: 'pi',
      userRoot: join(home, '.pi', 'agent'),
      userFiles: [
        { path: 'settings.json', kind: 'config' },
        { path: 'models.json', kind: 'config' },
        { path: 'AGENTS.md', kind: 'instruction' }
      ],
      userDirs: [
        { path: 'skills', kind: 'skill' },
        { path: 'prompts', kind: 'command' }
      ],
      // The agent's own user-level MCP file (pi-mcp-adapter's), named after the agent, not the file.
      userMcpFiles: [{ path: join(home, '.pi', 'agent', 'mcp.json'), name: 'Pi MCP' }],
      projectFiles: [
        { path: 'AGENTS.md', kind: 'instruction' },
        { path: '.pi/settings.json', kind: 'config' }
      ],
      projectDirs: [
        { path: '.pi/skills', kind: 'skill' },
        { path: '.pi/prompts', kind: 'command' }
      ]
    },
    {
      provider: 'oh-my-pi',
      label: 'Oh My Pi',
      command: 'omp',
      userRoot: join(home, '.omp', 'agent'),
      userFiles: [
        { path: 'config.yml', kind: 'config' },
        { path: 'settings.json', kind: 'config' },
        { path: 'AGENTS.md', kind: 'instruction' },
        { path: 'SYSTEM.md', kind: 'instruction' }
      ],
      userDirs: [
        { path: 'skills', kind: 'skill' },
        { path: 'commands', kind: 'command' },
        { path: 'rules', kind: 'rule' },
        { path: 'prompts', kind: 'command' },
        { path: 'instructions', kind: 'instruction' }
      ],
      userMcpFiles: [{ path: join(home, '.omp', 'agent', 'mcp.json'), name: 'Oh My Pi MCP' }],
      projectFiles: [
        { path: '.omp/config.yml', kind: 'config' },
        { path: '.omp/settings.json', kind: 'config' },
        { path: '.omp/AGENTS.md', kind: 'instruction' },
        { path: '.omp/SYSTEM.md', kind: 'instruction' }
      ],
      projectDirs: [
        { path: '.omp/skills', kind: 'skill' },
        { path: '.omp/commands', kind: 'command' },
        { path: '.omp/rules', kind: 'rule' },
        { path: '.omp/prompts', kind: 'command' },
        { path: '.omp/instructions', kind: 'instruction' }
      ]
    },
    {
      provider: 'opencode',
      label: 'OpenCode',
      command: 'opencode',
      userRoot: join(home, '.config', 'opencode'),
      userFiles: [
        { path: 'opencode.json', kind: 'config' },
        { path: 'opencode.jsonc', kind: 'config' },
        { path: 'AGENTS.md', kind: 'instruction' }
      ],
      userDirs: [
        { path: 'skills', kind: 'skill' },
        { path: 'commands', kind: 'command' },
        { path: 'agents', kind: 'agent' },
        { path: 'rules', kind: 'rule' }
      ],
      projectFiles: [
        { path: 'opencode.json', kind: 'config' },
        { path: 'opencode.jsonc', kind: 'config' },
        { path: 'AGENTS.md', kind: 'instruction' }
      ],
      projectDirs: [
        { path: '.opencode/skills', kind: 'skill' },
        { path: '.opencode/commands', kind: 'command' },
        { path: '.opencode/agents', kind: 'agent' },
        { path: '.opencode/rules', kind: 'rule' }
      ]
    }
  ]
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return false
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sourceId(provider: AiCliProviderId, scope: AiImportScope, rootPath: string): string {
  return `${provider}:${scope}:${hash(resolve(rootPath)).slice(0, 16)}`
}

async function findExecutable(command: string): Promise<string | undefined> {
  const extensions =
    process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : ['']
  const entries = (process.env.PATH || '').split(delimiter).filter(Boolean)
  for (const entry of entries) {
    for (const extension of extensions) {
      const candidate = join(entry, `${command}${extension}`)
      if (await isExecutableFile(candidate)) return candidate
    }
  }
  return undefined
}

function parseFrontmatter(content: string): CandidateMetadata {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end < 0) return {}
  const metadata: CandidateMetadata = { frontmatterKeys: [] }
  const lines = content.slice(3, end).split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index]!.trim()
    const colonIndex = trimmed.indexOf(':')
    if (colonIndex <= 0) continue
    const key = trimmed.slice(0, colonIndex).toLowerCase()
    if (!/^[\w-]+$/.test(key)) continue
    metadata.frontmatterKeys!.push(key)
    const value = trimmed
      .slice(colonIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    if (key === 'name') metadata.name = value
    if (key === 'description') metadata.description = value
    if (key === 'mode') metadata.mode = value
    if (key === 'always-apply' || key === 'alwaysapply') {
      metadata.alwaysApply = value.toLowerCase() === 'true'
    }
    if (key === 'paths' || key === 'path' || key === 'globs' || key === 'glob') {
      const globs: string[] = []
      const inline = value.replace(/^\[|\]$/g, '')
      if (inline) {
        globs.push(
          ...inline
            .split(',')
            .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean)
        )
      } else {
        while (index + 1 < lines.length) {
          const match = /^\s*-\s*(.+?)\s*$/.exec(lines[index + 1]!)
          if (!match) break
          globs.push(match[1]!.replace(/^['"]|['"]$/g, ''))
          index += 1
        }
      }
      metadata.globs = [...new Set([...(metadata.globs ?? []), ...globs])]
    }
  }
  return metadata
}

function ignoredFrontmatter(metadata: CandidateMetadata, allowed: string[]): string[] {
  const allowedKeys = new Set(allowed)
  return (metadata.frontmatterKeys ?? []).filter((key) => !allowedKeys.has(key))
}

function collectObjectMetadata(
  value: unknown,
  pathParts: string[],
  keyPaths: string[],
  sensitiveKeyPaths: string[]
): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = [...pathParts, key]
    const path = nextPath.join('.')
    if (SENSITIVE_KEY_PATTERN.test(path)) sensitiveKeyPaths.push(path)
    else keyPaths.push(path)
    collectObjectMetadata(nested, nextPath, keyPaths, sensitiveKeyPaths)
  }
}

function configMetadata(content: string, extension: string): CandidateMetadata {
  const parsed = parseConfig(content, extension)
  if (!parsed)
    return {
      keyPaths: [],
      sensitiveKeyPaths: [],
      serverNames: [],
      transportTypes: [],
      secretKeyPaths: []
    }

  const keyPaths: string[] = []
  const sensitiveKeyPaths: string[] = []
  collectObjectMetadata(parsed, [], keyPaths, sensitiveKeyPaths)
  const profiles = parseMcpProfiles(parsed)
  const secretKeyPaths = profiles.flatMap((profile) => {
    const prefix = `${profile.rootKey}.${profile.name}`
    return [
      ...Object.keys(profile.env).map((key) => `${prefix}.env.${key}`),
      ...Object.keys(profile.headers).map((key) => `${prefix}.headers.${key}`),
      ...(profile.bearerToken ? [`${prefix}.bearer_token`] : []),
      ...(profile.requiresReauth ? [`${prefix}.reauth-required`] : [])
    ]
  })
  return {
    keyPaths: Array.from(new Set(keyPaths)).sort(),
    sensitiveKeyPaths: Array.from(new Set(sensitiveKeyPaths)).sort(),
    serverNames: profiles.map((profile) => profile.name).sort(),
    transportTypes: Array.from(new Set(profiles.map((profile) => profile.type))).sort(),
    secretKeyPaths: Array.from(new Set(secretKeyPaths)).sort()
  }
}

/**
 * Metadata for a file whose remaining contents are none of this feature's business.
 *
 * {@link configMetadata} walks the whole document, which is right for a CLI's own config and wrong
 * for a file like `.claude.json`: it would put thousands of unrelated key paths into the scan record
 * to describe three servers.
 */
function mcpFileMetadata(content: string, extension: string): CandidateMetadata {
  const parsed = parseConfig(content, extension)
  if (!parsed)
    return {
      keyPaths: [],
      sensitiveKeyPaths: [],
      serverNames: [],
      transportTypes: [],
      secretKeyPaths: []
    }
  const profiles = parseMcpProfiles(parsed)
  const secretKeyPaths = profiles.flatMap((profile) => {
    const prefix = `${profile.rootKey}.${profile.name}`
    return [
      ...Object.keys(profile.env).map((key) => `${prefix}.env.${key}`),
      ...Object.keys(profile.headers).map((key) => `${prefix}.headers.${key}`),
      ...(profile.bearerToken ? [`${prefix}.bearer_token`] : []),
      ...(profile.requiresReauth ? [`${prefix}.reauth-required`] : [])
    ]
  })
  return {
    keyPaths: [],
    sensitiveKeyPaths: [],
    serverNames: profiles.map((profile) => profile.name).sort(),
    transportTypes: Array.from(new Set(profiles.map((profile) => profile.type))).sort(),
    secretKeyPaths: Array.from(new Set(secretKeyPaths)).sort()
  }
}

async function readCandidateFile(
  sourceRoot: string,
  path: string
): Promise<{ canonicalPath: string; content: string; updatedAt: number }> {
  return await readBoundedImportFile(sourceRoot, path)
}

/**
 * Where a candidate came from, enough to tell two of one agent's files apart: the scope, labelled
 * as the sources are (`User` / `Project`), and the file's path from that source's root. A file kept
 * outside the root (`~/.claude.json` beside `~/.claude`) goes by its file name.
 */
function candidateOrigin(candidate: AiImportCandidate, root: string | undefined): string {
  const fromRoot = root ? relative(root, candidate.path) : ''
  const file =
    fromRoot && !fromRoot.startsWith('..') && !isAbsolute(fromRoot)
      ? fromRoot
      : basename(candidate.path)
  return `${candidate.scope === 'user' ? 'User' : 'Project'} ${file}`
}

/**
 * One preview names an agent's MCP rows apart. The first keeps its name; a later one whose name the
 * agent already has is followed by where it came from, so the user's and the project's
 * `config.toml` never read alike (`Codex MCP · Project .codex/config.toml`), and by a count should
 * even that be taken.
 */
function distinguishSameNamedMcpCandidates(
  candidates: AiImportCandidate[],
  sources: AiImportSourceSnapshot[]
): AiImportCandidate[] {
  const roots = new Map(sources.map((source) => [source.id, source.rootPath]))
  const taken = new Set<string>()
  return candidates.map((candidate) => {
    if (candidate.kind !== 'mcp') return candidate
    const isTaken = (name: string): boolean => taken.has(`${candidate.provider}\0${name}`)
    let name = candidate.name
    if (isTaken(name)) {
      const origin = candidateOrigin(candidate, roots.get(candidate.sourceId))
      const named = `${candidate.name} · ${origin}`
      name = named
      for (let count = 2; isTaken(name); count += 1) name = `${named} (${count})`
    }
    taken.add(`${candidate.provider}\0${name}`)
    return name === candidate.name ? candidate : { ...candidate, name }
  })
}

function candidateName(path: string, metadata: CandidateMetadata): string {
  if (metadata.name) return metadata.name
  const file = basename(path)
  return file.toLowerCase() === 'skill.md'
    ? basename(resolve(path, '..'))
    : file.replace(extname(file), '')
}

async function buildCandidate(
  source: AiImportSourceSnapshot,
  kind: AiImportItemKind,
  path: string,
  options: {
    /**
     * Directory the file must stay inside. `userRoot` except for the MCP files an agent keeps
     * beside its config directory, where the root is the directory holding the file itself.
     */
    containedBy?: string
    nameOverride?: string
    /**
     * The agent's display name (`Codex`). The MCP servers a config file declares are named after
     * it: the file's own name (`config`) says nothing about whose servers they are.
     */
    agentLabel?: string
  } = {}
): Promise<AiImportCandidate[]> {
  const { containedBy = source.rootPath, nameOverride, agentLabel } = options
  try {
    const { canonicalPath, content, updatedAt } = await readCandidateFile(containedBy, path)
    // A file held to a directory other than the source's root carries that directory, so applying
    // it re-reads the file under the same containment rather than one it was never inside.
    const ownContainment =
      options.containedBy === undefined ? undefined : await realpath(options.containedBy)
    const extension = extname(canonicalPath).toLowerCase()
    const metadata =
      kind === 'mcp'
        ? mcpFileMetadata(content, extension)
        : kind === 'config'
          ? configMetadata(content, extension)
          : parseFrontmatter(content)
    const base = {
      id: `${source.id}:${kind}:${hash(canonicalPath).slice(0, 20)}`,
      sourceId: source.id,
      provider: source.provider,
      scope: source.scope,
      targetScope: source.scope === 'user' ? ('global' as const) : ('workspace' as const),
      canonicalRootId: source.id,
      sourceKey: `${kind}:${relative(containedBy, canonicalPath)}`,
      kind,
      name: nameOverride ?? candidateName(canonicalPath, metadata),
      path: canonicalPath,
      ...(ownContainment && ownContainment !== source.rootPath
        ? { containedBy: ownContainment }
        : {}),
      fingerprint: hash(content),
      updatedAt,
      warnings: [] as string[],
      state: 'added' as const,
      ignoredFields: [] as string[],
      blockingIssues: [] as string[]
    }

    if (kind === 'skill')
      return [
        {
          ...base,
          kind,
          description: metadata.description || '',
          manifestPath: canonicalPath,
          ignoredFields: ignoredFrontmatter(metadata, ['name', 'description'])
        }
      ]
    if (kind === 'agent')
      return [
        {
          ...base,
          kind,
          description: metadata.description || '',
          mode: metadata.mode,
          ignoredFields: ignoredFrontmatter(metadata, ['name', 'description', 'mode'])
        }
      ]
    if (kind === 'command')
      return [
        {
          ...base,
          kind,
          description: metadata.description || '',
          ignoredFields: ignoredFrontmatter(metadata, ['name', 'description'])
        }
      ]
    if (kind === 'rule' || kind === 'instruction') {
      const globs = kind === 'rule' ? (metadata.globs ?? []) : []
      const invalidGlobs = globs.filter((glob) => {
        if (isAbsolute(glob) || glob === '..' || glob.startsWith('../')) return true
        try {
          matchesGlob('probe/path.ts', glob)
          return false
        } catch {
          return true
        }
      })
      return [
        {
          ...base,
          kind,
          description: metadata.description || '',
          globs,
          alwaysApply: kind === 'instruction' ? true : (metadata.alwaysApply ?? globs.length === 0),
          ignoredFields: ignoredFrontmatter(
            metadata,
            kind === 'rule'
              ? [
                  'name',
                  'description',
                  'paths',
                  'path',
                  'globs',
                  'glob',
                  'always-apply',
                  'alwaysapply'
                ]
              : ['name', 'description']
          ),
          blockingIssues:
            invalidGlobs.length > 0
              ? [`Rule contains invalid or out-of-workspace globs: ${invalidGlobs.join(', ')}`]
              : []
        }
      ]
    }

    const hasMcpProjection = (metadata.serverNames?.length ?? 0) > 0
    const mcpCandidate: AiMcpImportCandidate = {
      ...base,
      id: kind === 'config' ? `${base.id}:mcp` : base.id,
      sourceKey: `mcp:${relative(source.rootPath, canonicalPath)}`,
      kind: 'mcp',
      name: kind === 'config' ? `${agentLabel ?? base.name} MCP` : base.name,
      serverNames: metadata.serverNames ?? [],
      transportTypes: metadata.transportTypes ?? [],
      secretKeyPaths: metadata.secretKeyPaths ?? [],
      ignoredFields: (metadata.keyPaths ?? []).filter((key) => !/(?:^|\.)mcp/i.test(key)),
      blockingIssues: hasMcpProjection
        ? []
        : ['No supported MCP stdio or HTTP profile was found in this configuration']
    }
    if (kind === 'mcp') return [mcpCandidate]

    const config: AiConfigImportCandidate = {
      ...base,
      kind: 'config',
      keyPaths: metadata.keyPaths ?? [],
      sensitiveKeyPaths: metadata.sensitiveKeyPaths ?? [],
      ignoredFields: metadata.keyPaths ?? [],
      blockingIssues: ['Provider and authentication configuration is preview-only']
    }
    return hasMcpProjection ? [config, mcpCandidate] : [config]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    const warning = error instanceof Error ? error.message : String(error)
    source.warnings.push(`${resolve(path)}: ${warning}`)
    return []
  }
}

async function listFiles(
  sourceRoot: string,
  root: string,
  kind: AiImportItemKind,
  budget: { remainingEntries: number; remainingFiles: number },
  depth = 0
): Promise<string[]> {
  if (depth > MAX_SCAN_DEPTH || budget.remainingEntries <= 0 || budget.remainingFiles <= 0)
    return []
  let canonicalRoot: string
  try {
    canonicalRoot = await realpath(root)
    const path = relative(sourceRoot, canonicalRoot)
    if (path.startsWith('..') || isAbsolute(path)) return []
  } catch {
    return []
  }

  const results: string[] = []
  try {
    const directory = await opendir(canonicalRoot)
    for await (const entry of directory) {
      if (budget.remainingEntries-- <= 0 || budget.remainingFiles <= 0) break
      if (entry.isSymbolicLink()) continue
      const path = join(canonicalRoot, entry.name)
      if (entry.isDirectory()) {
        results.push(...(await listFiles(sourceRoot, path, kind, budget, depth + 1)))
        continue
      }
      if (!entry.isFile()) continue
      const extension = extname(entry.name).toLowerCase()
      if (!IMPORTABLE_FILE_EXTENSIONS.has(extension)) continue
      if (kind === 'skill' && entry.name.toLowerCase() !== 'skill.md') continue
      budget.remainingFiles -= 1
      results.push(path)
    }
  } catch {
    return results
  }
  return results.sort()
}

async function scanSource(
  layout: SourceLayout,
  scope: AiImportScope,
  rootPath: string,
  executablePath: string | undefined,
  fileSpecs: SourceLayout['userFiles'],
  dirSpecs: SourceLayout['userDirs'],
  scannedAt: number,
  mcpFiles: NonNullable<SourceLayout['userMcpFiles']> = []
): Promise<{ source: AiImportSourceSnapshot; candidates: AiImportCandidate[] }> {
  let canonicalRoot = resolve(rootPath)
  try {
    canonicalRoot = await realpath(rootPath)
  } catch {
    // An absent source still has a stable resolved snapshot, but no candidates.
  }
  const source: AiImportSourceSnapshot = {
    id: sourceId(layout.provider, scope, canonicalRoot),
    provider: layout.provider,
    label: `${layout.label} ${scope === 'user' ? 'User' : 'Project'}`,
    scope,
    rootPath: canonicalRoot,
    executablePath,
    installed: Boolean(executablePath),
    scannedAt,
    fingerprint: '',
    warnings: []
  }
  const candidates: AiImportCandidate[] = []
  for (const file of fileSpecs)
    candidates.push(
      ...(await buildCandidate(source, file.kind, join(canonicalRoot, file.path), {
        agentLabel: layout.label
      }))
    )

  // Contained by their own directory: these live next to the agent's config root, not inside it.
  for (const file of mcpFiles)
    candidates.push(
      ...(await buildCandidate(source, 'mcp', file.path, {
        containedBy: dirname(file.path),
        nameOverride: file.name
      }))
    )

  const budget = {
    remainingEntries: MAX_SCAN_ENTRIES_PER_SOURCE,
    remainingFiles: MAX_SCAN_FILES_PER_SOURCE
  }
  for (const dir of dirSpecs) {
    const paths = await listFiles(source.rootPath, join(canonicalRoot, dir.path), dir.kind, budget)
    for (const path of paths) candidates.push(...(await buildCandidate(source, dir.kind, path)))
  }
  source.installed = source.installed || candidates.length > 0
  source.fingerprint = hash(
    candidates
      .map((candidate) => `${candidate.id}:${candidate.fingerprint}`)
      .sort()
      .join('\n')
  )
  return { source, candidates }
}

/**
 * Checks a request's server picks against the scan they name, before any file is read or secret
 * looked at: each must be for an MCP candidate this apply selects from that scan, and may only name
 * servers the scan found in it.
 */
function assertServerPicksFitScan(
  scan: AiImportScanResult,
  selectedIds: ReadonlySet<string>,
  picks: AiImportApplyRequest['mcpServers']
): void {
  if (picks === undefined) return
  if (!picks || typeof picks !== 'object' || Array.isArray(picks))
    throw new Error('mcpServers must map candidate ids to server picks')
  const isNameList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((name) => typeof name === 'string')
  const candidates = new Map(scan.candidates.map((candidate) => [candidate.id, candidate]))
  for (const [candidateId, pick] of Object.entries(picks)) {
    if (!selectedIds.has(candidateId))
      throw new Error(
        `MCP server selection names candidate ${candidateId}, which this apply does not select`
      )
    const candidate = candidates.get(candidateId)
    if (!candidate)
      throw new Error(
        `MCP server selection names candidate ${candidateId}, which scan ${scan.scanId} did not find`
      )
    if (candidate.kind !== 'mcp')
      throw new Error(`MCP server selection names candidate ${candidateId}, which is not MCP`)
    const include: unknown = pick?.include
    const disabled: unknown = pick?.disabled ?? []
    if (!isNameList(include) || !isNameList(disabled))
      throw new Error(`MCP server selection for candidate ${candidateId} must list server names`)
    if (include.length === 0) throw new Error(`MCP candidate ${candidateId} selects no server`)
    const declared = new Set(candidate.serverNames)
    const undeclared = [...new Set(include.filter((name) => !declared.has(name)))]
    if (undeclared.length > 0)
      throw new Error(
        `MCP candidate ${candidateId} does not declare server ${undeclared.join(', ')}`
      )
    const stray = [...new Set(disabled.filter((name) => !include.includes(name)))]
    if (stray.length > 0)
      throw new Error(
        `MCP candidate ${candidateId} switches off server ${stray.join(', ')} it does not import`
      )
  }
}

/** The servers of a stored MCP item, by name, each with whether the runtime runs it now. */
function heldServers(item: AiImportedConfigItem): AiImportHeldMcpServers {
  const live = item.active && item.state === 'active'
  return new Map(
    mcpProfilesFromItem(item).map((profile) => [
      profile.name,
      { running: live && profile.enabled !== false }
    ])
  )
}

/**
 * For each MCP candidate a request picks servers of: the servers Tuff already holds from it, which
 * the pick adds to, and what the commit must honour — the item that was read, so a switch flipped
 * before the commit is not silently undone, and whether the pick turns a server on, which the item
 * then has to run for. A request without picks merges nothing.
 */
async function mergeWithHeldServers(
  selected: AiImportCandidate[],
  picks: AiImportApplyRequest['mcpServers']
): Promise<{
  held: Map<string, AiImportHeldMcpServers>
  commit: AiPreparedImportCommitOptions
}> {
  const held = new Map<string, AiImportHeldMcpServers>()
  const basedOn = new Map<string, { itemId: string; updatedAt: number; active: boolean } | null>()
  const activate = new Set<string>()
  const picked = selected.filter((candidate) => candidate.kind === 'mcp' && picks?.[candidate.id])
  if (picked.length > 0) {
    const items = await aiOrchestratorStore.listImportedItems()
    for (const candidate of picked) {
      const pick = picks![candidate.id]!
      const item = items.find(
        (stored) => stored.candidateId === candidate.id && stored.kind === 'mcp'
      )
      basedOn.set(
        candidate.id,
        item ? { itemId: item.id, updatedAt: item.updatedAt, active: item.active } : null
      )
      if (item) held.set(candidate.id, heldServers(item))
      const switchedOff = new Set(pick.disabled ?? [])
      if (pick.include.some((name) => !switchedOff.has(name))) activate.add(candidate.id)
    }
  }
  return { held, commit: { activate, basedOn } }
}

export class AiCliImportService {
  private importMutex: Promise<void> = Promise.resolve()

  private async serializeImport<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.importMutex
    let release!: () => void
    this.importMutex = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await work()
    } finally {
      release()
    }
  }

  async preview(request: AiImportPreviewRequest = {}): Promise<AiImportScanResult> {
    const cwd = await realpath(request.cwd || process.cwd())
    const providerFilter = request.providerIds ? new Set(request.providerIds) : null
    const scannedAt = Date.now()
    const sources: AiImportSourceSnapshot[] = []
    const candidates: AiImportCandidate[] = []

    for (const layout of layouts(homedir())) {
      if (providerFilter && !providerFilter.has(layout.provider)) continue
      const executablePath = await findExecutable(layout.command)
      const [userResult, projectResult] = await Promise.all([
        scanSource(
          layout,
          'user',
          layout.userRoot,
          executablePath,
          layout.userFiles,
          layout.userDirs,
          scannedAt,
          layout.userMcpFiles ?? []
        ),
        scanSource(
          layout,
          'project',
          cwd,
          executablePath,
          layout.projectFiles,
          layout.projectDirs,
          scannedAt
        )
      ])
      sources.push(userResult.source, projectResult.source)
      candidates.push(...userResult.candidates, ...projectResult.candidates)
    }

    const activeCandidates = await aiOrchestratorStore.listActiveImportCandidates(
      sources.map((source) => source.id)
    )
    const activeById = new Map(activeCandidates.map((candidate) => [candidate.id, candidate]))
    const detected = distinguishSameNamedMcpCandidates(candidates, sources).map((candidate) => {
      const active = activeById.get(candidate.id)
      return {
        ...candidate,
        state:
          active?.state === 'invalid' && active.fingerprint === candidate.fingerprint
            ? ('invalid' as const)
            : active
              ? active.fingerprint === candidate.fingerprint
                ? ('unchanged' as const)
                : ('changed' as const)
              : ('added' as const)
      }
    })
    const detectedIds = new Set(detected.map((candidate) => candidate.id))
    const sourceMissing = activeCandidates
      .filter((candidate) => !detectedIds.has(candidate.id))
      .map((candidate) => ({
        ...candidate,
        state: 'source-missing' as const,
        warnings: [...candidate.warnings, 'Source item was not found during this scan']
      }))
    const scan: AiImportScanResult = {
      scanId: randomUUID(),
      scannedAt,
      cwd,
      sources,
      candidates: [...detected, ...sourceMissing].sort((left, right) => {
        const sourceOrder = left.provider.localeCompare(right.provider)
        if (sourceOrder !== 0) return sourceOrder
        const kindOrder = left.kind.localeCompare(right.kind)
        return kindOrder !== 0 ? kindOrder : left.name.localeCompare(right.name)
      })
    }
    await aiOrchestratorStore.saveImportScan(scan)
    return scan
  }

  async apply(request: AiImportApplyRequest): Promise<AiImportApplyResult> {
    if (!request.scanId || !Array.isArray(request.candidateIds)) {
      throw new Error('scanId and candidateIds are required')
    }

    return await this.serializeImport(async () => {
      const scan = await aiOrchestratorStore.getImportScan(request.scanId)
      if (!scan) throw new Error(`Import scan ${request.scanId} not found`)
      const selectedIds = new Set(request.candidateIds)
      assertServerPicksFitScan(scan, selectedIds, request.mcpServers)
      const selected = scan.candidates.filter(
        (candidate) =>
          selectedIds.has(candidate.id) &&
          candidate.state !== 'source-missing' &&
          // A stored copy is invalid because one of its servers needs re-authentication. Picking
          // servers can leave that one out (prepare refuses a pick that names it); taking the whole
          // file again cannot.
          (candidate.state !== 'invalid' || request.mcpServers?.[candidate.id] !== undefined) &&
          candidate.blockingIssues.length === 0
      )
      if (selected.length !== selectedIds.size)
        throw new Error('Import selection contains stale, blocked, or missing candidates')

      const merge = await mergeWithHeldServers(selected, request.mcpServers)
      const transaction = await aiImportRuntimeService.prepare(
        scan.cwd,
        selected,
        request,
        scan.sources,
        merge.held
      )
      let result: AiImportApplyResult
      try {
        result = await aiOrchestratorStore.applyPreparedImportScan(
          request.scanId,
          transaction.items,
          merge.commit
        )
      } catch (error) {
        await aiImportRuntimeService.rollback(transaction)
        throw error
      }
      await aiImportedConfigRuntime.refresh()
      return result
    })
  }
}

export const aiCliImportService = new AiCliImportService()
