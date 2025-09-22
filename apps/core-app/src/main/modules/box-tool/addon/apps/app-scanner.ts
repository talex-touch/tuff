import path from 'path'
import os from 'os'
import { formatLog, LogStyle } from './app-utils'
import chalk from 'chalk'
import { exec } from 'child_process'

/**
 * 应用扫描服务，负责应用发现和相关信息获取
 */
export class AppScanner {
  private isMac = process.platform === 'darwin'
  private isWindows = process.platform === 'win32'
  private isLinux = process.platform === 'linux'

  // 监视路径配置
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
   * 获取平台对应的监视路径
   */
  getWatchPaths(): string[] {
    return this.WATCH_PATHS
  }

  /**
   * 获取指定平台的所有应用
   */
  async getApps(): Promise<any[]> {
    console.log(formatLog('AppScanner', '开始扫描应用...', LogStyle.process))

    try {
      let apps = []
      if (this.isMac) {
        console.log(formatLog('AppScanner', '检测到 macOS 平台，使用 mdfind 扫描应用', LogStyle.info))
        const { getApps } = await import('./darwin')
        apps = await getApps()
      } else if (this.isWindows) {
        console.log(formatLog('AppScanner', '检测到 Windows 平台，扫描开始菜单和程序目录', LogStyle.info))
        const { getApps } = await import('./win')
        apps = await getApps()
      } else if (this.isLinux) {
        console.log(formatLog('AppScanner', '检测到 Linux 平台，扫描 .desktop 文件', LogStyle.info))
        const { getApps } = await import('./linux')
        apps = await getApps()
      }

      console.log(
        formatLog(
          'AppScanner',
          `扫描完成，共发现 ${chalk.green(apps.length)} 个应用`,
          LogStyle.success
        )
      )
      return apps
    } catch (error) {
      console.error(
        formatLog(
          'AppScanner',
          `扫描应用时发生错误: ${error instanceof Error ? error.message : String(error)}`,
          LogStyle.error
        )
      )
      return []
    }
  }

  /**
   * 获取指定路径的应用信息
   */
  async getAppInfoByPath(filePath: string): Promise<any> {
    try {
      console.log(formatLog('AppScanner', `获取应用信息: ${chalk.cyan(filePath)}`, LogStyle.info))

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
          `获取应用 ${chalk.cyan(filePath)} 信息失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
          LogStyle.error
        )
      )
      return null
    }
  }

  /**
   * 运行 macOS 平台的 mdls 更新扫描
   */
  async runMdlsUpdateScan(apps: any[]): Promise<{updatedApps: any[], updatedCount: number}> {
    if (process.platform !== 'darwin') {
      console.log(formatLog('AppScanner', '非 macOS 平台，跳过 mdls 扫描', LogStyle.info))
      return { updatedApps: [], updatedCount: 0 }
    }

    console.log(formatLog('AppScanner', '开始 mdls 更新扫描', LogStyle.process))

    if (apps.length === 0) {
      console.log(formatLog('AppScanner', '应用列表为空，跳过 mdls 扫描', LogStyle.info))
      return { updatedApps: [], updatedCount: 0 }
    }

    console.log(formatLog('AppScanner', `为 ${chalk.cyan(apps.length)} 个应用运行 mdls 扫描`, LogStyle.process))

    let updatedCount = 0
    const updatedApps = []
    const startTime = Date.now()

    for (const app of apps) {
      try {
        const command = `mdls -name kMDItemDisplayName -raw "${app.path}"`
        const { stdout, stderr } = await this._execCommand(command)

        if (stderr) {
          console.warn(formatLog('AppScanner', `mdls 命令警告 ${chalk.yellow(app.path)}: ${stderr}`, LogStyle.warning))
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
              `更新应用显示名: ${chalk.cyan(app.name)}: "${currentDisplayName || 'null'}" -> "${spotlightName}"`,
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
            `处理应用 ${chalk.red(app.path)} 时出错: ${error instanceof Error ? error.message : String(error)}`,
            LogStyle.error
          )
        )
      }
    }

    console.log(
      formatLog(
        'AppScanner',
        `mdls 更新扫描完成，更新了 ${chalk.green(updatedCount)} 个应用的显示名，耗时 ${chalk.cyan(((Date.now() - startTime) / 1000).toFixed(1))} 秒`,
        LogStyle.success
      )
    )

    return { updatedApps, updatedCount }
  }

  /**
   * 执行命令并返回结果
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

// 导出单例
export const appScanner = new AppScanner()