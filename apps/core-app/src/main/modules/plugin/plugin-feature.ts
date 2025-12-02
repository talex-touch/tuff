import type { ITuffIcon } from '@talex-touch/utils'
import type {
  IFeatureCommand,
  IFeatureInteraction,
  IFeatureLifeCycle,
  IPlatform,
  IPluginDev,
  IPluginFeature,
  ITouchPlugin,
} from '@talex-touch/utils/plugin'
import vm from 'node:vm'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import fse from 'fs-extra'
import { TuffIconImpl } from '../../core/tuff-icon'

/**
 * Create TuffItemBuilder with plugin context
 * @param pluginName - Plugin name to inject into meta
 * @returns TuffItemBuilder subclass with plugin context
 */
export function createBuilderWithPluginContext(pluginName: string): typeof TuffItemBuilder {
  return class TuffItemBuilderWithPlugin extends TuffItemBuilder {
    constructor(id: string) {
      super(id, 'plugin', 'plugin-features')
      this.setMeta({ pluginName })
    }
  }
}

/**
 * Load plugin feature lifecycle from script content
 * @param plugin - Plugin instance
 * @param scriptContent - JavaScript code to execute
 * @param context - Execution context
 * @returns Feature lifecycle implementation
 */
export function loadPluginFeatureContextFromContent(
  plugin: ITouchPlugin,
  scriptContent: string,
  context: any,
): IFeatureLifeCycle {
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require,
    __dirname: plugin.pluginPath,
    __filename: 'index.js',
    ...context,
  }

  vm.createContext(sandbox)
  vm.runInContext(scriptContent, sandbox)

  return sandbox.module.exports
}

/**
 * Load plugin feature lifecycle from file
 * @param plugin - Plugin instance
 * @param featureIndex - Path to feature script
 * @param context - Execution context
 * @returns Feature lifecycle implementation
 */
export function loadPluginFeatureContext(
  plugin: ITouchPlugin,
  featureIndex: string,
  context: any,
): IFeatureLifeCycle {
  const scriptContent = fse.readFileSync(featureIndex, 'utf-8')
  return loadPluginFeatureContextFromContent(plugin, scriptContent, context)
}

/**
 * Plugin feature implementation
 */
export class PluginFeature implements IPluginFeature {
  id: string
  name: string
  desc: string
  icon: ITuffIcon
  keywords?: string[]
  push: boolean
  platform: IPlatform
  commands: IFeatureCommand[]
  interaction?: IFeatureInteraction
  priority: number
  dev: IPluginDev
  searchTokens?: string[]

  constructor(pluginPath: string, options: IPluginFeature, dev: IPluginDev) {
    this.id = options.id
    this.name = options.name
    this.desc = options.desc
    this.icon = new TuffIconImpl(pluginPath, options.icon.type, options.icon.value)
    this.keywords = options.keywords
    this.push = options.push
    this.platform = options.platform
    this.commands = [...options.commands]
    this.interaction = options.interaction
    this.priority = options.priority ?? 0
    this.dev = dev
  }

  /**
   * Serialize feature to JSON object
   * @returns Plain object representation of the feature
   */
  toJSONObject(): object {
    return {
      id: this.id,
      name: this.name,
      desc: this.desc,
      icon: {
        type: this.icon.type,
        value: this.icon.value,
        status: this.icon.status,
      },
      keywords: this.keywords,
      push: this.push,
      platform: this.platform,
      commands: this.commands,
      interaction: this.interaction,
      priority: this.priority,
    }
  }
}
