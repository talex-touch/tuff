export type DocEngagementSource = 'docs_page' | 'doc_comments_admin'

export interface DocSectionBucketPayload {
  bucket: number
  activeMs: number
  totalMs: number
}

export interface DocSectionPayload {
  id: string
  title: string
  activeMs: number
  totalMs: number
  buckets?: DocSectionBucketPayload[]
}

export interface DocActionPayload {
  type: string
  source: string
  sectionId: string
  sectionTitle?: string
  count: number
  textHash?: string
  textLength?: number
  anchorStart?: number
  anchorEnd?: number
  anchorBucket?: number
}

export interface DocEngagementBody {
  path: string
  title: string
  source: DocEngagementSource
  activeDurationMs: number
  totalDurationMs: number
  sections: DocSectionPayload[]
  actions: DocActionPayload[]
}

export interface DocChallengePayload {
  challengeId: string
  seed: string
  difficulty: number
}

export interface DocViewSessionResponse {
  success: boolean
  views: number
  source: 'd1' | 'memory'
  riskLevel: number
  sessionId: string | null
  token: string | null
  challenge: DocChallengePayload | null
}

export interface DocAnalyticsDocSummary {
  path: string
  title: string
  views: number
  sessionCount: number
  activeMs: number
  totalMs: number
  copyCount: number
  selectCount: number
  lastActivity: number | null
}

export interface DocAnalyticsSectionSummary {
  sectionId: string
  sectionTitle: string
  viewCount: number
  activeMs: number
  totalMs: number
  lastReadAt: number | null
}

export interface DocAnalyticsHeatmapSummary {
  sourceType: DocEngagementSource
  sectionId: string
  sectionTitle: string
  bucket: number
  activeMs: number
  totalMs: number
  lastReadAt: number | null
}

export interface DocAnalyticsEvidenceSummary {
  sourceType: DocEngagementSource
  actionType: string
  actionSource: string
  sectionId: string
  sectionTitle: string
  textHash: string
  textLength: number
  anchorStart: number
  anchorEnd: number
  anchorBucket: number
  count: number
  lastActionAt: number | null
}

export interface DocAnalyticsResponse {
  overview: {
    docCount: number
    totalViews: number
    totalSessionCount: number
    totalActiveMs: number
    totalTotalMs: number
    totalCopyCount: number
    totalSelectCount: number
  }
  docs: DocAnalyticsDocSummary[]
  detail: {
    path: string
    sections: DocAnalyticsSectionSummary[]
    heatmap: DocAnalyticsHeatmapSummary[]
    evidence: DocAnalyticsEvidenceSummary[]
  } | null
}
