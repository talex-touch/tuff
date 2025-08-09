import type { IFeatureCommand, IPluginIcon } from '@talex-touch/utils/plugin'

export const enum BoxMode {
  INPUT,
  COMMAND,
  IMAGE,
  FILE,
  FEATURE
}

/**
 * Search result item interface - unified with backend types
 * Compatible with ISearchItem from @talex-touch/utils
 */
export interface SearchItem {
  /** Display name of the search result */
  name: string

  /** Description or subtitle of the search result */
  desc: string

  /** Icon configuration for visual representation */
  icon: IPluginIcon

  /** Whether this item supports push mode functionality */
  push: boolean

  /** List of feature commands associated with this item */
  commands?: IFeatureCommand[]

  /** Array of searchable names for this item */
  names: string[]

  /** Array of keywords for search matching */
  keyWords: string[]

  /** Type of plugin this item belongs to */
  pluginType: string

  /** General type classification of the item */
  type: string

  /** Associated value, typically the plugin name */
  value: string

  /** Usage frequency counter for ranking */
  amo?: number

  /** Matching information from search algorithms */
  matched?: any

  /** Whether this item was matched by name */
  matchedByName?: boolean

  /** Whether this item was matched by description */
  descMatched?: boolean

  /** Whether this item was matched by abbreviation */
  abridgeMatched?: boolean

  /** Unique identifier for this search item */
  id?: string

  /** Action to execute when this item is selected */
  action?: string

  /** Reference to original feature object for command matching */
  originFeature?: SearchItem

  /** Additional properties for extensibility */
  [key: string]: any
}

// Interface for search options
export interface SearchOptions {
  mode: BoxMode
}

export type ISearchMiddleware = (
  item: SearchItem,
  keyword: string,
  options: SearchOptions
) => SearchItem | SearchItem[] | null
export interface IBoxOptions {
  lastHidden: number
  mode: BoxMode
  focus: number
  file: {
    buffer: Uint8Array | null
    paths: string[]
  }
  data: any
}