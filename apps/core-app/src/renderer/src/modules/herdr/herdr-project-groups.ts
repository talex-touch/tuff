import type {
  HerdrOscState,
  HerdrTerminalRunRequest
} from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { HerdrProjectedSession } from './useHerdrRuntime'

export const HERDR_UNGROUPED_PROJECT_KEY = 'ungrouped'

const STATE_PRIORITY: Record<HerdrOscState, number> = {
  blocked: 0,
  working: 1,
  error: 2,
  done: 3,
  idle: 4
}

export interface HerdrProjectGroup {
  /** Stable identifier used in workspace tab scopes (`space:herdr:<key>`). */
  key: string
  /** Human-readable project name; empty when `isUngrouped` is true (UI supplies localized label). */
  name: string
  isUngrouped: boolean
  herdrSpaceId: string | null
  projectId: string | null
  machine: string | null
  /** Representative working directory for launching new terminals in this project. */
  cwd: string | null
  /** Live sessions in this project, ordered stably for top tabs. */
  sessions: HerdrProjectedSession[]
  status: HerdrOscState
  hasWorking: boolean
  hasBlocked: boolean
  hasError: boolean
  latestActivityMs: number
}

interface SessionGroupResolution {
  key: string
  name: string
  isUngrouped: boolean
  herdrSpaceId: string | null
  projectId: string | null
  machine: string | null
}

function normalizePath(rawPath: string | null | undefined): string {
  if (!rawPath) return ''
  const normalized = rawPath.trim().replace(/\\/g, '/')
  if (normalized.length > 1) {
    return normalized.replace(/\/+$/, '')
  }
  return normalized
}

function isMeaningfulCwd(path: string): boolean {
  if (!path || path === '/' || path === '~') return false
  // Exclude bare Windows drive roots like `C:` or `C:/`.
  if (/^[A-Za-z]:\/?$/.test(path)) return false
  return true
}

function pathBasename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(idx + 1) : path
}

/**
 * Parses `labels.where` such as `"thunder-sing-damaged / 2"` into `{ project, slot }`.
 */
export function parseHerdrWhereLabel(
  rawWhere: string | null | undefined
): { project: string; slot: number | null } | null {
  const trimmed = rawWhere?.trim()
  if (!trimmed) return null
  const slashMatch = /^(.*?)\s*\/\s*(\d+)$/.exec(trimmed)
  if (slashMatch) {
    const project = slashMatch[1]?.trim() ?? ''
    const slot = Number.parseInt(slashMatch[2] ?? '', 10)
    if (project) {
      return { project, slot: Number.isFinite(slot) ? slot : null }
    }
  }
  return { project: trimmed, slot: null }
}

function resolveSessionGroup(session: HerdrProjectedSession): SessionGroupResolution {
  const machine = session.machine ?? null
  const machinePrefix = machine ? `m:${machine}:` : ''
  const spaceId = session.labels?.['herdr.space']?.trim() || ''
  const parsedWhere = parseHerdrWhereLabel(session.labels?.where)
  const effectiveCwd = normalizePath(session.effectiveCwd || session.foregroundCwd || session.cwd)
  const meaningfulCwd = isMeaningfulCwd(effectiveCwd) ? effectiveCwd : ''

  // Tier 1: Authoritative Herdr Space ID (`labels['herdr.space']`).
  if (spaceId) {
    const name =
      parsedWhere?.project ||
      session.projectName?.trim() ||
      (meaningfulCwd ? pathBasename(meaningfulCwd) : '') ||
      spaceId
    return {
      key: `hs:${machinePrefix}${spaceId}`,
      name,
      isUngrouped: false,
      herdrSpaceId: spaceId,
      projectId: session.projectId ?? null,
      machine
    }
  }

  // Tier 2: Matched local Tuff project.
  if (session.projectId && session.projectName?.trim()) {
    return {
      key: `proj:${session.projectId}`,
      name: session.projectName.trim(),
      isUngrouped: false,
      herdrSpaceId: null,
      projectId: session.projectId,
      machine
    }
  }

  // Tier 3: Explicit `labels.where` without a space id.
  if (parsedWhere?.project) {
    return {
      key: `where:${machinePrefix}${parsedWhere.project}`,
      name: parsedWhere.project,
      isUngrouped: false,
      herdrSpaceId: null,
      projectId: null,
      machine
    }
  }

  // Tier 4: Meaningful non-root working directory.
  if (meaningfulCwd) {
    return {
      key: `cwd:${machinePrefix}${meaningfulCwd}`,
      name: pathBasename(meaningfulCwd) || meaningfulCwd,
      isUngrouped: false,
      herdrSpaceId: null,
      projectId: null,
      machine
    }
  }

  // Tier 5: Remote machine fallback.
  if (machine) {
    return {
      key: `machine:${machine}`,
      name: machine,
      isUngrouped: false,
      herdrSpaceId: null,
      projectId: null,
      machine
    }
  }

  return {
    key: HERDR_UNGROUPED_PROJECT_KEY,
    name: '',
    isUngrouped: true,
    herdrSpaceId: null,
    projectId: null,
    machine: null
  }
}

