import type {
  AiImportCandidate,
  AiImportSecretDescriptor,
  AiImportTargetScope
} from '@talex-touch/utils/types/ai-orchestrator'
import type { IntelligenceMcpProfile } from './intelligence-mcp-registry'

export interface AiPreparedImportItem {
  candidate: AiImportCandidate
  targetScope: AiImportTargetScope
  workspaceRoot?: string
  alias?: string
  contentRef: string
  projection: Record<string, unknown>
  secrets: AiImportSecretDescriptor[]
  mcpProfiles: IntelligenceMcpProfile[]
}

export interface AiPreparedImportTransaction {
  items: AiPreparedImportItem[]
  createdContentRefs: string[]
  secretUndo: Array<{ authRef: string; previousValue: string | null }>
}
