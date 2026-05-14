export interface SkillManifest {
  id: string
  name?: string
  description: string
  triggers?: string[]
  tools?: string[]
  permissions?: string[]
  metadata?: Record<string, unknown>
  load: () => Promise<string>
  loadInstructions?: () => Promise<string>
}

export interface SkillPublicManifest {
  id: string
  name?: string
  description: string
  triggers?: string[]
  tools?: string[]
  permissions?: string[]
  metadata?: Record<string, unknown>
}

export interface SkillResolveOptions {
  limit?: number
}

export interface SkillResolveResult {
  skill: SkillManifest
  score: number
  matchedBy: Array<'id' | 'name' | 'description' | 'trigger'>
}

export class SkillRegistry {
  private readonly skills = new Map<string, SkillManifest>()

  register(skill: SkillManifest) {
    this.skills.set(skill.id, skill)
  }

  get(id: string): SkillManifest | null {
    return this.skills.get(id) ?? null
  }

  list(): SkillManifest[] {
    return Array.from(this.skills.values())
  }

  listManifests(): SkillPublicManifest[] {
    return this.list().map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      triggers: skill.triggers,
      tools: skill.tools,
      permissions: skill.permissions,
      metadata: skill.metadata,
    }))
  }

  async loadInstructions(id: string): Promise<string | null> {
    const skill = this.get(id)
    if (!skill) {
      return null
    }
    return await (skill.loadInstructions ?? skill.load)()
  }

  resolve(input: string, options: SkillResolveOptions = {}): SkillResolveResult[] {
    const query = normalize(input)
    if (!query) {
      return []
    }

    const results: SkillResolveResult[] = []
    for (const skill of this.skills.values()) {
      const matchedBy: SkillResolveResult['matchedBy'] = []
      let score = 0

      if (matches(skill.id, query)) {
        matchedBy.push('id')
        score += 4
      }
      if (skill.name && matches(skill.name, query)) {
        matchedBy.push('name')
        score += 3
      }
      if (matches(skill.description, query)) {
        matchedBy.push('description')
        score += 1
      }
      if ((skill.triggers ?? []).some(trigger => matches(trigger, query))) {
        matchedBy.push('trigger')
        score += 5
      }

      if (score > 0) {
        results.push({
          skill,
          score,
          matchedBy,
        })
      }
    }

    const limit = Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(Number(options.limit)))
      : undefined
    const sorted = results.sort((left, right) => right.score - left.score || left.skill.id.localeCompare(right.skill.id))
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted
  }
}

function normalize(value: string): string {
  return String(value || '').trim().toLowerCase()
}

function matches(candidate: string, query: string): boolean {
  const normalized = normalize(candidate)
  return normalized === query || normalized.includes(query) || query.includes(normalized)
}
