import type { AiAgentProfile, AiImportedConfigItem } from '@talex-touch/utils/types/ai-orchestrator'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const importedConfigMocks = vi.hoisted(() => {
  const items: AiImportedConfigItem[] = []
  const content = new Map<string, string>()
  const agentProfiles = new Map<string, AiAgentProfile>()
  const registeredMcpProfiles = new Map<string, Record<string, unknown>>()
  return {
    items,
    content,
    agentProfiles,
    registeredMcpProfiles,
    listImportedItems: vi.fn(async () => items),
    getAgentProfile: vi.fn(async (id: string) => agentProfiles.get(id) ?? null),
    saveAgentProfile: vi.fn(async (value: AiAgentProfile) => agentProfiles.set(value.id, value)),
    readContent: vi.fn(async (ref: string) => content.get(ref) ?? ''),
    getMcpProfile: vi.fn((id: string) => registeredMcpProfiles.get(id)),
    registerProfile: vi.fn((value: Record<string, unknown>) => {
      registeredMcpProfiles.set(value.id as string, value)
    }),
    unregisterProfile: vi.fn(async (id: string) => registeredMcpProfiles.delete(id)),
    listStructuredTools: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
    callTool: vi.fn()
  }
})

vi.mock('./ai-orchestrator-store', () => ({
  aiOrchestratorStore: {
    listImportedItems: importedConfigMocks.listImportedItems,
    getProfile: importedConfigMocks.getAgentProfile,
    saveProfile: importedConfigMocks.saveAgentProfile
  }
}))
vi.mock('./ai-import-content-store', () => ({
  aiImportContentStore: { read: importedConfigMocks.readContent }
}))
vi.mock('./intelligence-mcp-registry', () => ({
  intelligenceMcpRegistry: {
    getProfile: importedConfigMocks.getMcpProfile,
    registerProfile: importedConfigMocks.registerProfile,
    unregisterProfile: importedConfigMocks.unregisterProfile,
    listStructuredTools: importedConfigMocks.listStructuredTools,
    callTool: importedConfigMocks.callTool
  }
}))

import { AiImportedConfigRuntime } from './ai-imported-config-runtime'

