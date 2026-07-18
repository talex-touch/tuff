import type { AiAgentProfile, AiImportedConfigItem } from '@talex-touch/utils/types/ai-orchestrator'
import { isAbsolute, matchesGlob, relative, resolve } from 'node:path'
import { aiImportContentStore } from './ai-import-content-store'
import { intelligenceMcpRegistry, type IntelligenceMcpProfile } from './intelligence-mcp-registry'
import { aiOrchestratorStore } from './ai-orchestrator-store'

const MAX_IMPORTED_CONTEXT_CHARS = 64 * 1024

function isVisibleInWorkspace(item: AiImportedConfigItem, cwd: string): boolean {
  if (item.targetScope === 'global') return true
  if (!item.workspaceRoot) return false
  const path = relative(resolve(item.workspaceRoot), resolve(cwd))
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function mcpProfilesFromItem(item: AiImportedConfigItem): IntelligenceMcpProfile[] {
  const profiles = item.normalizedProjection?.mcpProfiles
  return Array.isArray(profiles)
    ? profiles.filter((profile): profile is IntelligenceMcpProfile =>
        Boolean(profile && typeof profile === 'object' && 'id' in profile && 'transport' in profile)
      )
    : []
}

function applyScopePrecedence(items: AiImportedConfigItem[]): AiImportedConfigItem[] {
  const ordered = [...items].sort((left, right) => {
    if (left.targetScope !== right.targetScope) return left.targetScope === 'workspace' ? -1 : 1
    return right.updatedAt - left.updatedAt
  })
  const selected = new Map<string, AiImportedConfigItem>()
  for (const item of ordered) {
    const key = `${item.provider}:${item.kind}:${item.alias || item.name}`
    if (!selected.has(key)) selected.set(key, item)
  }
  return [...selected.values()]
}

function commandArguments(objective: string, name: string): string | undefined {
  const command = name.replace(/^\/+/, '').replace(/\.[^.]+$/, '')
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|[\\t \\n])/${escaped}(?:[\\t]+([^\\n]*))?(?=\\n|$)`, 'i').exec(
    objective
  )
  return match ? (match[1] ?? '').trim() : undefined
}

function expandCommand(content: string, args: string): string {
  const values = Array.from(args.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)).map(
    (match) => match[1] ?? match[2] ?? match[3] ?? ''
  )
  return content
    .replace(/\$ARGUMENTS\b/g, args)
    .replace(/\$(\d)\b/g, (_, index: string) => values[Number(index) - 1] ?? '')
}

function ruleApplies(item: AiImportedConfigItem, objective: string, cwd: string): boolean {
  if (item.normalizedProjection?.alwaysApply === true) return true
  const globs = Array.isArray(item.normalizedProjection?.globs)
    ? item.normalizedProjection.globs.filter((value): value is string => typeof value === 'string')
    : []
  if (globs.length === 0) return false
  const paths =
    objective.match(/(?:\.{0,2}\/)?[\w@.+-]+(?:\/[\w@.+-]+)+|\b[\w@.+-]+\.[A-Za-z0-9]{1,10}\b/g) ??
    []
  return paths.slice(0, 64).some((candidate) => {
    const normalized = (isAbsolute(candidate) ? relative(cwd, candidate) : candidate).replaceAll(
      '\\',
      '/'
    )
    return globs.some((glob) => {
      try {
        return matchesGlob(normalized, glob)
      } catch {
        return false
      }
    })
  })
}

function agentProfileId(item: AiImportedConfigItem): string | undefined {
  return typeof item.normalizedProjection?.profileId === 'string'
    ? item.normalizedProjection.profileId
    : undefined
}

export class AiImportedConfigRuntime {
  private readonly knownMcpProfileIds = new Set<string>()
  private readonly knownAgentProfileIds = new Set<string>()

  private mcpProfileDefinition(profile: IntelligenceMcpProfile): string {
    return JSON.stringify(profile, (_, value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      )
    })
  }

  private ensureMcpProfile(profile: IntelligenceMcpProfile): void {
    const existing = intelligenceMcpRegistry.getProfile(profile.id)
    if (!existing || this.mcpProfileDefinition(existing) !== this.mcpProfileDefinition(profile))
      intelligenceMcpRegistry.registerProfile(profile)
    this.knownMcpProfileIds.add(profile.id)
  }

  private async reconcileMcpProfiles(
    items: AiImportedConfigItem[],
    profileIds?: Iterable<string>
  ): Promise<void> {
    const desiredProfiles = new Map<string, IntelligenceMcpProfile>()
    for (const item of items) {
      if (!item.active || item.state !== 'active') continue
      for (const profile of mcpProfilesFromItem(item)) {
        if (profile.enabled !== false) desiredProfiles.set(profile.id, profile)
      }
    }
    const ids = new Set(profileIds ?? [...this.knownMcpProfileIds, ...desiredProfiles.keys()])
    for (const profileId of ids) {
      const desired = desiredProfiles.get(profileId)
      if (!desired) {
        await intelligenceMcpRegistry.unregisterProfile(profileId)
        this.knownMcpProfileIds.delete(profileId)
        continue
      }
      this.ensureMcpProfile(desired)
    }
  }

  private async refreshAgentProfiles(profileIds: Iterable<string>): Promise<void> {
    const uniqueIds = [...new Set(profileIds)]
    if (uniqueIds.length === 0) return
    const items = await aiOrchestratorStore.listImportedItems()
    for (const profileId of uniqueIds) {
      const profile = await aiOrchestratorStore.getProfile(profileId)
      if (!profile) continue
      const enabled = items.some(
        (item) => item.active && item.state === 'active' && agentProfileId(item) === profileId
      )
      if (profile.enabled !== enabled)
        await aiOrchestratorStore.saveProfile({ ...profile, enabled })
    }
  }

  async refresh(): Promise<void> {
    const items = await aiOrchestratorStore.listImportedItems()
    await this.reconcileMcpProfiles(items)
    for (const item of items) {
      const profileId = agentProfileId(item)
      if (profileId) this.knownAgentProfileIds.add(profileId)
    }
    await this.refreshAgentProfiles(this.knownAgentProfileIds)
  }

  async initialize(): Promise<void> {
    await this.refresh()
  }

  async setActive(itemId: string, active: boolean): Promise<AiImportedConfigItem> {
    const item = await aiOrchestratorStore.setImportedItemActive(itemId, active)
    await this.refresh()
    return item
  }

  async clone(itemId: string, alias?: string): Promise<AiImportedConfigItem> {
    const item = await aiOrchestratorStore.cloneImportedItem(itemId, alias)
    await this.refresh()
    return item
  }

  async delete(itemId: string): Promise<boolean> {
    const item = await aiOrchestratorStore.getImportedItem(itemId)
    if (!item) return false
    const removed = await aiOrchestratorStore.deleteImportedItem(itemId)
    if (!removed) return false
    for (const profile of mcpProfilesFromItem(item)) this.knownMcpProfileIds.add(profile.id)
    const profileId = agentProfileId(item)
    if (profileId) this.knownAgentProfileIds.add(profileId)
    await this.refresh()
    const remaining = await aiOrchestratorStore.listImportedItems()
    if (item.contentRef && !remaining.some((candidate) => candidate.contentRef === item.contentRef))
      await aiImportContentStore.remove(item.contentRef)
    return true
  }

  async assertAgentProfileVisible(profileId: string, cwd: string): Promise<void> {
    const items = (await aiOrchestratorStore.listImportedItems()).filter(
      (item) => agentProfileId(item) === profileId
    )
    if (items.length === 0) return
    const visible = items.some(
      (item) => item.active && item.state === 'active' && isVisibleInWorkspace(item, cwd)
    )
    if (!visible)
      throw new Error(`Imported agent profile ${profileId} is unavailable in this workspace`)
  }

  async buildSystemPrompt(
    profile: AiAgentProfile,
    cwd: string,
    objective: string
  ): Promise<string> {
    const items = (await aiOrchestratorStore.listImportedItems()).filter(
      (item) => item.active && item.state === 'active' && isVisibleInWorkspace(item, cwd)
    )
    const effectiveItems = applyScopePrecedence(items)
    const enabledSkills = new Set(profile.enabledSkillIds)
    const skills = effectiveItems
      .filter(
        (item) => item.kind === 'skill' && (enabledSkills.size === 0 || enabledSkills.has(item.id))
      )
      .map((item) => ({
        id: item.id,
        name: item.alias || item.name,
        description: item.normalizedProjection?.description || ''
      }))
    const commands = effectiveItems
      .filter((item) => item.kind === 'command')
      .map((item) => ({ id: item.id, name: item.alias || item.name }))
    const mcpProfiles = effectiveItems
      .filter((item) => item.kind === 'mcp')
      .flatMap((item) => mcpProfilesFromItem(item))
      .map((profile) => ({ id: profile.id, name: profile.name }))
    const sections: string[] = []
    let remainingChars = MAX_IMPORTED_CONTEXT_CHARS
    const pushSection = (section: string): void => {
      if (remainingChars <= 0) return
      const value = section.slice(0, remainingChars)
      sections.push(value)
      remainingChars -= value.length + 2
    }
    if (skills.length > 0) {
      pushSection(
        `Available imported skills (metadata only; call skill.read with an id before using one):\n${JSON.stringify(skills)}`
      )
    }
    if (commands.length > 0) {
      pushSection(
        `Available explicit commands (use only when the user names one):\n${JSON.stringify(commands)}`
      )
    }
    if (mcpProfiles.length > 0)
      pushSection(
        `Available imported MCP profiles (call mcp.listTools before mcp.call):\n${JSON.stringify(mcpProfiles)}`
      )

    for (const item of effectiveItems) {
      if (remainingChars <= 0) break
      const args =
        item.kind === 'command' ? commandArguments(objective, item.alias || item.name) : undefined
      const shouldInject =
        item.kind === 'instruction' ||
        (item.kind === 'rule' && ruleApplies(item, objective, cwd)) ||
        args !== undefined
      if (!shouldInject || !item.contentRef) continue
      const content = await aiImportContentStore.read(item.contentRef)
      const expanded = item.kind === 'command' ? expandCommand(content, args ?? '') : content
      pushSection(`${item.kind.toUpperCase()} ${item.alias || item.name}:\n${expanded}`)
    }
    return sections.join('\n\n')
  }

  async readSkill(itemId: string, cwd: string): Promise<string> {
    const item = (await aiOrchestratorStore.listImportedItems()).find(
      (candidate) => candidate.id === itemId
    )
    if (!item || !item.active || item.state !== 'active' || item.kind !== 'skill')
      throw new Error(`Imported skill ${itemId} is unavailable`)
    if (!isVisibleInWorkspace(item, cwd))
      throw new Error(`Imported skill ${itemId} is outside the active workspace`)
    if (!item.contentRef) throw new Error(`Imported skill ${itemId} has no managed content`)
    return await aiImportContentStore.read(item.contentRef)
  }

  private async assertMcpProfileVisible(
    profileId: string,
    cwd: string
  ): Promise<IntelligenceMcpProfile> {
    const items = applyScopePrecedence(
      (await aiOrchestratorStore.listImportedItems()).filter(
        (item) => item.active && item.state === 'active' && isVisibleInWorkspace(item, cwd)
      )
    )
    const profile = items
      .filter((item) => item.kind === 'mcp')
      .flatMap((item) => mcpProfilesFromItem(item))
      .find((candidate) => candidate.id === profileId && candidate.enabled !== false)
    if (!profile)
      throw new Error(`Imported MCP profile ${profileId} is unavailable in this workspace`)
    this.ensureMcpProfile(profile)
    return profile
  }

  async listMcpTools(profileId: string, cwd: string): Promise<Array<Record<string, unknown>>> {
    await this.assertMcpProfileVisible(profileId, cwd)
    const tools = await intelligenceMcpRegistry.listStructuredTools([profileId])
    return tools.map((tool) => {
      const record = tool as unknown as Record<string, unknown>
      return {
        id: record.id,
        name: record.name,
        description: record.description,
        schema: record.schema,
        riskLevel: record.riskLevel
      }
    })
  }

  async callMcpTool(
    profileId: string,
    toolName: string,
    input: unknown,
    cwd: string
  ): Promise<unknown> {
    await this.assertMcpProfileVisible(profileId, cwd)
    return await intelligenceMcpRegistry.callTool(profileId, toolName, input)
  }
}

export const aiImportedConfigRuntime = new AiImportedConfigRuntime()
