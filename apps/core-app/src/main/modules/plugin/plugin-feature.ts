import {
  IFeatureCommand,
  IFeatureInteraction,
  IPluginDev,
  IPluginFeature,
  IPlatform,
  IFeatureLifeCycle
} from '@talex-touch/utils/plugin'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import { TuffIconImpl } from '../../core/tuff-icon'
import { ITuffIcon } from '@talex-touch/utils'
import vm from 'vm'
import { ITouchPlugin } from '@talex-touch/utils/plugin'

export const createBuilderWithPluginContext = (pluginName: string): typeof TuffItemBuilder => {
  return class TuffItemBuilderWithPlugin extends TuffItemBuilder {
    constructor(id: string) {
      super(id, 'plugin', 'plugin-features')
      this.setMeta({ pluginName })
    }
  }
}

import fse from 'fs-extra'

export function loadPluginFeatureContextFromContent(
  plugin: ITouchPlugin,
  scriptContent: string,
  context: any
): IFeatureLifeCycle {
  const sandbox = {
    exports: {},
    module: { exports: {} },
    require,
    __dirname: plugin.pluginPath,
    __filename: 'index.js',
    ...context
  }

  vm.createContext(sandbox)
  vm.runInContext(scriptContent, sandbox)

  return sandbox.module.exports
}

export function loadPluginFeatureContext(
  plugin: ITouchPlugin,
  featureIndex: string,
  context: any
): IFeatureLifeCycle {
  const scriptContent = fse.readFileSync(featureIndex, 'utf-8')
  return loadPluginFeatureContextFromContent(plugin, scriptContent, context)
}

export class PluginFeature implements IPluginFeature {
  id: string
  name: string
  desc: string
  icon: ITuffIcon
  push: boolean
  platform: IPlatform
  commands: IFeatureCommand[]
  interaction?: IFeatureInteraction
  priority: number
  dev: IPluginDev

  constructor(pluginPath: string, options: IPluginFeature, dev: IPluginDev) {
    this.id = options.id
    this.name = options.name
    this.desc = options.desc
    this.icon = new TuffIconImpl(pluginPath, options.icon.type, options.icon.value)
    this.push = options.push
    this.platform = options.platform
    this.commands = [...options.commands]
    this.interaction = options.interaction
    this.priority = options.priority ?? 0
    this.dev = dev
  }

  toJSONObject(): object {
    return {
      id: this.id,
      name: this.name,
      desc: this.desc,
      icon: this.icon,
      push: this.push,
      platform: this.platform,
      commands: this.commands,
      interaction: this.interaction,
      priority: this.priority
    }
  }
}
