import fse from 'fs-extra'
import path from 'path'
import axios from 'axios'
import { TouchPlugin } from './plugin'
import { PluginIcon } from './plugin-icon'
import { IPluginDev } from '@talex-touch/utils/plugin'
import { IFeatureLifeCycle, IPluginFeature } from '@talex-touch/utils/plugin'
import { PluginFeature } from './plugin-feature'
import { loadPluginFeatureContext, loadPluginFeatureContextFromContent } from './plugin-feature'
import { TuffFactory, TuffUtils } from '@talex-touch/utils/core-box'
import { createBuilderWithPluginContext } from './plugin-feature'
import pkg from '../../../package.json'

/**
 * The context required for loading plugin features.
 */
const getFeatureContext = (touchPlugin: TouchPlugin) => ({
  scope: 'plugin',
  plugin: touchPlugin,
  console: {
    log: touchPlugin.logger.info.bind(touchPlugin.logger),
    info: touchPlugin.logger.info.bind(touchPlugin.logger),
    warn: touchPlugin.logger.warn.bind(touchPlugin.logger),
    error: touchPlugin.logger.error.bind(touchPlugin.logger),
    debug: touchPlugin.logger.debug.bind(touchPlugin.logger)
  },
  pkg,
  $util: touchPlugin.getFeatureUtil(),
  $event: touchPlugin.getFeatureEventUtil(),
  TuffFactory,
  TuffUtils,
  URLSearchParams,
  TuffItemBuilder: createBuilderWithPluginContext(touchPlugin.name)
})

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

    const placeholderIcon = new PluginIcon(this.pluginPath, 'error', 'loading', {
      enable: false,
      address: ''
    })
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

  protected async loadCommon(pluginInfo: any): Promise<void> {
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

    const icon = new PluginIcon(
      this.pluginPath,
      pluginInfo.icon.type,
      pluginInfo.icon.value,
      this.touchPlugin.dev
    )
    await icon.init()
    this.touchPlugin.icon = icon
    if (icon.type === 'error') {
      this.touchPlugin.issues.push({
        type: 'warning',
        message: icon.value,
        source: 'icon',
        timestamp: Date.now()
      })
    }

    if (pluginInfo.features) {
      const pendingList: Promise<any>[] = []
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
        pendingList.push(
          new Promise((resolve) =>
            pluginFeature.icon.init().then(() => {
              if (pluginFeature.icon.type === 'error') {
                this.touchPlugin.issues.push({
                  type: 'warning',
                  message: `Icon for feature '${pluginFeature.name}' failed to load: ${pluginFeature.icon.value}`,
                  source: `feature:${pluginFeature.id}`,
                  timestamp: Date.now()
                })
              }
              resolve(true)
            })
          )
        )
      })
      await Promise.allSettled(pendingList)
    }
  }
}

class LocalPluginLoader extends BasePluginLoader implements IPluginLoader {
  async load(): Promise<TouchPlugin> {
    const manifestPath = path.resolve(this.pluginPath, 'manifest.json')
    try {
      const pluginInfo = fse.readJSONSync(manifestPath)
      await this.loadCommon(pluginInfo)

      // The logic for loading index.js has been moved to the `enable` method of the plugin.
      // This loader is now only responsible for loading the manifest and basic plugin information.
    } catch (error: any) {
      this.touchPlugin.issues.push({
        type: 'error',
        message: `Failed to read or parse local manifest.json: ${error.message}`,
        source: 'manifest.json',
        code: 'INVALID_MANIFEST_JSON',
        meta: { error: error.stack },
        timestamp: Date.now()
      })
    }
    return this.touchPlugin
  }
}

class DevPluginLoader extends BasePluginLoader implements IPluginLoader {
  private readonly devConfig: IPluginDev

  constructor(pluginName: string, pluginPath: string, devConfig: IPluginDev) {
    super(pluginName, pluginPath)
    this.devConfig = devConfig
  }

  async load(): Promise<TouchPlugin> {
    let pluginInfo: any

    try {
      const remoteManifestUrl = new URL('manifest.json', this.devConfig.address).toString()
      this.touchPlugin.logger.info(`[Dev] Fetching remote manifest from ${remoteManifestUrl}`)
      const response = await axios.get(remoteManifestUrl, {
        timeout: 2000,
        proxy: false,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        }
      })
      pluginInfo = response.data
      this.touchPlugin.logger.info(
        `[Dev] Remote manifest fetched successfully. Version: ${pluginInfo.version}`
      )
      fse.writeJSONSync(path.resolve(this.pluginPath, 'manifest.json'), pluginInfo, { spaces: 2 })
      this.touchPlugin.logger.info(`[Dev] Wrote remote manifest to local cache.`)
      this.touchPlugin.issues.push({
        type: 'warning',
        message: `Plugin is running in development mode, loading from ${this.devConfig.address}.`,
        source: 'dev-mode',
        code: 'DEV_MODE_ACTIVE',
        timestamp: Date.now()
      })
    } catch (error: any) {
      const remoteManifestUrl = new URL('manifest.json', this.devConfig.address).toString()
      this.touchPlugin.issues.push({
        type: 'error',
        message: `Failed to fetch remote manifest from ${remoteManifestUrl}: ${error.message}. In dev-source mode, this is a fatal error.`,
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

    // The logic for loading the remote index.js has been moved to the `enable` method of the plugin.
    // This ensures that the script is only fetched and executed when the plugin is explicitly enabled.

    return this.touchPlugin
  }
}

export function createPluginLoader(pluginName: string, pluginPath: string): IPluginLoader {
  const manifestPath = path.resolve(pluginPath, 'manifest.json')
  const localPluginInfo = fse.readJSONSync(manifestPath)
  const devConfig = localPluginInfo.dev || { enable: false, address: '', source: false }

  if (devConfig.enable) {
    return new DevPluginLoader(pluginName, pluginPath, devConfig)
  } else {
    return new LocalPluginLoader(pluginName, pluginPath)
  }
}
