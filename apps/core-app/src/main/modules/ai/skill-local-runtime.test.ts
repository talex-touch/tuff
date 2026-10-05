import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { SkillInventorySnapshot } from '@talex-touch/utils/transport/sdk/domains/skill-local'
import type { AiImportedConfigItem } from '@talex-touch/utils/types/ai-orchestrator'
import type { LocalSkillConfig } from './skill-local-sources'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StorageList } from '@talex-touch/utils'
import { SkillLocalEvents } from '@talex-touch/utils/transport/sdk/domains/skill-local'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { snapshotTree } from './resource-inventory/fs-tree-snapshot'

const runtimeMocks = vi.hoisted(() => ({
  home: '',
  config: { dirs: [], disabledIds: [] } as LocalSkillConfig,
  importedItems: [] as AiImportedConfigItem[],
  getMainConfig: vi.fn(),
  saveMainConfigDurable: vi.fn(),
  listImportedItems: vi.fn()
}))

// The agents' directories are looked up under the home directory; pointing it at a fixture keeps
// the scan off this machine's real libraries.
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => runtimeMocks.home }
})
vi.mock('../storage', () => ({
  getMainConfig: runtimeMocks.getMainConfig,
  saveMainConfigDurable: runtimeMocks.saveMainConfigDurable
}))
vi.mock('./ai-orchestrator-store', () => ({
  aiOrchestratorStore: { listImportedItems: runtimeMocks.listImportedItems }
}))

import { registerSkillLocalChannels } from './skill-local-runtime'
import { localSkillId } from './skill-local-sources'

type Handler = (payload: unknown, context: HandlerContext) => Promise<unknown>

function fakeTransport(): { transport: ITuffTransportMain; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>()
  const transport = {
    on: (event: { toEventName: () => string }, handler: Handler) => {
      handlers.set(event.toEventName(), handler)
      return () => handlers.delete(event.toEventName())
    }
  } as unknown as ITuffTransportMain
  return { transport, handlers }
}

const hostContext = { sender: {}, eventName: 'host' } as unknown as HandlerContext
const pluginContext = {
  sender: {},
  eventName: 'plugin',
  plugin: { name: 'curious-plugin', uniqueKey: 'activation-key' }
} as unknown as HandlerContext

let sandbox: string
let cleanup: (() => void) | undefined

