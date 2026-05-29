export enum EvidenceSource {
  Live = 'live',
  D1 = 'd1',
  R2 = 'r2',
  LocalOnly = 'local-only',
  Memory = 'memory',
  Open = 'open',
}

export const EVIDENCE_SOURCES = Object.values(EvidenceSource) as EvidenceSource[]

export function normalizeEvidenceSource(value: unknown): EvidenceSource {
  return EVIDENCE_SOURCES.includes(value as EvidenceSource)
    ? (value as EvidenceSource)
    : EvidenceSource.Open
}

export function isProductionEvidenceSource(source: EvidenceSource): boolean {
  return source === EvidenceSource.Live || source === EvidenceSource.D1 || source === EvidenceSource.R2
}

export function isFallbackEvidenceSource(source: EvidenceSource): boolean {
  return source === EvidenceSource.Memory || source === EvidenceSource.LocalOnly
}
