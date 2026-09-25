import type {
  IndexedSource,
  IndexedSourceDescriptor,
  IndexedSourceDiagnostics,
  IndexedSourceDiagnosticsSnapshot,
  IndexedSourceEvidence,
  IndexedSourceHealth,
  IndexedSourceProgress,
  IndexedSourceRoot
} from '@talex-touch/utils/search'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  buildIndexedSourceDiagnosticsSummary,
  buildIndexedSourceErrorHealth,
  getIndexedSourceContractIssues
} from '@talex-touch/utils/search'
import { enterPerfContext } from '../../../utils/perf-context'

const diagnosticsLog = getLogger('indexing-diagnostics')

export interface IndexingRuntimeSourceDiagnostics extends IndexedSourceDiagnostics {
  descriptor: IndexedSourceDescriptor
  health: IndexedSourceHealth
  roots: IndexedSourceRoot[]
  evidence?: IndexedSourceEvidence[]
  progress?: IndexedSourceProgress | null
}

export interface IndexingRuntimeDiagnostics extends IndexedSourceDiagnosticsSnapshot {
  sources: IndexingRuntimeSourceDiagnostics[]
}

export class SourceDiagnosticsService {
  async getDiagnostics(
    sources: IndexedSource[],
    detail: 'full' | 'routing' = 'full'
  ): Promise<IndexingRuntimeDiagnostics> {
    const diagnostics = await Promise.all(
      sources.map(async (source): Promise<IndexingRuntimeSourceDiagnostics> => {
        const disposeSource = enterPerfContext(
          'IndexingDiagnostics.source',
          { sourceId: source.descriptor.id },
          { mode: 'blocking' }
        )
        try {
          const [health, roots, evidence, progress] = await Promise.all([
            source.getHealth().catch((error) => {
              diagnosticsLog.warn(`Indexed source '${source.descriptor.id}' health failed`, {
                error
              })
              return buildIndexedSourceErrorHealth(error)
            }),
            source.getRoots().catch((error) => {
              diagnosticsLog.warn(`Indexed source '${source.descriptor.id}' roots failed`, {
                error
              })
              return [] as IndexedSourceRoot[]
            }),
            detail === 'full'
              ? (source.getEvidence?.().catch((error) => {
                  diagnosticsLog.warn(`Indexed source '${source.descriptor.id}' evidence failed`, {
                    error
                  })
                  return [] as IndexedSourceEvidence[]
                }) ?? Promise.resolve([] as IndexedSourceEvidence[]))
              : undefined,
            detail === 'full'
              ? (source.getProgress?.().catch((error) => {
                  diagnosticsLog.warn(`Indexed source '${source.descriptor.id}' progress failed`, {
                    error
                  })
                  return null as IndexedSourceProgress | null
                }) ?? Promise.resolve(null as IndexedSourceProgress | null))
              : undefined
          ])

          const contractIssues = getIndexedSourceContractIssues(source)

          return {
            descriptor: source.descriptor,
            health,
            roots,
            evidence,
            progress,
            admissionIssues: contractIssues.admission,
            lifecycleIssues: contractIssues.lifecycle
          }
        } finally {
          disposeSource()
        }
      })
    )

    return {
      generatedAt: Date.now(),
      summary: buildIndexedSourceDiagnosticsSummary(diagnostics),
      sources: diagnostics
    }
  }
}
