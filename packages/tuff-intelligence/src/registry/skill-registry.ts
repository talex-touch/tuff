export interface SkillManifest {
  id: string
  description: string
  load: () => Promise<string>
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
}
