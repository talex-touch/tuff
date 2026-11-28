export interface LocalSkillConfig {
  /** Directories the user registered, as they typed them. */
  dirs: string[]
  /** Ids the user switched off. Absent means enabled — a new skill arrives live. */
  disabledIds: string[]
}

export const EMPTY_LOCAL_SKILL_CONFIG: LocalSkillConfig = { dirs: [], disabledIds: [] }

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const text = entry.trim()
    if (text) seen.add(text)
  }
  return [...seen]
}

/** Tolerates whatever is on disk, including a file written by an older build. */
export function normalizeLocalSkillConfig(value: unknown): LocalSkillConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_LOCAL_SKILL_CONFIG
  const record = value as Record<string, unknown>
  return { dirs: uniqueStrings(record.dirs), disabledIds: uniqueStrings(record.disabledIds) }
}
