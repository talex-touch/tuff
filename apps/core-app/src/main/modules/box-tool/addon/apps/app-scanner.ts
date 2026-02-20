import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { withOSAdapter } from '@talex-touch/utils/electron/env-tool'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import chalk from 'chalk'
import { createLogger } from '../../../../utils/logger'
import { enterPerfContext } from '../../../../utils/perf-context'
import { formatLog, LogStyle } from './app-utils'
import type { ScannedAppInfo } from './app-types'

const appScannerLog = createLogger('AppScanner')

/**
 * Service for scanning applications, responsible for app discovery and information retrieval.
 *
 * @export
 * @class AppScanner
 */
export class AppScanner {
  private cachedApps: ScannedAppInfo[] | null = null
  private cachedAt = 0
  private scanPromise: Promise<ScannedAppInfo[]> | null = null
  private readonly cacheTtlMs = 5 * 60 * 1000

  /**
   * Watch paths for different platforms.
   */
  private WATCH_PATHS =
    withOSAdapter({
      darwin: () => ['/Applications', path.join(process.env.HOME || '', 'Applications')],
      win32: () => [
        path.join(process.env.PROGRAMFILES || '', '.'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', '.'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs')
      ],
      linux: () => [
        '/usr/share/applications',
        '/var/lib/snapd/desktop/applications',
        path.join(os.homedir(), '.local/share/applications')
      ]
    }) || []

  /**
   * Gets the watch paths for the current platform.
   * @returns {string[]} An array of paths to watch.
   */
  getWatchPaths(): string[] {
    return this.WATCH_PATHS
  }

  /**
   * Retrieves all applications for the current platform.
   * @returns {Promise<ScannedAppInfo[]>} A promise that resolves to an array of applications.
   */
  async getApps(options?: { forceRefresh?: boolean }): Promise<ScannedAppInfo[]> {
    const forceRefresh = Boolean(options?.forceRefresh)
    const now = Date.now()

    if (!forceRefresh && this.cachedApps && now - this.cachedAt < this.cacheTtlMs) {
      return this.cachedApps
    }

    if (this.scanPromise) {
      return this.scanPromise
    }

    this.scanPromise = this.scanApps()
    try {
      const apps = await this.scanPromise
      this.cachedApps = apps
      this.cachedAt = Date.now()
      return apps
    } finally {
      this.scanPromise = null
    }
  }

  private async scanApps(): Promise<ScannedAppInfo[]> {
    const disposeScan = enterPerfContext('AppScanner.scan', { platform: process.platform })
    try {
      appScannerLog.info(formatLog('AppScanner', 'Starting application scan...', LogStyle.process))

      try {
        const apps =
          (await withOSAdapter<void, Promise<ScannedAppInfo[]>>({
            darwin: async () => {
              appScannerLog.info(
                formatLog(
                  'AppScanner',
                  'macOS detected, scanning applications using mdfind',
                  LogStyle.info
                )
              )
              const { getApps } = await import('./darwin')
              return await getApps()
            },
            win32: async () => {
              appScannerLog.info(
                formatLog(
                  'AppScanner',
                  'Windows detected, scanning Start Menu and Program Directories',
                  LogStyle.info
                )
              )
              const { getApps } = await import('./win')
              return await getApps()
            },
            linux: async () => {
              appScannerLog.info(
                formatLog('AppScanner', 'Linux detected, scanning .desktop files', LogStyle.info)
              )
              const { getApps } = await import('./linux')
              return await getApps()
            }
          })) || []

        appScannerLog.info(
          formatLog(
            'AppScanner',
            `Scan complete, found ${chalk.green(apps.length)} applications`,
            LogStyle.success
          )
        )
        return apps
      } catch (error) {
        appScannerLog.error(
          formatLog(
            'AppScanner',
            `Error scanning applications: ${error instanceof Error ? error.message : String(error)}`,
            LogStyle.error
          )
        )
        return []
      }
    } finally {
      disposeScan()
    }
  }

