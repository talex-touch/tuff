import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { withOSAdapter } from '@talex-touch/utils/electron/env-tool'
import chalk from 'chalk'
import { createLogger } from '../../../../utils/logger'
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
   * @param {ScannedAppInfo[]} apps - The list of applications to scan.
   * @returns {Promise<{updatedApps: ScannedAppInfo[], updatedCount: number, deletedApps: ScannedAppInfo[]}>} A promise that resolves to the updated apps, count, and deleted apps.
   */
  async runMdlsUpdateScan(apps: ScannedAppInfo[]): Promise<{
    updatedApps: ScannedAppInfo[]
    updatedCount: number
    deletedApps: ScannedAppInfo[]
  }> {
    if (process.platform !== 'darwin') {
      appScannerLog.info(formatLog('AppScanner', 'Not on macOS, skipping mdls scan', LogStyle.info))
      return { updatedApps: [], updatedCount: 0, deletedApps: [] }
    }

    appScannerLog.info(formatLog('AppScanner', 'Starting mdls update scan', LogStyle.process))

    if (apps.length === 0) {
      appScannerLog.info(
        formatLog('AppScanner', 'App list is empty, skipping mdls scan', LogStyle.info)
      )
      return { updatedApps: [], updatedCount: 0, deletedApps: [] }
    }

    appScannerLog.info(
      formatLog(
        'AppScanner',
        `Running mdls scan for ${chalk.cyan(apps.length)} apps`,
        LogStyle.process
      )
    )

    let updatedCount = 0
    let processedCount = 0
    const updatedApps: ScannedAppInfo[] = []
    const deletedApps: ScannedAppInfo[] = []
    const startTime = Date.now()

    // 先过滤掉不存在的应用
    const existingApps: typeof apps = []
    for (const app of apps) {
      if (!existsSync(app.path)) {
        appScannerLog.warn(
          formatLog(
            'AppScanner',
            `App not found, will be deleted from database: ${chalk.yellow(app.path)}`,
            LogStyle.warning
          )
        )
        deletedApps.push(app)
      } else {
        existingApps.push(app)
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
        const paths = batch.map((app) => `"${app.path}"`).join(' ')
        const command = `mdls -name kMDItemDisplayName -raw ${paths}`
        const { stdout } = await this._execCommand(command)

        // mdls -raw 对多个文件输出时，用 null 字符 (\0) 分隔
        const results = stdout.split('\0')

        for (let i = 0; i < batch.length; i++) {
          const app = batch[i]
          let spotlightName = (results[i] || '').trim()

          if (spotlightName.endsWith('.app')) {
            spotlightName = spotlightName.slice(0, -4)
          }

          const currentDisplayName = app.displayName

          if (spotlightName && spotlightName !== '(null)' && spotlightName !== currentDisplayName) {
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
            const command = `mdls -name kMDItemDisplayName -raw "${app.path}"`
            const { stdout } = await this._execCommand(command)
            let spotlightName = stdout.trim()
            if (spotlightName.endsWith('.app')) {
              spotlightName = spotlightName.slice(0, -4)
            }
            if (spotlightName && spotlightName !== '(null)' && spotlightName !== app.displayName) {
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
    }

    appScannerLog.info(
      formatLog(
        'AppScanner',
        `mdls update scan finished. Updated ${chalk.green(
          updatedCount
        )} app display names, found ${chalk.yellow(
          deletedApps.length
        )} missing apps in ${chalk.cyan(((Date.now() - startTime) / 1000).toFixed(1))}s.`,
        LogStyle.success
      )
    )

    return { updatedApps, updatedCount, deletedApps }
  }

  /**
   * Executes a shell command.
   * @param {string} command - The command to execute.
   * @returns {Promise<{ stdout: string; stderr: string }>} A promise that resolves with stdout and stderr.
   * @private
   */
  private _execCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error)
          return
        }
        resolve({ stdout, stderr })
      })
    })
  }
}

export const appScanner = new AppScanner()
