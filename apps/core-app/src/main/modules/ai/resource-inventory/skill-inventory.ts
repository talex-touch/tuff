/**
 * The skills page's rows: one per real file.
 *
 * A file several agents link to is one row naming all of them, and its storage is the directory that
 * physically holds it; two files that only share a name stay two rows, each with its own switch
 * (handoff 10-03-skills-page-revamp, D6). Copies imported into Tuff are rows too, owned by the agent
 * they came from and stored in Tuff.
 *
 * Pure: the scan, the directory table and the imported items arrive as values, so the merge rules
 * are testable without a disk, a database or Electron.
 */

import type { AiImportedConfigItem } from '@talex-touch/utils/types/ai-orchestrator'
import type {
  LocalSkillDirView,
  SkillInventoryRow,
  SkillInventorySnapshot,
  SkillSourceView,
  SkillStorageKind
} from '@talex-touch/utils/transport/sdk/domains/skill-local'
import type { LocalSkillScanEntry } from '../skill-local-sources'
import { countAgentPresence } from './agent-presence'

/**
 * Detected roots that are storage rather than agents, by the id `agent-skill-roots` gives them.
 * cc-switch keeps one library and links entries into several agents; `~/.agents` is the layer
 * several agents read besides their own. Neither is an agent a skill "belongs to".
 */
const STORAGE_ROOT_KINDS: Readonly<Record<string, SkillStorageKind>> = {
  'cc-switch': 'cc-switch',
  agents: 'agents-shared'
}

/** Root ids that name storage, not an agent; exported so a test can pin them to the root table. */
export const SKILL_STORAGE_ROOT_IDS: readonly string[] = Object.keys(STORAGE_ROOT_KINDS)

/** Row order inside one name: the shared libraries first, Tuff's copy last. */
const STORAGE_ORDER: readonly SkillStorageKind[] = [
  'cc-switch',
  'agents-shared',
  'local',
  'other',
  'tuff-import'
]

export interface SkillInventoryInput {
  /** Every directory the scan covered; detected ones carry the agent id that owns them. */
  dirs: LocalSkillDirView[]
  skills: LocalSkillScanEntry[]
  importedItems: AiImportedConfigItem[]
}

function agentOfDirectory(dirs: LocalSkillDirView[]): Map<string, string> {
  const agents = new Map<string, string>()
  // A directory both detected and linked by hand is the agent's: detected entries come first.
  for (const dir of dirs)
    if (dir.sourceId && !agents.has(dir.path)) agents.set(dir.path, dir.sourceId)
  return agents
}

function storageOf(storeDir: string | null, agentOfDir: Map<string, string>): SkillStorageKind {
  if (storeDir === null) return 'other'
  const owner = agentOfDir.get(storeDir)
  return (owner && STORAGE_ROOT_KINDS[owner]) || 'local'
}

function localRow(skill: LocalSkillScanEntry, agentOfDir: Map<string, string>): SkillInventoryRow {
  const sources: SkillSourceView[] = []
  for (const source of skill.sources) {
    const agentId = agentOfDir.get(source.sourceDir)
    // A directory the user linked has no agent, and a storage library is not one.
    if (!agentId || STORAGE_ROOT_KINDS[agentId]) continue
    if (sources.some((known) => known.agentId === agentId && known.entryPath === source.entryPath))
      continue
    sources.push({ agentId, entryPath: source.entryPath })
  }
  return {
    id: skill.id,
    kind: 'local',
    name: skill.name,
    description: skill.description,
    storage: storageOf(skill.storeDir, agentOfDir),
    storageRoot: skill.storeDir,
    realPath: skill.path,
    sources,
    enabledInTuff: skill.enabled
  }
}

function importedRow(item: AiImportedConfigItem): SkillInventoryRow {
  const description = item.normalizedProjection?.description
  const row: SkillInventoryRow = {
    id: item.id,
    kind: 'imported',
    name: item.alias || item.name,
    description: typeof description === 'string' ? description : '',
    storage: 'tuff-import',
    storageRoot: null,
    realPath: null,
    sources: item.provider === 'manual' ? [] : [{ agentId: item.provider, entryPath: null }],
    enabledInTuff: item.active
  }
  // Only `active` items are injected or readable; the switch still shows what the user chose.
  if (item.state === 'source-missing' || item.state === 'invalid')
    row.unavailableReason = item.state
  return row
}

export function buildSkillInventory(input: SkillInventoryInput): SkillInventorySnapshot {
  const agentOfDir = agentOfDirectory(input.dirs)
  const rows = [
    ...input.skills.map((skill) => localRow(skill, agentOfDir)),
    ...input.importedItems.filter((item) => item.kind === 'skill').map(importedRow)
  ].sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      STORAGE_ORDER.indexOf(left.storage) - STORAGE_ORDER.indexOf(right.storage) ||
      left.id.localeCompare(right.id)
  )
  return {
    rows,
    dirs: input.dirs,
    agents: countAgentPresence(
      rows.map((row) => ({ agentIds: row.sources.map((source) => source.agentId) })),
      'skill'
    )
  }
}
