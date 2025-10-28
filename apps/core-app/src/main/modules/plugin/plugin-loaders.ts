import fse from 'fs-extra'
import path from 'path'
import axios from 'axios'
import { TouchPlugin } from './plugin'
import { TuffIconImpl } from '../../core/tuff-icon'
import { IPluginDev } from '@talex-touch/utils/plugin'
import { IPluginFeature } from '@talex-touch/utils/plugin'
import { PluginFeature } from './plugin-feature'
import { TuffIconType } from '@talex-touch/utils/types/icon'

/**
 * Plugin manifest structure from manifest.json
 */
interface PluginManifest {
  name: string
  version: string
  description: string
  icon: {
    type: TuffIconType
    value: string
  }
  dev?: IPluginDev
  platforms?: Record<string, boolean>
  features?: IPluginFeature[]
}

/**
 * Plugin loader interface
 */
export interface IPluginLoader {
  load(): Promise<TouchPlugin>
}

abstract class BasePluginLoader {
  protected readonly pluginName: string
  protected readonly pluginPath: string
  protected readonly touchPlugin: TouchPlugin

  constructor(pluginName: string, pluginPath: string) {
    this.pluginName = pluginName
    this.pluginPath = pluginPath

    const placeholderIcon = new TuffIconImpl(this.pluginPath, 'emoji', '')
    placeholderIcon.status = 'error'
    this.touchPlugin = new TouchPlugin(
      this.pluginName,
      placeholderIcon,
      '0.0.0',
      'Loading...',
      '',
      { enable: false, address: '' },
      this.pluginPath
    )
  }

  /**
   * Load common plugin information from manifest
   * @param pluginInfo - Plugin manifest data
   */
  protected async loadCommon(pluginInfo: PluginManifest): Promise<void> {
    if (pluginInfo.name !== this.pluginName) {
      this.touchPlugin.issues.push({
        type: 'error',
        message: `Plugin name in manifest ('${pluginInfo.name}') does not match directory name ('${this.pluginName}').`,
        source: 'manifest.json',
        code: 'NAME_MISMATCH',
        suggestion: 'Ensure the plugin directory name matches the "name" field in manifest.json.',
        meta: { expected: this.pluginName, actual: pluginInfo.name },
        timestamp: Date.now()
      })
    }

    this.touchPlugin.name = pluginInfo.name || this.pluginName
    this.touchPlugin.version = pluginInfo.version || '0.0.0'
    this.touchPlugin.desc = pluginInfo.description || 'No description.'
    this.touchPlugin.dev = pluginInfo.dev || { enable: false, address: '', source: false }
    this.touchPlugin.platforms = pluginInfo.platforms || {}

    this.touchPlugin.readme = ((p) => (fse.existsSync(p) ? fse.readFileSync(p).toString() : ''))(
      path.resolve(this.pluginPath, 'README.md')
    )

    const icon = new TuffIconImpl(this.pluginPath, pluginInfo.icon.type, pluginInfo.icon.value)
    await icon.init()
    this.touchPlugin.icon = icon
    if (icon.status === 'error') {
      this.touchPlugin.issues.push({
        type: 'warning',
        message: 'Icon loading failed',
        source: 'icon',
        timestamp: Date.now()
      })
    }

    if (pluginInfo.features) {
      const iconInitPromises: Promise<void>[] = []
      ;[...pluginInfo.features].forEach((feature: IPluginFeature) => {
        const pluginFeature = new PluginFeature(this.pluginPath, feature, this.touchPlugin.dev)
        if (!this.touchPlugin.addFeature(pluginFeature)) {
          this.touchPlugin.issues.push({
            type: 'warning',
            message: `Feature '${feature.name}' could not be added. It might be a duplicate or have an invalid format.`,
            source: `feature:${feature.id}`,
            meta: { feature },
            timestamp: Date.now()
          })
        }

        if (pluginFeature.icon instanceof TuffIconImpl) {
          iconInitPromises.push(pluginFeature.icon.init())
        }
      })

      await Promise.allSettled(iconInitPromises)

      this.touchPlugin.features.forEach((pluginFeature) => {
        if (pluginFeature.icon.status === 'error') {
          this.touchPlugin.issues.push({
            type: 'warning',
            message: `Icon for feature '${pluginFeature.name}' failed to load`,
            source: `feature:${pluginFeature.id}`,
            timestamp: Date.now()
          })
        }
      })
    }
  }
}

