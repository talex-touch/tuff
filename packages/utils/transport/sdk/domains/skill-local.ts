import type { AgentPresence, AiAgentId } from '../../../types/ai-orchestrator'
import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'

/**
 * Skills on this machine: the ones the AI agents already keep, read in place, the directories the
 * user linked by hand, and copies imported into Tuff earlier.
 *
 * One definition for main and renderer (type-safety spec, Typed Transport rule 5): the two bundles
 * used to carry their own copy of these events, which compiles fine and fails at runtime with
 * `No handler registered` the day one copy is renamed.
 *
 * Every event is host-only. Main rejects a plugin caller, and none of them is plugin-facing:
 * listing the user's skill libraries and browsing their disk is the host's own surface.
 */

/**
 * One directory skills are read from. `sourceId` names the agent that owns it and is null for a
 * directory the user linked, so the label a row shows stays the renderer's decision.
 */
export interface LocalSkillDirView {
  path: string
  sourceId: string | null
  /** Detected on this machine rather than linked by the user; such a directory cannot be removed. */
  auto: boolean
  /** Skills reachable under this directory, links included — what the directory itself holds. */
  skillCount: number
}

/** One skill file on disk, as the flat list shows it. */
export interface LocalSkillView {
  /** `local:<12 hex of sha1(realpath)>`; one switch per real file. */
  id: string
  name: string
  description: string
  /** Real path of the skill directory. */
  path: string
  /** The first directory, in scan order, that reaches it. */
  sourceDir: string
  enabled: boolean
}

/** What every directory mutation answers with: the rescanned state. */
export interface LocalSkillSnapshotView {
  dirs: LocalSkillDirView[]
  skills: LocalSkillView[]
}

/**
 * Where a skill file physically lives.
 *
 * - `cc-switch`: cc-switch's library, which links entries into several agents.
 * - `agents-shared`: the shared `~/.agents` layer.
 * - `local`: an agent's own directory, or a directory the user linked.
 * - `tuff-import`: a copy imported into Tuff's own store.
 * - `other`: none of the known directories — a link into an app bundle, say.
 */
export type SkillStorageKind = 'cc-switch' | 'agents-shared' | 'local' | 'tuff-import' | 'other'

/** One agent that has a skill in its own directory. */
export interface SkillSourceView {
  agentId: AiAgentId
  /**
   * The entry inside that agent's directory — the link site, before any symlink is followed. Null
   * for a copy imported into Tuff, which keeps the body and not the path it came from.
   */
  entryPath: string | null
}

/**
 * One row of the skills page: one real file. A file several agents link to is one row naming all of
 * them; two files that merely share a name are two rows, each with its own switch.
 */
export interface SkillInventoryRow {
  /** `local:<hash of realpath>` for a file on disk; the imported item id for a copy in Tuff. */
  id: string
  kind: 'local' | 'imported'
  name: string
  description: string
  storage: SkillStorageKind
  /** The directory that physically holds the file; null for `other` and `tuff-import`. */
  storageRoot: string | null
  /** Real path of the skill directory; null for an imported copy, whose body lives in Tuff's store. */
  realPath: string | null
  /** Agents that have it in their own directory, in scan order. Empty when only storage holds it. */
  sources: SkillSourceView[]
  /** The user's switch: whether Tuff offers this skill to its conversations. */
  enabledInTuff: boolean
  /** Why an imported copy that is switched on still cannot reach a conversation. */
  unavailableReason?: 'source-missing' | 'invalid'
}

export interface SkillInventorySnapshot {
  rows: SkillInventoryRow[]
  dirs: LocalSkillDirView[]
  /** Agents holding at least one skill, most first. `mcpServerCount` is not counted here (null). */
  agents: AgentPresence[]
}

export const SkillLocalEvents = {
  list: defineEvent('ai')
    .module('skill-local')
    .event('list')
    .define<void, LocalSkillSnapshotView>(),
  addDir: defineEvent('ai')
    .module('skill-local')
    .event('add-dir')
    .define<{ path: string }, LocalSkillSnapshotView>(),
  removeDir: defineEvent('ai')
    .module('skill-local')
    .event('remove-dir')
    .define<{ path: string }, LocalSkillSnapshotView>(),
  setEnabled: defineEvent('ai')
    .module('skill-local')
    .event('set-enabled')
    .define<{ id: string, enabled: boolean }, LocalSkillSnapshotView>(),
  /** Every skill on this machine and in Tuff, merged by real file, with each one's agents. */
  inventory: defineEvent('ai')
    .module('skill-local')
    .event('inventory')
    .define<void, SkillInventorySnapshot>(),
} as const

export interface SkillLocalSdk {
  list: () => Promise<LocalSkillSnapshotView>
  addDir: (path: string) => Promise<LocalSkillSnapshotView>
  removeDir: (path: string) => Promise<LocalSkillSnapshotView>
  setEnabled: (id: string, enabled: boolean) => Promise<LocalSkillSnapshotView>
  inventory: () => Promise<SkillInventorySnapshot>
}

export function createSkillLocalSdk(transport: Pick<ITuffTransport, 'send'>): SkillLocalSdk {
  return {
    list: () => transport.send(SkillLocalEvents.list, undefined),
    addDir: path => transport.send(SkillLocalEvents.addDir, { path }),
    removeDir: path => transport.send(SkillLocalEvents.removeDir, { path }),
    setEnabled: (id, enabled) => transport.send(SkillLocalEvents.setEnabled, { id, enabled }),
    inventory: () => transport.send(SkillLocalEvents.inventory, undefined),
  }
}
