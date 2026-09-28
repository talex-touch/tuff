import type { DownloadProgress, DownloadTask, UpdateLifecycleSnapshot } from '@talex-touch/utils'
import type { MaybeRefOrGetter } from 'vue'
import { DownloadModule } from '@talex-touch/utils'
import { useDownloadSdk } from '@talex-touch/utils/renderer'
import { onScopeDispose, readonly, shallowRef, toValue, watch } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'

const downloadProgressLog = createRendererLogger('useUpdateDownloadProgress')

/**
 * Byte progress of the app update being downloaded.
 *
 * The lifecycle snapshot carries only the phase; bytes live on the download task it names. The
 * download center pushes that task's progress about once a second, and a page opened halfway
 * through reads the task once so the bar does not restart from zero.
 */
export function useUpdateDownloadProgress(
  snapshot: MaybeRefOrGetter<UpdateLifecycleSnapshot | null>
) {
  const downloadSdk = useDownloadSdk()
  const progress = shallowRef<DownloadProgress | null>(null)
  /** Bumped by every accepted push, so a slower backfill cannot overwrite a newer one. */
  let revision = 0

  function isTracked(task: DownloadTask): boolean {
    if (task.module !== DownloadModule.APP_UPDATE) return false
    const taskId = toValue(snapshot)?.taskId
    return !taskId || task.id === taskId
  }

  function acceptPush(task: DownloadTask): void {
    if (!isTracked(task) || !task.progress) return
    revision += 1
    progress.value = task.progress
  }

  async function backfill(taskId: string): Promise<void> {
    const requestedAt = revision
    try {
      const response = await downloadSdk.getTaskStatus({ taskId })
      const task = response.success ? response.task : null
      // Restarted since the download began: the task is gone from memory, so the bar stays
      // indeterminate until the next push rather than guessing.
      if (!task || task.id !== taskId || !task.progress) return
      if (revision !== requestedAt || toValue(snapshot)?.taskId !== taskId) return
      progress.value = task.progress
    } catch (error) {
      downloadProgressLog.warn('Failed to read the update download task', error)
    }
  }

  const disposers = [downloadSdk.onTaskProgress(acceptPush), downloadSdk.onTaskUpdated(acceptPush)]

  watch(
    () => {
      const current = toValue(snapshot)
      return { phase: current?.phase ?? null, taskId: current?.taskId ?? null }
    },
    (next, previous) => {
      const taskChanged = next.taskId !== previous?.taskId
      if (taskChanged || (previous?.phase === 'downloading' && next.phase !== 'downloading')) {
        revision += 1
        progress.value = null
      }
      if (
        next.phase === 'downloading' &&
        next.taskId &&
        (taskChanged || previous?.phase !== 'downloading')
      ) {
        void backfill(next.taskId)
      }
    },
    { immediate: true }
  )

  onScopeDispose(() => {
    for (const dispose of disposers) {
      dispose()
    }
  })

  return { progress: readonly(progress) }
}
