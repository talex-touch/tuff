import type {
  IntelligenceLocalSkillGateStatus,
  IntelligenceLocalSkillProviderSummary
} from '@talex-touch/tuff-intelligence'

export interface IntelligenceLocalSkillChipDisplay {
  id: string
  name: string
  status: IntelligenceLocalSkillGateStatus
  sceneIds: string[]
  scenePreview: string[]
  sceneOverflow: number
}

export interface IntelligenceLocalSkillsDisplayModel {
  installedSkills: IntelligenceLocalSkillProviderSummary[]
  enabledSkills: IntelligenceLocalSkillProviderSummary[]
  readySkills: IntelligenceLocalSkillProviderSummary[]
  approvalRequiredSkills: IntelligenceLocalSkillProviderSummary[]
  unavailableSkills: IntelligenceLocalSkillProviderSummary[]
  installedGatedSkills: IntelligenceLocalSkillProviderSummary[]
  sceneIds: string[]
  visibleSkillChips: IntelligenceLocalSkillChipDisplay[]
}

interface LocalSkillsDisplayOptions {
  chipLimit?: number
  scenePreviewLimit?: number
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

export function buildIntelligenceLocalSkillsDisplayModel(
  skillProviders: IntelligenceLocalSkillProviderSummary[],
  options: LocalSkillsDisplayOptions = {}
): IntelligenceLocalSkillsDisplayModel {
  const chipLimit = options.chipLimit ?? 8
  const scenePreviewLimit = options.scenePreviewLimit ?? 2
  const installedSkills = skillProviders.filter((skill) => skill.installed)
  const enabledSkills = installedSkills.filter((skill) => skill.enabled)
  const readySkills = installedSkills.filter((skill) => skill.gate.status === 'ready')
  const approvalRequiredSkills = installedSkills.filter((skill) => skill.gate.approvalRequired)
  const unavailableSkills = skillProviders.filter((skill) => skill.gate.status === 'unavailable')
  const installedGatedSkills = installedSkills.filter((skill) => skill.mode === 'gated')
  const sceneIds = uniqueStrings(installedSkills.flatMap((skill) => skill.gate.sceneIds))
  const visibleSkillChips = installedSkills.slice(0, chipLimit).map((skill) => {
    const skillSceneIds = uniqueStrings(skill.gate.sceneIds)
    const scenePreview = skillSceneIds.slice(0, scenePreviewLimit)

    return {
      id: skill.id,
      name: skill.name,
      status: skill.gate.status,
      sceneIds: skillSceneIds,
      scenePreview,
      sceneOverflow: Math.max(0, skillSceneIds.length - scenePreview.length)
    }
  })

  return {
    installedSkills,
    enabledSkills,
    readySkills,
    approvalRequiredSkills,
    unavailableSkills,
    installedGatedSkills,
    sceneIds,
    visibleSkillChips
  }
}
