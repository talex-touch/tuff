import type { ITuffIcon } from '@talex-touch/utils'
import type {
  IFeatureCommand,
  IFeatureInteraction,
  IPlatform,
  IPluginDev,
  IPluginFeature
} from '@talex-touch/utils/plugin'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
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
  experimental?: boolean
  acceptedInputTypes?: IPluginFeature['acceptedInputTypes']
  omniTransfer?: IPluginFeature['omniTransfer']
  footerHints?: IPluginFeature['footerHints']
  dev: IPluginDev
  searchTokens?: string[]

  constructor(pluginPath: string, options: IPluginFeature, dev: IPluginDev) {
    this.id = options.id
    this.name = options.name
    this.desc = options.desc
    this.icon = new TuffIconImpl(
      pluginPath,
      options.icon.type,
      options.icon.value,
      dev,
      options.icon.colorful,
      options.icon.color
    )
    this.keywords = options.keywords
    this.push = options.push
    this.platform = options.platform
    this.commands = [...options.commands]
    this.interaction = options.interaction
    this.priority = options.priority ?? 0
    this.experimental = options.experimental ?? false
    this.acceptedInputTypes = options.acceptedInputTypes
      ? [...options.acceptedInputTypes]
      : undefined
    this.omniTransfer = options.omniTransfer
      ? {
          ...options.omniTransfer,
          payload: options.omniTransfer.payload ? { ...options.omniTransfer.payload } : undefined
        }
      : undefined
    this.footerHints = options.footerHints
      ? JSON.parse(JSON.stringify(options.footerHints))
      : undefined
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
        color: this.icon.color,
        colorful: this.icon.colorful
      },
      keywords: this.keywords,
      push: this.push,
      platform: this.platform,
      commands: this.commands,
      interaction: this.interaction,
      priority: this.priority,
      experimental: this.experimental,
      acceptedInputTypes: this.acceptedInputTypes,
      omniTransfer: this.omniTransfer,
      footerHints: this.footerHints
    }
  }
}