/**
 * Loader for local plugins
 */
class LocalPluginLoader extends BasePluginLoader implements IPluginLoader {
  async load(): Promise<TouchPlugin> {
    const manifestPath = path.resolve(this.pluginPath, 'manifest.json')
    try {
      const pluginInfo = fse.readJSONSync(manifestPath) as PluginManifest
      await this.loadCommon(pluginInfo)
    } catch (error) {
      const err = error as Error
      this.touchPlugin.issues.push({
        type: 'error',
        message: `Failed to read or parse local manifest.json: ${err.message}`,
        source: 'manifest.json',
        code: 'INVALID_MANIFEST_JSON',
        meta: { error: err.stack },
        timestamp: Date.now()
      })
    }
    return this.touchPlugin
  }
}

/**
 * Loader for plugins in development mode
 */
class DevPluginLoader extends BasePluginLoader implements IPluginLoader {
  private readonly devConfig: IPluginDev

  constructor(pluginName: string, pluginPath: string, devConfig: IPluginDev) {
    super(pluginName, pluginPath)
    this.devConfig = devConfig
  }

  async load(): Promise<TouchPlugin> {
    let pluginInfo: PluginManifest

    try {
      const remoteManifestUrl = new URL('manifest.json', this.devConfig.address).toString()
      this.touchPlugin.logger.debug(`[Dev] Fetching remote manifest from ${remoteManifestUrl}`)
      const response = await axios.get<PluginManifest>(remoteManifestUrl, {
        timeout: 2000,
        proxy: false,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        }
      })
      pluginInfo = response.data
      this.touchPlugin.logger.debug(
        `[Dev] Remote manifest fetched successfully. Version: ${pluginInfo.version}`
      )
      // Note: manifest.json is NOT written here to avoid triggering file watchers
      // It will be synced by DevServerHealthMonitor when manifest changes are detected via heartbeat
      this.touchPlugin.issues.push({
        type: 'warning',
        message: `Plugin is running in development mode, loading from ${this.devConfig.address}.`,
        source: 'dev-mode',
        code: 'DEV_MODE_ACTIVE',
        timestamp: Date.now()
      })
    } catch (error) {
      const err = error as Error
      const remoteManifestUrl = new URL('manifest.json', this.devConfig.address).toString()
      this.touchPlugin.issues.push({
        type: 'error',
        message: `Failed to fetch remote manifest from ${remoteManifestUrl}: ${err.message}. In dev-source mode, this is a fatal error.`,
        source: 'dev-mode',
        code: 'REMOTE_MANIFEST_FAILED',
        suggestion:
          'Ensure the dev server is running at the correct address and the manifest.json is accessible.',
        meta: { url: remoteManifestUrl },
        timestamp: Date.now()
      })
      return this.touchPlugin
    }

    await this.loadCommon(pluginInfo)

    return this.touchPlugin
  }
}

/**
 * Create appropriate plugin loader based on manifest configuration
 * @param pluginName - Plugin directory name
 * @param pluginPath - Absolute path to plugin directory
 * @returns Plugin loader instance
 */
export function createPluginLoader(pluginName: string, pluginPath: string): IPluginLoader {
  const manifestPath = path.resolve(pluginPath, 'manifest.json')
  const localPluginInfo = fse.readJSONSync(manifestPath) as PluginManifest
  const devConfig = localPluginInfo.dev || { enable: false, address: '', source: false }

  if (devConfig.enable) {
    return new DevPluginLoader(pluginName, pluginPath, devConfig)
  } else {
    return new LocalPluginLoader(pluginName, pluginPath)
  }
}
