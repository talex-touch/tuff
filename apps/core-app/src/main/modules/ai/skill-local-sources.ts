/**
 * Local skill directories — linked, never imported.
 *
 * The user registers a directory (say `~/tuff-skills/`); every `SKILL.md` under
 * it becomes a skill the home conversation can reach. Unlike an imported skill,
 * nothing is copied: the file on disk stays the only body, so editing it takes
 * effect on the next turn with no re-import step. That is the whole point of the
 * feature, and it is why nothing here writes to the content store.
 *
 * Two consequences follow and are load-bearing:
 *
 * - **Every lookup rescans.** Ids are derived from the directory's real path, so
 *   resolving one costs a `readdir` and no file reads — cheap enough that a
 *   cache would only buy staleness.
 * - **Reads are bounded by the entry's own real path.** The model names a skill
 *   by id and never by path; the id resolves to a directory that was already
 *   real-path'd during the scan, and the manifest it reads is re-checked to be
 *   inside it. A symlinked entry is followed once, and its target becomes the
 *   boundary.
 *
 * The config lives in main-owned storage. It arrives here as a plain value so
 * the scanning rules stay testable without Electron; `skill-local-runtime` binds
 * the reader to the real store.
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { createLogger } from '../../utils/logger'

const localSkillLog = createLogger('Intelligence').child('LocalSkills')

export const LOCAL_SKILL_ID_PREFIX = 'local:'

/** Past this a mis-picked directory (a whole source tree, say) stops being a skill library. */
const MAX_ENTRIES_PER_DIR = 50

/** Frontmatter is metadata for the picker and the prompt, not a document. */
const MAX_MANIFEST_CHARS = 512 * 1024

export interface LocalSkillConfig {
  /** Directories the user registered, as they typed them. */
  dirs: string[]
  /** Ids the user switched off. Absent means enabled — a new skill arrives live. */
  disabledIds: string[]
}

export interface LocalSkillEntry {
  /** `local:<12 hex of sha1(realpath)>`; stable while the directory keeps its path. */
  id: string
  name: string
  description: string
  /** Real path of the skill directory. Reads may not leave it. */
  path: string
  manifestPath: string
  /** The registered directory this was found under, as configured. */
  sourceDir: string
  enabled: boolean
}

export const EMPTY_LOCAL_SKILL_CONFIG: LocalSkillConfig = { dirs: [], disabledIds: [] }

export function isLocalSkillId(id: string): boolean {
  return id.startsWith(LOCAL_SKILL_ID_PREFIX)
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const text = entry.trim()
    if (text) seen.add(text)
  }
  return [...seen]
}

/** Tolerates whatever is on disk, including a file written by an older build. */
export function normalizeLocalSkillConfig(value: unknown): LocalSkillConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_LOCAL_SKILL_CONFIG
  const record = value as Record<string, unknown>
  return { dirs: uniqueStrings(record.dirs), disabledIds: uniqueStrings(record.disabledIds) }
}

export function localSkillId(realDirPath: string): string {
  return `${LOCAL_SKILL_ID_PREFIX}${createHash('sha1').update(realDirPath).digest('hex').slice(0, 12)}`
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    // `stat`, not `lstat`: a symlinked entry is meant to be followed.
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function hasManifest(dirPath: string): Promise<boolean> {
  try {
    return (await stat(join(dirPath, 'SKILL.md'))).isFile()
  } catch {
    return false
  }
}

/**
 * `name` and `description` out of a `---` fenced header.
 *
 * Same two keys and same tolerance as the CLI environment scanner: an unfenced
 * or malformed file is not an error, it just has no metadata.
 */
export function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end < 0) return {}

  const result: { name?: string; description?: string } = {}
  for (const line of content.slice(3, end).split(/\r?\n/)) {
    // `\S.*` rather than `.+` so the leading-space run has nothing to trade
    // characters with — a blank value simply fails to match.
    const match = /^([\w-]+):\s*(\S.*)$/.exec(line.trim())
    if (!match) continue
    const value = match[2]!.trim().replace(/^["']|["']$/g, '')
    if (match[1] === 'name') result.name = value
    if (match[1] === 'description') result.description = value
  }
  return result
}

interface LocalSkillLocation {
  path: string
  manifestPath: string
  sourceDir: string
}

/**
 * Skill directories under one registered root: the root itself when it holds a
 * `SKILL.md`, plus every child directory that does.
 */
async function locationsInDir(sourceDir: string): Promise<LocalSkillLocation[]> {
  let root: string
  try {
    root = await realpath(sourceDir)
  } catch {
    // A directory the user removed or unplugged is not an error the settings
    // page has to surface — it simply contributes nothing this scan.
    localSkillLog.warn(`Skill directory is unreachable: ${sourceDir}`)
    return []
  }

  const locations: LocalSkillLocation[] = []
  const push = (path: string): void => {
    locations.push({ path, manifestPath: join(path, 'SKILL.md'), sourceDir })
  }

  if (await hasManifest(root)) push(root)

  let names: string[]
  try {
    names = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort()
  } catch {
    localSkillLog.warn(`Skill directory could not be listed: ${sourceDir}`)
    return locations
  }

  for (const name of names) {
    if (locations.length >= MAX_ENTRIES_PER_DIR) {
      localSkillLog.warn(
        `Skill directory ${sourceDir} holds more than ${MAX_ENTRIES_PER_DIR} skills; the rest are ignored`
      )
      break
    }
    const child = join(root, name)
    if (!(await isDirectory(child)) || !(await hasManifest(child))) continue
    try {
      // A symlinked entry resolves to its target, and the target — not the link
      // site — becomes the boundary its reads may not leave.
      push(await realpath(child))
    } catch {
      continue
    }
  }
  return locations
}

/** Every skill directory the config points at, deduplicated by real path. */
async function locationsFor(config: LocalSkillConfig): Promise<Map<string, LocalSkillLocation>> {
  const byId = new Map<string, LocalSkillLocation>()
  for (const dir of config.dirs) {
    for (const location of await locationsInDir(dir)) {
      const id = localSkillId(location.path)
      if (!byId.has(id)) byId.set(id, location)
    }
  }
  return byId
}

async function readManifest(location: LocalSkillLocation): Promise<string> {
  // The scan already resolved the directory; re-resolving the manifest catches a
  // `SKILL.md` that is itself a symlink pointing out of the skill.
  const resolved = await realpath(location.manifestPath)
  if (!isInside(location.path, resolved)) {
    throw new Error(`Local skill manifest ${location.manifestPath} resolves outside its directory`)
  }
  const content = await readFile(resolved, 'utf8')
  return content.length > MAX_MANIFEST_CHARS ? content.slice(0, MAX_MANIFEST_CHARS) : content
}

/**
 * Every skill the registered directories currently hold, metadata only.
 *
 * Failures are per-entry: one unreadable `SKILL.md` drops that skill and leaves
 * the rest of the library listed.
 */
export async function scanLocalSkills(config: LocalSkillConfig): Promise<LocalSkillEntry[]> {
  const disabled = new Set(config.disabledIds)
  const entries: LocalSkillEntry[] = []

  for (const [id, location] of await locationsFor(config)) {
    let frontmatter: { name?: string; description?: string }
    try {
      frontmatter = parseSkillFrontmatter(await readManifest(location))
    } catch (error) {
      localSkillLog.warn(`Skill manifest could not be read: ${location.manifestPath}`, { error })
      continue
    }
    entries.push({
      id,
      name: frontmatter.name || location.path.split(/[\\/]/).filter(Boolean).pop() || id,
      description: frontmatter.description || '',
      path: location.path,
      manifestPath: location.manifestPath,
      sourceDir: location.sourceDir,
      enabled: !disabled.has(id)
    })
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name))
}