function resolveSessionOscState(session: HerdrProjectedSession): HerdrOscState {
  return session.status?.state ?? 'idle'
}

function sortSessionsForTabs(sessions: readonly HerdrProjectedSession[]): HerdrProjectedSession[] {
  return [...sessions].sort((a, b) => {
    const slotA = parseHerdrWhereLabel(a.labels?.where)?.slot
    const slotB = parseHerdrWhereLabel(b.labels?.where)?.slot
    if (slotA != null && slotB != null && slotA !== slotB) return slotA - slotB
    if (slotA != null && slotB == null) return -1
    if (slotA == null && slotB != null) return 1
    if (a.createdMs !== b.createdMs) return a.createdMs - b.createdMs
    return a.address.localeCompare(b.address)
  })
}

function pickRepresentativeCwd(sessions: readonly HerdrProjectedSession[]): string | null {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    const candidate = normalizePath(session.effectiveCwd || session.foregroundCwd || session.cwd)
    if (!isMeaningfulCwd(candidate)) continue
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1)
  }
  let bestPath: string | null = null
  let bestCount = 0
  for (const [path, count] of counts.entries()) {
    if (count > bestCount) {
      bestPath = path
      bestCount = count
    }
  }
  if (bestPath) return bestPath
  for (const session of sessions) {
    const fallback = normalizePath(session.cwd)
    if (isMeaningfulCwd(fallback)) return fallback
  }
  return null
}

/**
 * Groups live Herdr sessions into project buckets.
 *
 * Named projects sort by attention state (`blocked` > `working` > `error` > `done` > `idle`),
 * then recent activity, while ungrouped standalone terminals stay at the bottom.
 * Sessions inside each project keep a stable slot / creation order so top tabs never jump.
 */
export function groupHerdrSessions(
  sessions: readonly HerdrProjectedSession[]
): HerdrProjectGroup[] {
  const buckets = new Map<
    string,
    {
      meta: SessionGroupResolution
      sessions: HerdrProjectedSession[]
    }
  >()

  for (const session of sessions) {
    const resolved = resolveSessionGroup(session)
    const existing = buckets.get(resolved.key)
    if (existing) {
      existing.sessions.push(session)
      // Prefer a human-readable `where` or project name over raw space id if later session carries it.
      if (
        existing.meta.herdrSpaceId &&
        existing.meta.name === existing.meta.herdrSpaceId &&
        resolved.name !== existing.meta.herdrSpaceId
      ) {
        existing.meta.name = resolved.name
      }
      if (!existing.meta.projectId && resolved.projectId) {
        existing.meta.projectId = resolved.projectId
      }
    } else {
      buckets.set(resolved.key, {
        meta: resolved,
        sessions: [session]
      })
    }
  }

  const groups: HerdrProjectGroup[] = []
  for (const { meta, sessions: bucketSessions } of buckets.values()) {
    const orderedSessions = sortSessionsForTabs(bucketSessions)
    let bestStatus: HerdrOscState = 'idle'
    let bestRank = STATE_PRIORITY.idle
    let hasWorking = false
    let hasBlocked = false
    let hasError = false
    let latestActivityMs = 0

    for (const session of orderedSessions) {
      const state = resolveSessionOscState(session)
      const rank = STATE_PRIORITY[state] ?? STATE_PRIORITY.idle
      if (rank < bestRank) {
        bestRank = rank
        bestStatus = state
      }
      if (state === 'working') hasWorking = true
      if (state === 'blocked') hasBlocked = true
      if (state === 'error') hasError = true
      const ts = session.statusMs ?? session.createdMs
      if (ts > latestActivityMs) latestActivityMs = ts
    }

    groups.push({
      key: meta.key,
      name: meta.name,
      isUngrouped: meta.isUngrouped,
      herdrSpaceId: meta.herdrSpaceId,
      projectId: meta.projectId,
      machine: meta.machine,
      cwd: pickRepresentativeCwd(orderedSessions),
      sessions: orderedSessions,
      status: bestStatus,
      hasWorking,
      hasBlocked,
      hasError,
      latestActivityMs
    })
  }

  return groups.sort((a, b) => {
    if (a.isUngrouped !== b.isUngrouped) return a.isUngrouped ? 1 : -1
    const rankDiff = STATE_PRIORITY[a.status] - STATE_PRIORITY[b.status]
    if (rankDiff !== 0) return rankDiff
    if (b.latestActivityMs !== a.latestActivityMs) return b.latestActivityMs - a.latestActivityMs
    return a.name.localeCompare(b.name)
  })
}

