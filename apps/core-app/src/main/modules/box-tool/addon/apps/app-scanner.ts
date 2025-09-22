import path from 'path'
import os from 'os'
import { formatLog, LogStyle } from './app-utils'
import chalk from 'chalk'
import { exec } from 'child_process'

/**
 * Service for scanning applications, responsible for app discovery and information retrieval.
 *
 * @export
 * @class AppScanner
 */
export class AppScanner {
  private isMac = process.platform === 'darwin'
  private isWindows = process.platform === 'win32'
  private isLinux = process.platform === 'linux'

  /**
   * Watch paths for different platforms.
   */
  private WATCH_PATHS = this.isMac
    ? ['/Applications', path.join(process.env.HOME || '', 'Applications')]
    : this.isWindows
      ? [
          path.join(process.env.PROGRAMFILES || '', '.'),
          path.join(process.env['PROGRAMFILES(X86)'] || '', '.'),
          path.join(process.env.LOCALAPPDATA || '', 'Programs')
        ]
      : [
          '/usr/share/applications',
          '/var/lib/snapd/desktop/applications',
          path.join(os.homedir(), '.local/share/applications')
        ]

  /**
   * Gets the watch paths for the current platform.
   * @returns {string[]} An array of paths to watch.
   */
  getWatchPaths(): string[] {
    return this.WATCH_PATHS
  }

  /**
   * Retrieves all applications for the current platform.
   * @returns {Promise<any[]>} A promise that resolves to an array of applications.
   */
  async getApps(): Promise<any[]> {
    console.log(formatLog('AppScanner', 'Starting application scan...', LogStyle.process))

    try {
      let apps: any[] = []
      if (this.isMac) {
        console.log(
          formatLog(
            'AppScanner',
            'macOS detected, scanning applications using mdfind',
            LogStyle.info
          )
        )
        const { getApps } = await import('./darwin')
        apps = await getApps()
      } else if (this.isWindows) {
        console.log(
          formatLog(
            'AppScanner',
            'Windows detected, scanning Start Menu and Program Directories',
            LogStyle.info
          )
        )
        const { getApps } = await import('./win')
        apps = await getApps()
      } else if (this.isLinux) {
        console.log(
          formatLog('AppScanner', 'Linux detected, scanning .desktop files', LogStyle.info)
        )
        const { getApps } = await import('./linux')
        apps = await getApps()
      }

      console.log(
        formatLog(
          'AppScanner',
          `Scan complete, found ${chalk.green(apps.length)} applications`,
          LogStyle.success
        )
      )
      return apps
    } catch (error) {
      console.error(
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
   * @returns {Promise<any>} A promise that resolves to the application's information.
   */
  async getAppInfoByPath(filePath: string): Promise<any> {
    try {
      console.log(
        formatLog('AppScanner', `Getting app info for: ${chalk.cyan(filePath)}`, LogStyle.info)
      )

      if (this.isMac) {
        const { getAppInfo } = await import('./darwin')
        return await getAppInfo(filePath)
      } else if (this.isWindows) {
        const { getAppInfo } = await import('./win')
        return await getAppInfo(filePath)
      } else if (this.isLinux) {
        const { getAppInfo } = await import('./linux')
        return await getAppInfo(filePath)
      }

      return null
    } catch (error) {
      console.error(
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
   * @param {any[]} apps - The list of applications to scan.
   * @returns {Promise<{updatedApps: any[], updatedCount: number}>} A promise that resolves to the updated apps and count.
   */
  async runMdlsUpdateScan(apps: any[]): Promise<{ updatedApps: any[]; updatedCount: number }> {
    if (process.platform !== 'darwin') {
      console.log(formatLog('AppScanner', 'Not on macOS, skipping mdls scan', LogStyle.info))
      return { updatedApps: [], updatedCount: 0 }
    }

    console.log(formatLog('AppScanner', 'Starting mdls update scan', LogStyle.process))

    if (apps.length === 0) {
      console.log(formatLog('AppScanner', 'App list is empty, skipping mdls scan', LogStyle.info))
      return { updatedApps: [], updatedCount: 0 }
    }

    console.log(
      formatLog(
        'AppScanner',
        `Running mdls scan for ${chalk.cyan(apps.length)} apps`,
        LogStyle.process
      )
    )

    let updatedCount = 0
    const updatedApps: any[] = []
    const startTime = Date.now()

    for (const app of apps) {
      try {
        const command = `mdls -name kMDItemDisplayName -raw "${app.path}"`
        const { stdout, stderr } = await this._execCommand(command)

        if (stderr) {
          console.warn(
            formatLog(
              'AppScanner',
              `mdls command warning for ${chalk.yellow(app.path)}: ${stderr}`,
              LogStyle.warning
            )
          )
        }

        let spotlightName = stdout.trim()
        if (spotlightName.endsWith('.app')) {
          spotlightName = spotlightName.slice(0, -4)
        }

        const currentDisplayName = app.displayName

        if (spotlightName && spotlightName !== '(null)' && spotlightName !== currentDisplayName) {
          console.log(
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
      } catch (error) {
        console.error(
          formatLog(
            'AppScanner',
            `Error processing app ${chalk.red(app.path)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            LogStyle.error
          )
        )
      }
    }

    console.log(
      formatLog(
        'AppScanner',
        `mdls update scan finished. Updated ${chalk.green(
          updatedCount
        )} app display names in ${chalk.cyan(((Date.now() - startTime) / 1000).toFixed(1))}s.`,
        LogStyle.success
      )
    )

    return { updatedApps, updatedCount }
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