export async function scanEnabledLocalSkills(config: LocalSkillConfig): Promise<LocalSkillEntry[]> {
  return (await scanLocalSkills(config)).filter((entry) => entry.enabled)
}

/**
 * The `SKILL.md` body behind an id.
 *
 * Only ids reach here, so no path a caller invents is addressable; the id has to
 * hash to a directory the current config still points at, and a switched-off
 * skill is unreadable rather than merely unlisted.
 */
export async function readLocalSkill(config: LocalSkillConfig, skillId: string): Promise<string> {
  const id = skillId.trim()
  const location = (await locationsFor(config)).get(id)
  if (!location) throw new Error(`Local skill "${skillId}" is not in a registered directory`)
  if (config.disabledIds.includes(id)) throw new Error(`Local skill "${skillId}" is switched off`)
  return await readManifest(location)
}

/** Registered directories with the skills each one contributes. */
export interface LocalSkillSnapshot {
  dirs: string[]
  skills: LocalSkillEntry[]
}

export async function localSkillSnapshot(config: LocalSkillConfig): Promise<LocalSkillSnapshot> {
  return { dirs: [...config.dirs], skills: await scanLocalSkills(config) }
}

/**
 * Adds a directory, resolving it first so the same folder reached through two
 * paths registers once.
 */
export async function withLocalSkillDir(
  config: LocalSkillConfig,
  dir: string
): Promise<LocalSkillConfig> {
  const requested = dir.trim()
  if (!requested) throw new Error('A skill directory path is required')
  if (!isAbsolute(requested)) throw new Error('A skill directory must be an absolute path')

  let resolved: string
  try {
    resolved = await realpath(requested)
  } catch {
    throw new Error(`Skill directory ${requested} does not exist`)
  }
  if (!(await isDirectory(resolved))) throw new Error(`${requested} is not a directory`)

  const known = new Set<string>()
  for (const existing of config.dirs) {
    known.add(existing)
    known.add(await realpath(existing).catch(() => existing))
  }
  if (known.has(resolved)) return config
  return { ...config, dirs: [...config.dirs, resolved] }
}

export function withoutLocalSkillDir(config: LocalSkillConfig, dir: string): LocalSkillConfig {
  return { ...config, dirs: config.dirs.filter((entry) => entry !== dir) }
}

export function withLocalSkillEnabled(
  config: LocalSkillConfig,
  skillId: string,
  enabled: boolean
): LocalSkillConfig {
  const disabled = new Set(config.disabledIds)
  if (enabled) disabled.delete(skillId)
  else disabled.add(skillId)
  return { ...config, disabledIds: [...disabled] }
}

/**
 * Reader the injection point and the tool gateway use.
 *
 * They must not depend on the storage module — one is exercised without Electron
 * and the other lives in a different module tree — so the runtime hands the
 * config in at startup. Until it does, there are no local skills, which is the
 * right answer for a build that never wired them.
 */
let configReader: (() => LocalSkillConfig) | null = null

export function setLocalSkillConfigReader(reader: (() => LocalSkillConfig) | null): void {
  configReader = reader
}

export function currentLocalSkillConfig(): LocalSkillConfig {
  return configReader?.() ?? EMPTY_LOCAL_SKILL_CONFIG
}

export async function listEnabledLocalSkills(): Promise<LocalSkillEntry[]> {
  const config = currentLocalSkillConfig()
  if (config.dirs.length === 0) return []
  return await scanEnabledLocalSkills(config)
}

export async function readEnabledLocalSkill(skillId: string): Promise<string> {
  return await readLocalSkill(currentLocalSkillConfig(), skillId)
}
