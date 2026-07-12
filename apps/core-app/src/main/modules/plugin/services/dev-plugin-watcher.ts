import type { IPluginManager, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { FSWatcher } from 'chokidar'
import path from 'node:path'
import { getLogger } from '@talex-touch/utils/common/logger'
import { fileWatchService } from '../../../service/file-watch.service'
import { debounce } from '../../../utils/common-util'

const devWatcherLog = getLogger('plugin-system').child('DevWatcher')

/**
 * Watches development plugins for file changes and triggers hot reload
 */
export class DevPluginWatcher {
  private readonly manager: IPluginManager
  private readonly devPlugins: Map<string, ITouchPlugin> = new Map()
  private readonly watchedPathsByPlugin = new Map<string, Set<string>>()
  private readonly watchedFileNames = [
    'manifest.json',
    'index.js',
    'preload.js',
    'index.html',
    'README.md'
  ]
  private watcherDisabled = false
  private watcherDisabledReason: string | null = null
  private watcherFatalLogged = false
  private watcher: FSWatcher | null = null

  constructor(manager: IPluginManager) {
    this.manager = manager
  }

  private normalizeFilePath(filePath: string): string {
    return path.resolve(filePath)
  }

  private buildWatchTargets(plugin: ITouchPlugin): Set<string> {
    const targets = new Set<string>()
    for (const fileName of this.watchedFileNames) {
      targets.add(this.normalizeFilePath(path.join(plugin.pluginPath, fileName)))
    }
    return targets
  }

  private watchPluginTargets(plugin: ITouchPlugin): void {
    if (!this.watcher) return
    const targets = this.buildWatchTargets(plugin)
    this.watchedPathsByPlugin.set(plugin.name, targets)
    this.watcher.add(Array.from(targets))
    devWatcherLog.debug('Watching controlled dev plugin files', {
      meta: {
        plugin: plugin.name,
        files: Array.from(targets)
      }
    })
  }

  private unwatchPluginTargets(pluginName: string): void {
    const targets = this.watchedPathsByPlugin.get(pluginName)
    if (!targets) return
    if (this.watcher) {
      this.watcher.unwatch(Array.from(targets))
    }
    this.watchedPathsByPlugin.delete(pluginName)
  }

  private resolvePluginNameByWatchedPath(filePath: string): string | undefined {
    for (const [pluginName, targets] of this.watchedPathsByPlugin.entries()) {
      if (targets.has(filePath)) return pluginName
    }
    return undefined
  }

  private maybeDisableWatcherForFatalError(error: unknown): boolean {
    const code =
      typeof (error as NodeJS.ErrnoException | undefined)?.code === 'string'
        ? (error as NodeJS.ErrnoException).code
        : ''
    if (code !== 'EMFILE' && code !== 'ENOSPC' && code !== 'ENAMETOOLONG') {
      return false
    }

    if (!this.watcherFatalLogged) {
      devWatcherLog.error(
        'Dev plugin watcher fatal error, disabling watcher to prevent crash storm',
        {
          error: error as Error,
          meta: { code }
        }
      )
      this.watcherFatalLogged = true
    }

    this.watcherDisabled = true
    this.watcherDisabledReason = code
    this.stop()
    return true
  }

  /**
   * Add a plugin to be watched for changes
   * @param plugin - Plugin to watch
   */
  addPlugin(plugin: ITouchPlugin): void {
    if (plugin.dev.enable && !plugin.dev.source) {
      this.devPlugins.set(plugin.name, plugin)
      if (this.watcherDisabled) {
        devWatcherLog.warn('Dev watcher disabled; plugin hot reload watch skipped', {
          meta: {
            plugin: plugin.name,
            reason: this.watcherDisabledReason || 'unknown'
          }
        })
        return
      }
      if (this.watcher) {
        this.watchPluginTargets(plugin)
      }
    }
  }

  /**
   * Remove a plugin from being watched
   * @param pluginName - Name of the plugin to stop watching
   */
  removePlugin(pluginName: string): void {
    const plugin = this.devPlugins.get(pluginName)
    if (plugin && !plugin.dev.source) {
      if (this.watcher) {
        this.unwatchPluginTargets(pluginName)
      }
      this.devPlugins.delete(pluginName)
      devWatcherLog.debug('Stopped watching dev plugin source', {
        meta: { path: plugin.pluginPath, plugin: plugin.name }
      })
    }
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.watcher) {
      devWatcherLog.warn('Watcher already started')
      return
    }
    if (this.watcherDisabled) {
      devWatcherLog.warn('Watcher disabled due to previous fatal error, skipping startup', {
        meta: { reason: this.watcherDisabledReason || 'unknown' }
      })
      return
    }

    this.watcher = fileWatchService.watch([], {
      ignored: (filePath: string) => {
        const normalizedPath = filePath.replace(/\\/g, '/')
        if (/[/\\]node_modules(?:[/\\]|$)/.test(filePath)) return true
        if (/[/\\]\.git(?:[/\\]|$)/.test(filePath)) return true
        if (/[/\\]\.vite(?:[/\\]|$)/.test(filePath)) return true
        if (/[/\\]dist(?:[/\\]|$)/.test(filePath)) return true
        if (/[/\\]logs(?:[/\\]|$)/.test(filePath)) return true
        return /(^|[/\\])\./.test(normalizedPath)
      },
      followSymlinks: false,
      depth: 1,
      ignorePermissionErrors: true,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    })

    this.watcher.on(
      'change',
      debounce(async (filePath) => {
        try {
          if (typeof filePath !== 'string') {
            return
          }
          const normalizedPath = this.normalizeFilePath(filePath)
          const pluginName = this.resolvePluginNameByWatchedPath(normalizedPath)
          if (!pluginName) return
          const fileName = path.basename(normalizedPath)
          devWatcherLog.debug('Dev plugin source changed, reloading', {
            meta: { plugin: pluginName, file: normalizedPath, fileName }
          })

          if (fileName === 'manifest.json') {
            devWatcherLog.debug('Manifest.json changed, reloading plugin with new configuration', {
              meta: { plugin: pluginName }
            })
          }

          await this.manager.reloadPlugin(pluginName)
        } catch (error) {
          devWatcherLog.error('Failed to process dev plugin file change', {
            error: error as Error,
            meta: { filePath }
          })
        }
      }, 300)
    )
    this.watcher.on('error', (error) => {
      if (this.maybeDisableWatcherForFatalError(error)) {
        return
      }
      devWatcherLog.error('Dev plugin watcher error', { error: error as Error })
    })

    for (const plugin of this.devPlugins.values()) {
      if (!plugin.dev.enable || plugin.dev.source) continue
      this.watchPluginTargets(plugin)
    }

    devWatcherLog.debug('Started watching for dev plugin changes', {
      meta: { plugins: this.devPlugins.size }
    })
  }

  /**
   * Stop watching for file changes
   */
  stop(): void {
    if (!this.watcher) return
    this.watchedPathsByPlugin.clear()
    void fileWatchService.close(this.watcher)
    this.watcher = null
    devWatcherLog.debug('Stopped watching for dev plugin changes')
  }
}
