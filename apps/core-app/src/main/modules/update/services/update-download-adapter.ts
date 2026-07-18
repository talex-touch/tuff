import type { DownloadStatus, GitHubRelease } from '@talex-touch/utils'
import type {
  UpdateDownloadStartResult,
  UpdateSystem,
  VerifiedUpdatePackage
} from '../update-system'
import { eq } from 'drizzle-orm'
import { downloadTasks } from '../../../db/schema'
import { databaseModule } from '../../database'

export interface UpdateDownloadAdapterDeps {
  getUpdateSystem: () => UpdateSystem | undefined
}

/** Bridges lifecycle-owned update actions to DownloadCenter and platform download adapters. */
export class UpdateDownloadAdapter {
  constructor(private readonly deps: UpdateDownloadAdapterDeps) {}

  async downloadWithCenter(release: GitHubRelease): Promise<UpdateDownloadStartResult> {
    return await this.requireUpdateSystem().downloadUpdate(release)
  }

  async verifyWithCenter(taskId: string): Promise<void> {
    await this.requireUpdateSystem().verifyDownloadedUpdate(taskId)
  }

  async prepareInstallHandoff(taskId: string): Promise<VerifiedUpdatePackage> {
    return await this.requireUpdateSystem().prepareInstallHandoff(taskId)
  }

  async getTaskStatus(
    taskId: string
  ): Promise<{ status: DownloadStatus; error: string | null } | null> {
    const [task] = await databaseModule
      .getDb()
      .select({ status: downloadTasks.status, error: downloadTasks.error })
      .from(downloadTasks)
      .where(eq(downloadTasks.id, taskId))
      .limit(1)

    if (!task) {
      return null
    }
    return { status: task.status as DownloadStatus, error: task.error }
  }

  private requireUpdateSystem(): UpdateSystem {
    const updateSystem = this.deps.getUpdateSystem()
    if (!updateSystem) {
      throw new Error('UpdateSystem not initialized')
    }
    return updateSystem
  }
}