async function writeSkill(dir: string, name: string): Promise<string> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name} skill\n---\n`)
  return dir
}

async function link(target: string, at: string): Promise<void> {
  await mkdir(join(at, '..'), { recursive: true })
  await symlink(target, at, 'dir')
}

async function call(
  handlers: Map<string, Handler>,
  event: { toEventName: () => string },
  payload?: unknown
) {
  const handler = handlers.get(event.toEventName())
  if (!handler) throw new Error(`no handler for ${event.toEventName()}`)
  return await handler(payload, hostContext)
}

beforeEach(async () => {
  sandbox = await realpath(await mkdtemp(join(tmpdir(), 'tuff-skill-runtime-')))
  runtimeMocks.home = join(sandbox, 'home')
  await mkdir(runtimeMocks.home, { recursive: true })
  runtimeMocks.config = { dirs: [], disabledIds: [] }
  runtimeMocks.importedItems = []
  runtimeMocks.getMainConfig.mockReset().mockImplementation(() => runtimeMocks.config)
  runtimeMocks.saveMainConfigDurable
    .mockReset()
    .mockImplementation(async (_key: string, value: LocalSkillConfig) => {
      runtimeMocks.config = value
      return { success: true }
    })
  runtimeMocks.listImportedItems
    .mockReset()
    .mockImplementation(async () => runtimeMocks.importedItems)
  // An absolute CODEX_HOME relocates the Codex root to a real directory on this machine.
  vi.stubEnv('CODEX_HOME', '')
})

afterEach(async () => {
  cleanup?.()
  cleanup = undefined
  vi.unstubAllEnvs()
  await rm(sandbox, { recursive: true, force: true })
})

describe('skill-local channels', () => {
  it('answers the inventory with every agent of a shared file and each directory’s count', async () => {
    const home = runtimeMocks.home
    const shared = await writeSkill(
      join(home, '.agents', 'skills', 'lark-approval'),
      'lark-approval'
    )
    await link(shared, join(home, '.claude', 'skills', 'lark-approval'))
    await link(shared, join(home, '.pi', 'agent', 'skills', 'lark-approval'))
    const { transport, handlers } = fakeTransport()
    cleanup = registerSkillLocalChannels(transport)

    const inventory = (await call(handlers, SkillLocalEvents.inventory)) as SkillInventorySnapshot

    expect(inventory.rows).toEqual([
      expect.objectContaining({
        id: localSkillId(shared),
        storage: 'agents-shared',
        sources: [
          { agentId: 'claude', entryPath: join(home, '.claude', 'skills', 'lark-approval') },
          { agentId: 'pi', entryPath: join(home, '.pi', 'agent', 'skills', 'lark-approval') }
        ]
      })
    ])
    expect(inventory.dirs).toEqual([
      { path: join(home, '.claude', 'skills'), sourceId: 'claude', auto: true, skillCount: 1 },
      { path: join(home, '.agents', 'skills'), sourceId: 'agents', auto: true, skillCount: 1 },
      { path: join(home, '.pi', 'agent', 'skills'), sourceId: 'pi', auto: true, skillCount: 1 }
    ])
    expect(inventory.agents.map((agent) => [agent.agentId, agent.skillCount])).toEqual([
      ['claude', 1],
      ['pi', 1]
    ])
  })

  it('switches a skill off by writing Tuff’s own config only — every agent directory stays byte-identical', async () => {
    const home = runtimeMocks.home
    const shared = await writeSkill(join(home, '.agents', 'skills', 'triage'), 'triage')
    await link(shared, join(home, '.claude', 'skills', 'triage'))
    await writeSkill(join(home, '.codex', 'skills', 'own'), 'own')
    const { transport, handlers } = fakeTransport()
    cleanup = registerSkillLocalChannels(transport)
    const before = await snapshotTree(home)

    await call(handlers, SkillLocalEvents.inventory)
    await call(handlers, SkillLocalEvents.setEnabled, { id: localSkillId(shared), enabled: false })
    const after = (await call(handlers, SkillLocalEvents.inventory)) as {
      rows: Array<{ id: string; enabledInTuff: boolean }>
    }

    expect(await snapshotTree(home)).toEqual(before)
    // Positive control for the fingerprint: a write into an agent directory does change it.
    await writeFile(join(home, '.codex', 'skills', 'own', 'NOTE.md'), 'x')
    expect(await snapshotTree(home)).not.toEqual(before)
    expect(runtimeMocks.saveMainConfigDurable).toHaveBeenCalledTimes(1)
    expect(runtimeMocks.saveMainConfigDurable).toHaveBeenCalledWith(
      StorageList.SKILL_LOCAL_SOURCES,
      { dirs: [], disabledIds: [localSkillId(shared)] },
      { force: true }
    )
    expect(after.rows.find((row) => row.id === localSkillId(shared))?.enabledInTuff).toBe(false)
    expect(after.rows.find((row) => row.id !== localSkillId(shared))?.enabledInTuff).toBe(true)
  })

  it('keeps the flat list in the shape the current settings page reads', async () => {
    const home = runtimeMocks.home
    await writeSkill(join(home, '.claude', 'skills', 'own'), 'own')
    const { transport, handlers } = fakeTransport()
    cleanup = registerSkillLocalChannels(transport)

    const snapshot = (await call(handlers, SkillLocalEvents.list)) as {
      skills: Array<Record<string, unknown>>
    }

    expect(snapshot.skills).toHaveLength(1)
    expect(Object.keys(snapshot.skills[0]!).sort()).toEqual([
      'description',
      'enabled',
      'id',
      'name',
      'path',
      'sourceDir'
    ])
  })

  it('refuses a plugin caller on every skill-local event before reading or writing anything', async () => {
    await writeSkill(join(runtimeMocks.home, '.claude', 'skills', 'own'), 'own')
    const { transport, handlers } = fakeTransport()
    cleanup = registerSkillLocalChannels(transport)
    runtimeMocks.getMainConfig.mockClear()

    const events = [
      [SkillLocalEvents.list, undefined],
      [SkillLocalEvents.inventory, undefined],
      [SkillLocalEvents.addDir, { path: sandbox }],
      [SkillLocalEvents.removeDir, { path: sandbox }],
      [SkillLocalEvents.setEnabled, { id: 'local:abc', enabled: false }]
    ] as const
    // Positive control: every event of the domain is registered here.
    expect([...handlers.keys()].sort()).toEqual(events.map(([event]) => event.toEventName()).sort())
    for (const [event, payload] of events) {
      await expect(handlers.get(event.toEventName())!(payload, pluginContext)).rejects.toThrow(
        'INTELLIGENCE_HOST_ONLY_CAPABILITY'
      )
    }

    expect(runtimeMocks.getMainConfig).not.toHaveBeenCalled()
    expect(runtimeMocks.listImportedItems).not.toHaveBeenCalled()
    expect(runtimeMocks.saveMainConfigDurable).not.toHaveBeenCalled()
  })
})