  /**
   * Retrieves application information by its file path.
   * @param {string} filePath - The path to the application file.
   * @returns {Promise<ScannedAppInfo | null>} A promise that resolves to the application's information.
   */
  async getAppInfoByPath(filePath: string): Promise<ScannedAppInfo | null> {
    try {
      appScannerLog.info(
        formatLog('AppScanner', `Getting app info for: ${chalk.cyan(filePath)}`, LogStyle.info)
      )

      const appInfo = await withOSAdapter<string, Promise<ScannedAppInfo | null>>({
        onBeforeExecute: () => filePath,
        darwin: async (filePath) => {
          const { getAppInfo } = await import('./darwin')
          return await getAppInfo(filePath)
        },
        win32: async (filePath) => {
          const { getAppInfo } = await import('./win')
          return await getAppInfo(filePath)
        },
        linux: async (filePath) => {
          const { getAppInfo } = await import('./linux')
          return await getAppInfo(filePath)
        }
      })

      return appInfo || null
    } catch (error) {
      appScannerLog.error(
        formatLog(
          'AppScanner',
          `Failed to get app info for ${chalk.cyan(filePath)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          LogStyle.error
        )
      )
      return null
    }
  }

  /**
   * Runs an `mdls` update scan on macOS to refresh application metadata.
   * @param {ScannedAppInfo[]} apps - Apps that need mdls scanning (missing displayName).
   * @param {ScannedAppInfo[]} skipMdlsApps - Apps that already have displayName (only need existence check).
   * @returns {Promise<{updatedApps: ScannedAppInfo[], updatedCount: number, deletedApps: ScannedAppInfo[]}>}
   */
  async runMdlsUpdateScan(
    apps: ScannedAppInfo[],
    skipMdlsApps: ScannedAppInfo[] = []
  ): Promise<{
    updatedApps: ScannedAppInfo[]
    updatedCount: number
    deletedApps: ScannedAppInfo[]
  }> {
    const disposeScan = enterPerfContext('AppScanner.mdlsUpdate', {
      appCount: apps.length,
      skipCount: skipMdlsApps.length
    })
    try {
      if (process.platform !== 'darwin') {
        appScannerLog.info(
          formatLog('AppScanner', 'Not on macOS, skipping mdls scan', LogStyle.info)
        )
        return { updatedApps: [], updatedCount: 0, deletedApps: [] }
      }

      appScannerLog.info(formatLog('AppScanner', 'Starting mdls update scan', LogStyle.process))

      const totalApps = apps.length + skipMdlsApps.length
      if (totalApps === 0) {
        appScannerLog.info(
          formatLog('AppScanner', 'App list is empty, skipping mdls scan', LogStyle.info)
        )
        return { updatedApps: [], updatedCount: 0, deletedApps: [] }
      }

      appScannerLog.info(
        formatLog(
          'AppScanner',
          `Running mdls scan for ${chalk.cyan(apps.length)} apps (${chalk.green(skipMdlsApps.length)} skipped with existing displayName)`,
          LogStyle.process
        )
      )

      let updatedCount = 0
      let processedCount = 0
      const updatedApps: ScannedAppInfo[] = []
      const deletedApps: ScannedAppInfo[] = []
      const startTime = Date.now()

      // Check existence for skip-mdls apps (they already have displayName, just verify they still exist)
      if (skipMdlsApps.length > 0) {
        for (let i = 0; i < skipMdlsApps.length; i++) {
          const app = skipMdlsApps[i]
          try {
            await fs.access(app.path)
          } catch {
            appScannerLog.warn(
              formatLog(
                'AppScanner',
                `App not found, will be deleted from database: ${chalk.yellow(app.path)}`,
                LogStyle.warning
              )
            )
            deletedApps.push(app)
          }
          if ((i + 1) % 20 === 0) {
            await new Promise<void>((resolve) => setImmediate(resolve))
          }
        }
      }

      // If no apps need mdls scanning, we're done early
      if (apps.length === 0) {
        appScannerLog.info(
          formatLog(
            'AppScanner',
            `mdls update scan finished (no mdls needed). Found ${chalk.yellow(
              deletedApps.length
            )} missing apps in ${chalk.cyan(((Date.now() - startTime) / 1000).toFixed(1))}s.`,
            LogStyle.success
          )
        )
        return { updatedApps, updatedCount: 0, deletedApps }
      }

      // 先过滤掉不存在的应用（异步 + 定期 yield 避免阻塞事件循环）
      const existingApps: typeof apps = []
      for (let i = 0; i < apps.length; i++) {
        const app = apps[i]
        try {
          await fs.access(app.path)
          existingApps.push(app)
        } catch {
          appScannerLog.warn(
            formatLog(
              'AppScanner',
              `App not found, will be deleted from database: ${chalk.yellow(app.path)}`,
              LogStyle.warning
            )
          )
          deletedApps.push(app)
        }
        // 每 20 个让出事件循环，避免长时间阻塞
        if ((i + 1) % 20 === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
      }

      // 批量处理：每批 50 个应用，使用一次 mdls 调用
      const BATCH_SIZE = 50
      const batches: ScannedAppInfo[][] = []
      for (let i = 0; i < existingApps.length; i += BATCH_SIZE) {
        batches.push(existingApps.slice(i, i + BATCH_SIZE))
      }

      for (const batch of batches) {
        try {
          // 使用 mdls 一次查询多个文件（每个文件输出用 null 字符分隔）
          const args = ['-name', 'kMDItemDisplayName', '-raw', ...batch.map((app) => app.path)]
          const { stdout } = await this._execCommand('mdls', args)

          // mdls -raw 对多个文件输出时，用 null 字符 (\0) 分隔
          const results = stdout.split('\0')

          for (let i = 0; i < batch.length; i++) {
            const app = batch[i]
            let spotlightName = (results[i] || '').trim()

            if (spotlightName.endsWith('.app')) {
              spotlightName = spotlightName.slice(0, -4)
            }

            const currentDisplayName = app.displayName

            if (
              spotlightName &&
              spotlightName !== '(null)' &&
              spotlightName !== currentDisplayName
            ) {
              appScannerLog.debug(
                formatLog(
                  'AppScanner',
                  `Updating app display name: ${chalk.cyan(app.name)}: "${
                    currentDisplayName || 'null'
                  }" -> "${spotlightName}"`,
                  LogStyle.info
                )
              )

              updatedCount++
              updatedApps.push({
                ...app,
                displayName: spotlightName
              })
            }
          }
        } catch (error) {
          // 批量失败时回退到逐个处理
          appScannerLog.warn(
            formatLog(
              'AppScanner',
              `Batch mdls failed, falling back to individual processing: ${
                error instanceof Error ? error.message : String(error)
              }`,
              LogStyle.warning
            )
          )

          for (const app of batch) {
            try {
              const { stdout } = await this._execCommand('mdls', [
                '-name',
                'kMDItemDisplayName',
                '-raw',
                app.path
              ])
              let spotlightName = stdout.trim()
              if (spotlightName.endsWith('.app')) {
                spotlightName = spotlightName.slice(0, -4)
              }
              if (
                spotlightName &&
                spotlightName !== '(null)' &&
                spotlightName !== app.displayName
              ) {
                updatedCount++
                updatedApps.push({ ...app, displayName: spotlightName })
              }
            } catch {
              // 忽略单个应用的错误
            }
          }
        } finally {
          processedCount += batch.length
          if (processedCount % 100 === 0 || processedCount === existingApps.length) {
            appScannerLog.debug(
              formatLog(
                'AppScanner',
                `mdls progress: processed ${chalk.cyan(processedCount)}/${chalk.cyan(existingApps.length)} apps`,
                LogStyle.info
              )
            )
          }
        }
        // 批次间让出事件循环，避免连续处理导致 lag
        await new Promise<void>((resolve) => setImmediate(resolve))
      }

      appScannerLog.info(
        formatLog(
          'AppScanner',
          `mdls update scan finished. Updated ${chalk.green(
            updatedCount
          )} app display names, found ${chalk.yellow(
            deletedApps.length
          )} missing apps, scanned ${chalk.cyan(existingApps.length)} (skipped ${chalk.green(skipMdlsApps.length)}) in ${chalk.cyan(((Date.now() - startTime) / 1000).toFixed(1))}s.`,
          LogStyle.success
        )
      )

      return { updatedApps, updatedCount, deletedApps }
    } finally {
      disposeScan()
    }
  }

  /**
   * Executes a shell command.
   * @param {string} command - The command to execute.
   * @param {string[]} args - The arguments to execute.
   * @returns {Promise<{ stdout: string; stderr: string }>} A promise that resolves with stdout and stderr.
   * @private
   */
  private async _execCommand(
    command: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    return await execFileSafe(command, args)
  }
}

export const appScanner = new AppScanner()
