/**
 * The context packages and checkpoints behind one call record, loaded when its row is opened.
 *
 * Moved from `IntelligenceAuditLogs.vue` with its behaviour unchanged: packages by trace (up to
 * five), then checkpoints for every session those packages belong to (up to five each). Each is
 * fetched once per drawer; a failure is remembered rather than retried on every reopen of the row.
 */
import type {
  ContextCheckpointSafeSummary,
  ContextPackageLogSafeSummary
} from './context-package-log-summary'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { ref } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  summarizeContextCheckpoint,
  summarizeContextPackageLog
} from './context-package-log-summary'

const contextLog = createRendererLogger('AuditRecordContext')

export function useAuditRecordContext() {
  const sdk = useIntelligenceSdk()

  const packagesLoading = ref<Record<string, boolean>>({})
  const packagesByTrace = ref<Record<string, ContextPackageLogSafeSummary[]>>({})
  const packagesFailed = ref<Record<string, boolean>>({})
  const checkpointsLoading = ref<Record<string, boolean>>({})
  const checkpointsBySession = ref<Record<string, ContextCheckpointSafeSummary[]>>({})
  const checkpointsFailed = ref<Record<string, boolean>>({})

  async function loadCheckpointsForSession(sessionId: string): Promise<void> {
    if (
      checkpointsLoading.value[sessionId] ||
      checkpointsBySession.value[sessionId] ||
      checkpointsFailed.value[sessionId]
    ) {
      return
    }
    checkpointsLoading.value = { ...checkpointsLoading.value, [sessionId]: true }
    try {
      const result = await sdk.contextListCheckpoints({ sessionId, limit: 5 })
      checkpointsBySession.value = {
        ...checkpointsBySession.value,
        [sessionId]: result.checkpoints.map(summarizeContextCheckpoint)
      }
    } catch (error) {
      contextLog.error('Failed to load context checkpoints:', error)
      checkpointsFailed.value = { ...checkpointsFailed.value, [sessionId]: true }
    } finally {
      checkpointsLoading.value = { ...checkpointsLoading.value, [sessionId]: false }
    }
  }

  async function loadForTrace(traceId: string): Promise<void> {
    if (
      !traceId ||
      packagesLoading.value[traceId] ||
      packagesByTrace.value[traceId] ||
      packagesFailed.value[traceId]
    ) {
      return
    }
    packagesLoading.value = { ...packagesLoading.value, [traceId]: true }
    try {
      const result = await sdk.contextListPackageLogs({ traceId, limit: 5 })
      const summaries = result.logs.map(summarizeContextPackageLog)
      packagesByTrace.value = { ...packagesByTrace.value, [traceId]: summaries }
      const sessionIds = [...new Set(summaries.map((summary) => summary.sessionId).filter(Boolean))]
      await Promise.all(sessionIds.map((sessionId) => loadCheckpointsForSession(sessionId)))
    } catch (error) {
      contextLog.error('Failed to load context package logs:', error)
      packagesFailed.value = { ...packagesFailed.value, [traceId]: true }
    } finally {
      packagesLoading.value = { ...packagesLoading.value, [traceId]: false }
    }
  }

  function checkpointsFor(summary: ContextPackageLogSafeSummary): ContextCheckpointSafeSummary[] {
    return checkpointsBySession.value[summary.sessionId] ?? []
  }

  return {
    packagesLoading,
    packagesByTrace,
    packagesFailed,
    checkpointsLoading,
    checkpointsFailed,
    loadForTrace,
    checkpointsFor
  }
}
