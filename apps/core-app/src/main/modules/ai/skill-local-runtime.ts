/**
 * Binds local skill directories to main-owned storage and exposes the four
 * calls the settings page makes.
 *
 * The registry is the main process's own: scanning and reading both happen
 * here, so the renderer never sees a path it could write back unchecked — it
 * sends a directory the user picked and gets the rescanned snapshot in return.
 * Every mutation re-reads, re-validates and persists durably, because losing a
 * registered directory on quit would silently unlink a library the user thinks
 * is still attached.
 */

import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { LocalSkillConfig } from './skill-local-sources'
import { StorageList } from '@talex-touch/utils'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { createLogger } from '../../utils/logger'
import { getMainConfig, saveMainConfigDurable } from '../storage'
import {
  EMPTY_LOCAL_SKILL_CONFIG,
  localSkillSnapshot,
  setLocalSkillConfigReader,
  withLocalSkillDir,
  withLocalSkillEnabled,
  withoutLocalSkillDir
} from './skill-local-sources'

const skillLocalLog = createLogger('Intelligence').child('LocalSkills')

/** What a row in the settings list needs; the manifest path stays main-side. */
export interface LocalSkillView {
  id: string
  name: string
  description: string
  path: string
  sourceDir: string
  enabled: boolean
}

export interface LocalSkillSnapshotView {
  dirs: string[]
  skills: LocalSkillView[]
}

/**
 * Mirrored in `SettingSkillsMcp.vue`. Four calls with flat payloads did not
 * justify a transport domain of their own; edit both copies or neither.
 */
const skillLocalListEvent = defineRawEvent<void, LocalSkillSnapshotView>('ai:skill-local:list')
const skillLocalAddDirEvent = defineRawEvent<{ path: string }, LocalSkillSnapshotView>(
  'ai:skill-local:add-dir'
)
const skillLocalRemoveDirEvent = defineRawEvent<{ path: string }, LocalSkillSnapshotView>(
  'ai:skill-local:remove-dir'
)
const skillLocalSetEnabledEvent = defineRawEvent<
  { id: string; enabled: boolean },
  LocalSkillSnapshotView
>('ai:skill-local:set-enabled')

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

async function writeLocalSkillConfig(config: LocalSkillConfig): Promise<void> {
  const result = await saveMainConfigDurable(StorageList.SKILL_LOCAL_SOURCES, config, {
    force: true
  })
  if (!result.success) throw new Error('LOCAL_SKILL_CONFIG_PERSIST_FAILED')
}

async function snapshotView(config: LocalSkillConfig): Promise<LocalSkillSnapshotView> {
  const snapshot = await localSkillSnapshot(config)
  return {
    dirs: snapshot.dirs,
    skills: snapshot.skills.map(({ id, name, description, path, sourceDir, enabled }) => ({
      id,
      name,
      description,
      path,
      sourceDir,
      enabled
    }))
  }
}

async function mutate(
  next: (config: LocalSkillConfig) => Promise<LocalSkillConfig> | LocalSkillConfig
): Promise<LocalSkillSnapshotView> {
  const current = readLocalSkillConfig()
  const updated = await next(current)
  if (updated !== current) await writeLocalSkillConfig(updated)
  return await snapshotView(updated)
}

export function registerSkillLocalChannels(transport: ITuffTransportMain): () => void {
  setLocalSkillConfigReader(readLocalSkillConfig)

  const cleanups = [
    transport.on(skillLocalListEvent, async (_payload, context) => {
      assertHostOwned(context)
      return await snapshotView(readLocalSkillConfig())
    }),
    transport.on(skillLocalAddDirEvent, async (payload, context) => {
      assertHostOwned(context)
      return await mutate((config) => withLocalSkillDir(config, payload.path))
    }),
    transport.on(skillLocalRemoveDirEvent, async (payload, context) => {
      assertHostOwned(context)
      return await mutate((config) => withoutLocalSkillDir(config, payload.path))
    }),
    transport.on(skillLocalSetEnabledEvent, async (payload, context) => {
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