function importedItem(overrides: Partial<AiImportedConfigItem>): AiImportedConfigItem {
  return {
    id: 'item-default',
    candidateId: 'candidate-default',
    sourceId: 'pi:project:workspace',
    provider: 'pi',
    sourceScope: 'project',
    targetScope: 'workspace',
    workspaceRoot: '/workspace/release',
    kind: 'skill',
    name: 'release',
    sourceKey: 'skill:release',
    contentRef: 'content-default',
    normalizedProjection: {},
    secrets: [],
    state: 'active',
    revisionId: 'revision-1',
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function profile(overrides: Partial<AiAgentProfile> = {}): AiAgentProfile {
  return {
    id: 'profile-release',
    name: 'Release coordinator',
    description: 'Coordinates release work.',
    runtimeProvider: 'pi-core',
    enabled: true,
    modelPreference: [],
    allowedToolIds: [],
    enabledSkillIds: [],
    permissionPolicy: { mode: 'manual', allowedPermissions: [] },
    timeoutMs: 30_000,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('AiImportedConfigRuntime scoped imports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    importedConfigMocks.items.length = 0
    importedConfigMocks.content.clear()
    importedConfigMocks.agentProfiles.clear()
    importedConfigMocks.registeredMcpProfiles.clear()
  })

  it('exposes skill metadata by default without reading or injecting its instruction body', async () => {
    importedConfigMocks.items.push(
      importedItem({
        id: 'skill-release',
        contentRef: 'skill-release-content',
        normalizedProjection: { description: 'Review release readiness.' }
      })
    )
    importedConfigMocks.content.set(
      'skill-release-content',
      'INTERNAL SKILL BODY: deploy production'
    )

    const prompt = await new AiImportedConfigRuntime().buildSystemPrompt(
      profile(),
      '/workspace/release/packages/core',
      'Review the release.'
    )

    expect(prompt).toContain(
      'Available imported skills (metadata only; call skill.read with an id before using one)'
    )
    expect(prompt).toContain('"id":"skill-release"')
    expect(prompt).toContain('Review release readiness.')
    expect(prompt).not.toContain('INTERNAL SKILL BODY: deploy production')
    expect(importedConfigMocks.readContent).not.toHaveBeenCalled()
  })

  it('injects a command only for an explicit slash invocation and lets workspace scope override global scope', async () => {
    const globalCommand = importedItem({
      id: 'command-global',
      targetScope: 'global',
      workspaceRoot: undefined,
      kind: 'command',
      name: 'inspect',
      alias: 'inspect',
      contentRef: 'command-global-content',
      provider: 'pi',
      updatedAt: 1
    })
    const workspaceCommand = importedItem({
      id: 'command-workspace',
      kind: 'command',
      name: 'inspect',
      alias: 'inspect',
      contentRef: 'command-workspace-content',
      provider: 'pi',
      updatedAt: 2
    })
    importedConfigMocks.items.push(globalCommand, workspaceCommand)
    importedConfigMocks.content.set('command-global-content', 'GLOBAL COMMAND BODY')
    importedConfigMocks.content.set('command-workspace-content', 'WORKSPACE COMMAND BODY')
    const runtime = new AiImportedConfigRuntime()

    const ordinaryPrompt = await runtime.buildSystemPrompt(
      profile(),
      '/workspace/release',
      'Inspect the release.'
    )
    expect(ordinaryPrompt).toContain(
      'Available explicit commands (use only when the user names one)'
    )
    expect(ordinaryPrompt).not.toContain('COMMAND inspect:')
    expect(importedConfigMocks.readContent).not.toHaveBeenCalled()

    const explicitPrompt = await runtime.buildSystemPrompt(
      profile(),
      '/workspace/release',
      '/inspect'
    )
    expect(explicitPrompt).toContain('COMMAND inspect:\nWORKSPACE COMMAND BODY')
    expect(explicitPrompt).not.toContain('GLOBAL COMMAND BODY')
  })

  it('injects glob-scoped rules only for matching objective paths while always-apply rules remain unconditional', async () => {
    importedConfigMocks.items.push(
      importedItem({
        id: 'rule-typescript',
        kind: 'rule',
        name: 'typescript-files',
        contentRef: 'rule-typescript-content',
        normalizedProjection: { globs: ['src/**/*.ts'] }
      }),
      importedItem({
        id: 'rule-always',
        kind: 'rule',
        name: 'security-baseline',
        contentRef: 'rule-always-content',
        normalizedProjection: { alwaysApply: true }
      })
    )
    importedConfigMocks.content.set('rule-typescript-content', 'TYPESCRIPT RULE BODY')
    importedConfigMocks.content.set('rule-always-content', 'ALWAYS RULE BODY')
    const runtime = new AiImportedConfigRuntime()

    const nonMatchingPrompt = await runtime.buildSystemPrompt(
      profile(),
      '/workspace/release',
      'Review docs/guide.md before publishing.'
    )
    expect(nonMatchingPrompt).toContain('ALWAYS RULE BODY')
    expect(nonMatchingPrompt).not.toContain('TYPESCRIPT RULE BODY')

    const matchingPrompt = await runtime.buildSystemPrompt(
      profile(),
      '/workspace/release',
      'Fix src/main/bootstrap.ts before publishing.'
    )
    expect(matchingPrompt).toContain('ALWAYS RULE BODY')
    expect(matchingPrompt).toContain('TYPESCRIPT RULE BODY')
  })

  it('expands command arguments only for an explicit slash invocation without changing quoted token values', async () => {
    importedConfigMocks.items.push(
      importedItem({
        id: 'command-deploy',
        kind: 'command',
        name: 'deploy',
        alias: 'deploy',
        contentRef: 'command-deploy-content'
      })
    )
    importedConfigMocks.content.set(
      'command-deploy-content',
      'ARGS=[$ARGUMENTS]; FIRST=[$1]; SECOND=[$2]'
    )
    const runtime = new AiImportedConfigRuntime()

    const ordinaryPrompt = await runtime.buildSystemPrompt(
      profile(),
      '/workspace/release',
      'Deploy Ship It to PROD Zone.'
    )
    expect(ordinaryPrompt).not.toContain('ARGS=[')

    const explicitPrompt = await runtime.buildSystemPrompt(
      profile(),
      '/workspace/release',
      '/deploy\t"Ship It" \'PROD Zone\''
    )
    expect(explicitPrompt).toContain(
      'COMMAND deploy:\nARGS=["Ship It" \'PROD Zone\']; FIRST=[Ship It]; SECOND=[PROD Zone]'
    )
  })

  it('rejects a skill read outside its workspace while allowing reads inside that workspace', async () => {
    importedConfigMocks.items.push(
      importedItem({
        id: 'skill-private',
        contentRef: 'skill-private-content'
      })
    )
    importedConfigMocks.content.set('skill-private-content', 'Workspace-only procedure')
    const runtime = new AiImportedConfigRuntime()

    await expect(runtime.readSkill('skill-private', '/workspace/other')).rejects.toThrow(
      'Imported skill skill-private is outside the active workspace'
    )
    expect(importedConfigMocks.readContent).not.toHaveBeenCalled()

    await expect(
      runtime.readSkill('skill-private', '/workspace/release/subdirectory')
    ).resolves.toBe('Workspace-only procedure')
  })

  it('rejects MCP access from another workspace and registers it only when a visible workspace requests tools', async () => {
    importedConfigMocks.items.push(
      importedItem({
        id: 'mcp-release',
        kind: 'mcp',
        normalizedProjection: {
          mcpProfiles: [
            {
              id: 'mcp.release',
              name: 'Release MCP',
              enabled: true,
              transport: { type: 'stdio', command: 'node' }
            }
          ]
        }
      })
    )
    importedConfigMocks.listStructuredTools.mockResolvedValue([
      {
        id: 'mcp.release.status',
        name: 'status',
        description: 'Read release status',
        schema: {},
        riskLevel: 'low'
      }
    ])
    const runtime = new AiImportedConfigRuntime()

    await expect(runtime.listMcpTools('mcp.release', '/workspace/other')).rejects.toThrow(
      'Imported MCP profile mcp.release is unavailable in this workspace'
    )
    expect(importedConfigMocks.registerProfile).not.toHaveBeenCalled()
    expect(importedConfigMocks.listStructuredTools).not.toHaveBeenCalled()

    await expect(runtime.listMcpTools('mcp.release', '/workspace/release')).resolves.toEqual([
      {
        id: 'mcp.release.status',
        name: 'status',
        description: 'Read release status',
        schema: {},
        riskLevel: 'low'
      }
    ])
    expect(importedConfigMocks.registerProfile).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mcp.release' })
    )
    expect(importedConfigMocks.listStructuredTools).toHaveBeenCalledWith(['mcp.release'])
  })
  it('projects only current enabled imports and keeps an imported agent disabled across refreshes', async () => {
    importedConfigMocks.items.push(
      importedItem({
        id: 'agent-release-v1',
        candidateId: 'agent-release',
        kind: 'agent',
        active: false,
        normalizedProjection: { profileId: 'profile-imported-release' }
      })
    )
    importedConfigMocks.agentProfiles.set(
      'profile-imported-release',
      profile({ id: 'profile-imported-release', enabled: true })
    )
    const runtime = new AiImportedConfigRuntime()

    await runtime.refresh()
    expect(importedConfigMocks.agentProfiles.get('profile-imported-release')).toMatchObject({
      enabled: false
    })

    importedConfigMocks.items.splice(
      0,
      1,
      importedItem({
        id: 'agent-release-v2',
        candidateId: 'agent-release',
        kind: 'agent',
        active: false,
        normalizedProjection: { profileId: 'profile-imported-release' }
      })
    )
    await runtime.refresh()

    expect(importedConfigMocks.agentProfiles.get('profile-imported-release')).toMatchObject({
      enabled: false
    })
    expect(importedConfigMocks.saveAgentProfile).toHaveBeenCalledTimes(1)
  })

  it('allows a workspace agent only inside its bound root while global agents remain visible everywhere', async () => {
    const runtime = new AiImportedConfigRuntime()
    importedConfigMocks.items.push(
      importedItem({
        id: 'agent-workspace',
        kind: 'agent',
        targetScope: 'workspace',
        workspaceRoot: '/workspace/release',
        normalizedProjection: { profileId: 'profile-release-agent' }
      })
    )

    await expect(
      runtime.assertAgentProfileVisible('profile-release-agent', '/workspace/release/packages/core')
    ).resolves.toBeUndefined()
    await expect(
      runtime.assertAgentProfileVisible('profile-release-agent', '/workspace/other')
    ).rejects.toThrow(
      'Imported agent profile profile-release-agent is unavailable in this workspace'
    )

    importedConfigMocks.items.splice(
      0,
      1,
      importedItem({
        id: 'agent-global',
        kind: 'agent',
        targetScope: 'global',
        workspaceRoot: undefined,
        normalizedProjection: { profileId: 'profile-release-agent' }
      })
    )

    await expect(
      runtime.assertAgentProfileVisible('profile-release-agent', '/workspace/other')
    ).resolves.toBeUndefined()
  })

  it('registers an enabled MCP profile once, refreshes changed definitions, and unregisters it when disabled', async () => {
    const mcpItem = (command: string, active = true) =>
      importedItem({
        id: 'mcp-release',
        kind: 'mcp',
        active,
        normalizedProjection: {
          mcpProfiles: [
            {
              id: 'mcp.release',
              name: 'Release MCP',
              enabled: true,
              transport: { type: 'stdio', command }
            }
          ]
        }
      })
    importedConfigMocks.items.push(mcpItem('node'))
    const runtime = new AiImportedConfigRuntime()

    await runtime.refresh()
    await runtime.refresh()
    expect(importedConfigMocks.registerProfile).toHaveBeenCalledTimes(1)

    importedConfigMocks.items.splice(0, 1, mcpItem('node --fresh'))
    await runtime.refresh()
    expect(importedConfigMocks.registerProfile).toHaveBeenCalledTimes(2)
    expect(importedConfigMocks.registeredMcpProfiles.get('mcp.release')).toMatchObject({
      transport: { command: 'node --fresh' }
    })

    importedConfigMocks.items.splice(0, 1, mcpItem('node --fresh', false))
    await runtime.refresh()
    expect(importedConfigMocks.unregisterProfile).toHaveBeenCalledWith('mcp.release')
    expect(importedConfigMocks.registeredMcpProfiles.has('mcp.release')).toBe(false)
  })
})
