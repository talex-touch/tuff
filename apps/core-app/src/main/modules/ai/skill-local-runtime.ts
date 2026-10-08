/**
 * Binds local skill directories to main-owned storage and exposes the calls the
 * settings pages make.
 *
 * The registry is the main process's own: scanning and reading both happen
 * here, so the renderer never sees a path it could write back unchecked — it
 * sends a directory the user picked and gets the rescanned snapshot in return.
 * Every mutation re-reads, re-validates and persists durably, because losing a
 * registered directory on quit would silently unlink a library the user thinks
 * is still attached.
 *
 * Nothing here writes into a directory it reads. The agents' own libraries are
 * other tools' property; the only file this module writes is Tuff's own
 * `skill-local-sources.json`.
 */

import type { AgentSkillRoot } from './agent-skill-roots'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type {
  LocalSkillDirView,
  LocalSkillSnapshotView,
  SkillInventorySnapshot
} from '@talex-touch/utils/transport/sdk/domains/skill-local'
import type { LocalSkillConfig, LocalSkillScanEntry } from './skill-local-sources'
import { StorageList } from '@talex-touch/utils'
import { SkillLocalEvents } from '@talex-touch/utils/transport/sdk/domains/skill-local'
import { createLogger } from '../../utils/logger'
import { getMainConfig, saveMainConfigDurable } from '../storage'
import { existingAgentSkillRoots } from './agent-skill-roots'
import { aiOrchestratorStore } from './ai-orchestrator-store'
import { buildSkillInventory } from './resource-inventory/skill-inventory'
import {
  EMPTY_LOCAL_SKILL_CONFIG,
  localSkillSnapshot,
  setLocalSkillConfigReader,
  withLocalSkillDir,
  withLocalSkillEnabled,
  withoutLocalSkillDir
} from './skill-local-sources'

const skillLocalLog = createLogger('Intelligence').child('LocalSkills')

/**
 * Reading a linked file and browsing the user's disk are the host's own
 * surface; a plugin reaching these would gain both behind no prompt at all.
 */
function assertHostOwned(context: HandlerContext): void {
  if (context.plugin) throw new Error('INTELLIGENCE_HOST_ONLY_CAPABILITY')
}

export function readLocalSkillConfig(): LocalSkillConfig {
  try {
    return getMainConfig(StorageList.SKILL_LOCAL_SOURCES)
  } catch (error) {
    // Storage is not up yet (or came up broken). A conversation that starts
    // before it does simply carries no local skills.
    skillLocalLog.warn('Local skill directories are unavailable', { error })
    return EMPTY_LOCAL_SKILL_CONFIG
  }
}

/**
 * Skill libraries the agents on this machine already keep.
 *
 * Cached because the reader below feeds the injection path, which is synchronous and runs on every
 * home turn — resolving a dozen paths per turn would buy nothing. Detection is refreshed when the
 * settings page asks for a snapshot, so installing an agent and reopening the page is enough.
 */
let detectedSkillRoots: AgentSkillRoot[] = []

/** Re-probes the agents' own directories and replaces the cache. */
async function refreshDetectedSkillRoots(): Promise<AgentSkillRoot[]> {
  detectedSkillRoots = await existingAgentSkillRoots()
  return detectedSkillRoots
}

/**
 * What the scanner, the reader and the injection actually work from: the user's directories plus the
 * libraries discovered on this machine.
 *
 * Detected roots are never written to storage. They belong to other tools, and persisting them would
 * turn "remove this library" into a promise the next launch quietly breaks.
 */
function effectiveLocalSkillConfig(): LocalSkillConfig {
  const persisted = readLocalSkillConfig()
  if (detectedSkillRoots.length === 0) return persisted
  return {
    dirs: [...detectedSkillRoots.map((root) => root.path), ...persisted.dirs],
    disabledIds: persisted.disabledIds
  }
}

