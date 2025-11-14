export interface PreviewCardRow {
  label: string
  value: string
  description?: string
  copyable?: boolean
  emphasize?: boolean
}

export interface PreviewCardSection {
  title?: string
  rows: PreviewCardRow[]
}

export interface PreviewCardChip {
  label: string
  value: string
}

export interface PreviewCardPayload {
  abilityId: string
  title: string
  subtitle?: string
  primaryValue: string
  primaryLabel?: string
  primaryUnit?: string
  secondaryValue?: string
  secondaryLabel?: string
  description?: string
  accentColor?: string
  badges?: string[]
  chips?: PreviewCardChip[]
  sections?: PreviewCardSection[]
  warnings?: string[]
  meta?: Record<string, any>
  confidence?: number
}

export interface PreviewAbilityResult {
  abilityId: string
  confidence: number
  payload: PreviewCardPayload
  durationMs?: number
}