/**
 * Picks the primary session to open when entering a Herdr project without a remembered terminal.
 */
export function pickPrimaryHerdrProjectSession(
  group: HerdrProjectGroup
): HerdrProjectedSession | null {
  if (group.sessions.length === 0) return null
  const blocked = group.sessions.find((s) => resolveSessionOscState(s) === 'blocked')
  if (blocked) return blocked
  const working = group.sessions.find((s) => resolveSessionOscState(s) === 'working')
  if (working) return working
  const errored = group.sessions.find((s) => resolveSessionOscState(s) === 'error')
  if (errored) return errored
  return group.sessions[0] ?? null
}

/**
 * Builds concise, deduplicated tab titles for sessions inside one Herdr project's top tab strip.
 * Strips the redundant project name prefix (e.g. `antigravity · Work / 1` -> `antigravity · 1`)
 * and appends the terminal address only when two tabs in the same project share an identical label.
 */
export function buildHerdrProjectTabTitles(group: HerdrProjectGroup): Map<string, string> {
  const rawTitles = new Map<string, string>()
  const counts = new Map<string, number>()

  for (const session of group.sessions) {
    let title = session.displayTitle?.trim() || session.address
    if (!group.isUngrouped && group.name) {
      const exactSuffix = ` · ${group.name}`
      const slotPrefix = ` · ${group.name} / `
      if (title.includes(slotPrefix)) {
        title = title.replace(slotPrefix, ' · ')
      } else if (title.endsWith(exactSuffix) && title.length > exactSuffix.length) {
        title = title.slice(0, -exactSuffix.length)
      }
    }
    rawTitles.set(session.address, title)
    counts.set(title, (counts.get(title) ?? 0) + 1)
  }

  const finalTitles = new Map<string, string>()
  for (const session of group.sessions) {
    const base = rawTitles.get(session.address) ?? session.address
    const duplicate = (counts.get(base) ?? 0) > 1
    finalTitles.set(session.address, duplicate ? `${base} · ${session.address}` : base)
  }
  return finalTitles
}

/**
 * Builds a `herdr.run` request so a newly spawned terminal lands directly inside `group`.
 */
export function buildNewTerminalRequestForGroup(group: HerdrProjectGroup): HerdrTerminalRunRequest {
  const request: HerdrTerminalRunRequest = {}
  if (group.cwd) {
    request.cwd = group.cwd
  }
  if (group.machine) {
    request.on = group.machine
  }

  let maxSlot = 0
  for (const session of group.sessions) {
    const slot = parseHerdrWhereLabel(session.labels?.where)?.slot
    if (slot != null && slot > maxSlot) maxSlot = slot
  }
  const nextSlot = maxSlot + 1

  if (group.herdrSpaceId) {
    request.labels = {
      'herdr.space': group.herdrSpaceId,
      ...(group.name ? { where: `${group.name} / ${nextSlot}` } : {})
    }
  } else if (!group.isUngrouped && group.name && !group.projectId && !group.cwd) {
    request.labels = {
      where: `${group.name} / ${nextSlot}`
    }
  }

  return request
}