async function writeLocalSkillConfig(config: LocalSkillConfig): Promise<void> {
  const result = await saveMainConfigDurable(StorageList.SKILL_LOCAL_SOURCES, config, {
    force: true
  })
  if (!result.success) throw new Error('LOCAL_SKILL_CONFIG_PERSIST_FAILED')
}

/** One scan, with the directories it covered and how many skills each one reaches. */
async function scanWithDirs(): Promise<{
  dirs: LocalSkillDirView[]
  skills: LocalSkillScanEntry[]
}> {
  const persisted = readLocalSkillConfig()
  const snapshot = await localSkillSnapshot(effectiveLocalSkillConfig())
  const reachedBy = new Map<string, Set<string>>()
  for (const skill of snapshot.skills) {
    for (const source of skill.sources) {
      const ids = reachedBy.get(source.sourceDir) ?? new Set<string>()
      ids.add(skill.id)
      reachedBy.set(source.sourceDir, ids)
    }
  }
  const dirView = (path: string, sourceId: string | null, auto: boolean): LocalSkillDirView => ({
    path,
    sourceId,
    auto,
    skillCount: reachedBy.get(path)?.size ?? 0
  })
  return {
    dirs: [
      ...detectedSkillRoots.map((root) => dirView(root.path, root.id, true)),
      ...persisted.dirs.map((path) => dirView(path, null, false))
    ],
    skills: snapshot.skills
  }
}

async function snapshotView(): Promise<LocalSkillSnapshotView> {
  const { dirs, skills } = await scanWithDirs()
  return {
    dirs,
    skills: skills.map(({ id, name, description, path, sourceDir, enabled }) => ({
      id,
      name,
      description,
      path,
      sourceDir,
      enabled
    }))
  }
}

/**
 * Every skill the settings page lists: the files on disk merged by real path, each with all the
 * agents that link it, plus the copies imported into Tuff.
 */
export async function localSkillInventory(): Promise<SkillInventorySnapshot> {
  // The page is the natural moment to notice an agent installed since launch.
  await refreshDetectedSkillRoots()
  const [{ dirs, skills }, items] = await Promise.all([
    scanWithDirs(),
    aiOrchestratorStore.listImportedItems()
  ])
  return buildSkillInventory({ dirs, skills, importedItems: items })
}

async function mutate(
  next: (config: LocalSkillConfig) => Promise<LocalSkillConfig> | LocalSkillConfig
): Promise<LocalSkillSnapshotView> {
  const current = readLocalSkillConfig()
  const updated = await next(current)
  if (updated !== current) await writeLocalSkillConfig(updated)
  return await snapshotView()
}

export function registerSkillLocalChannels(transport: ITuffTransportMain): () => void {
  // The injection path reads through this reader, so it sees the agents' own libraries too.
  setLocalSkillConfigReader(effectiveLocalSkillConfig)
  void refreshDetectedSkillRoots()

  const cleanups = [
    transport.on(SkillLocalEvents.list, async (_payload, context) => {
      assertHostOwned(context)
      // The page is the natural moment to notice an agent installed since launch.
      await refreshDetectedSkillRoots()
      return await snapshotView()
    }),
    transport.on(SkillLocalEvents.inventory, async (_payload, context) => {
      assertHostOwned(context)
      return await localSkillInventory()
    }),
    transport.on(SkillLocalEvents.addDir, async (payload, context) => {
      assertHostOwned(context)
      return await mutate((config) => withLocalSkillDir(config, payload.path))
    }),
    transport.on(SkillLocalEvents.removeDir, async (payload, context) => {
      assertHostOwned(context)
      if (detectedSkillRoots.some((root) => root.path === payload.path))
        throw new Error('A detected agent library is not a linked directory')
      return await mutate((config) => withoutLocalSkillDir(config, payload.path))
    }),
    transport.on(SkillLocalEvents.setEnabled, async (payload, context) => {
      assertHostOwned(context)
      return await mutate((config) =>
        withLocalSkillEnabled(config, payload.id, payload.enabled === true)
      )
    })
  ]

  return () => {
    setLocalSkillConfigReader(null)
    for (const cleanup of cleanups) cleanup()
  }
}
