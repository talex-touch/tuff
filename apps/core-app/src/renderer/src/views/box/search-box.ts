import { touchChannel } from '~/modules/channel/channel-core'
// import cprocess from "child_process";
import { ref } from 'vue'
import type { IFeatureCommand, IPluginIcon } from '@talex-touch/utils/plugin'
import { handleItemData } from './search-core'

export const apps = ref([])
export const features = ref<any[]>([])

let lastRefreshTime = 0
const REFRESH_COOLDOWN = 15000

export const enum BoxMode {
  INPUT,
  COMMAND,
  IMAGE,
  FILE,
  FEATURE
}

setTimeout(initialize, 200)

const searchList: any = [apps, features]

/**
 * Initializes the search system and sets up feature update listeners
 */
async function initialize() {
  await refreshSearchList(true)

  touchChannel.regChannel('core-box-updated:features', () => {
    features.value = touchChannel.sendSync('core-box-get:features')
  })
}

/**
 * Refreshes the search list with cooldown protection
 * @param forceRefresh - Whether to bypass cooldown protection
 */
export async function refreshSearchList(forceRefresh = false) {
  const currentTime = Date.now()
  const timeSinceLastRefresh = currentTime - lastRefreshTime

  console.log(
    `[SearchBox] refreshSearchList called - forceRefresh: ${forceRefresh}, timeSinceLastRefresh: ${timeSinceLastRefresh}ms, cooldown: ${REFRESH_COOLDOWN}ms`
  )

  if (!forceRefresh && timeSinceLastRefresh < REFRESH_COOLDOWN) {
    console.log(
      `[SearchBox] Skipping refresh due to cooldown (${timeSinceLastRefresh}ms < ${REFRESH_COOLDOWN}ms)`
    )
    return
  }

  try {
    console.log(
      `[SearchBox] Starting refresh - apps.value.length: ${apps.value.length}, features.value.length: ${features.value.length}`
    )
    lastRefreshTime = currentTime

    apps.value = await touchChannel.send('core-box-get:apps')
    console.log(`[SearchBox] Apps refreshed - new count: ${apps.value.length}`)

    features.value = touchChannel.sendSync('core-box-get:features')
    console.log(`[SearchBox] Features refreshed - new count: ${features.value.length}`)
    console.log(
      `[SearchBox] Features list:`,
      features.value.map((f) => f.name)
    )
  } catch (error) {
    console.error('[SearchBox] Failed to refresh search list:', error)
    lastRefreshTime = 0
  }
}

/**
 * Forces a refresh of the search list bypassing cooldown
 */
export async function forceRefreshSearchList() {
  return await refreshSearchList(true)
}

export const appAmo: any = JSON.parse(localStorage.getItem('app-count') || '{}')

/**
 * Executes a search item (app or plugin feature)
 * @param item - The item to execute
 * @param query - The search query that triggered the execution
 */
export function execute(item: any, query: any = '') {
  if (!item) return

  console.log(`[SearchBox] execute() called - item:`, item, `query: "${query}"`)

  appAmo[item.name] = (appAmo[item.name] || 0) + 1
  localStorage.setItem('app-count', JSON.stringify(appAmo))

  const { type, action, pluginType, value } = item
  console.log(
    `[SearchBox] execute() - type: ${type}, action: ${action}, pluginType: ${pluginType}, value: ${value}, push: ${item.push}`
  )

  if (type === 'app' || pluginType === 'app') {
    touchChannel.sendSync('core-box:hide')

    // TODO: complete this part
    // cprocess.exec(action, (error) => {
    //   if (error) {
    //     console.error(`Failed to launch app: ${error.message}`);

    //     if (process.platform === 'darwin' && action.startsWith('open ')) {
    //       const appPath = action.replace('open ', '').replace(/\\ /g, ' ');
    //       cprocess.exec(`open -a "${appPath}"`, (altError) => {
    //         if (altError) {
    //           console.error(`Alternative launch failed: ${altError.message}`);
    //         }
    //       });
    //     }
    //   }
    // });
  } else if (type === 'plugin') {
    if (pluginType === 'feature' || pluginType === 'cmd') {
      console.log(`[SearchBox] execute() - triggering plugin feature: ${value}`)

      // Safely handle item serialization
      let feature = item
      try {
        feature = JSON.parse(JSON.stringify(item))
      } catch (error) {
        console.error(
          `[SearchBox] Failed to serialize item for trigger-plugin-feature:`,
          error,
          item
        )
        // Use original item if serialization fails
      }

      touchChannel.sendSync('trigger-plugin-feature', {
        query,
        plugin: value,
        feature: feature
      })
    }

    // After triggering the feature, check if it's a push mode plugin
    if (item.push) {
      console.log(
        `[SearchBox] execute() - item has push=true, returning "push" after triggering feature`
      )
      return 'push'
    }
  }
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

export interface SearchOptions {
  mode: BoxMode
}

/**
 * Performs search across all available items
 * @param keyword - The search keyword
 * @param options - Search options including mode
 * @param info - Additional search context information
 * @param callback - Callback function called for each search result
 */
export async function search(
  keyword: string,
  options: SearchOptions,
  info: any,
  callback: (res: SearchItem) => void
) {
  console.log(
    `[SearchBox] search() called - keyword: "${keyword}", mode: ${options.mode}, info:`,
    info
  )

  // Remove automatic refresh on every search - now only refresh when CoreBox is shown
  // await refreshSearchList()

  const results = []

  if (options.mode === BoxMode.FEATURE) {
    console.log(`[SearchBox] FEATURE mode - sending trigger-plugin-feature-input-changed`)
    console.log(`[SearchBox] FEATURE mode - info:`, info)

    // Safely handle feature serialization
    let feature = null
    if (info?.feature) {
      try {
        feature = JSON.parse(JSON.stringify(info.feature))
      } catch (error) {
        console.error(`[SearchBox] Failed to serialize feature:`, error, info.feature)
        feature = info.feature // Use original if serialization fails
      }
    }

    touchChannel.send('trigger-plugin-feature-input-changed', {
      query: keyword,
      plugin: info?.plugin,
      feature: feature
    })
    // In FEATURE mode, don't search through apps and features list
    return
  }

  console.log(`[SearchBox] Searching through ${searchList.length} sections`)

  for (let i = 0; i < searchList.length; i++) {
    const searchSection = searchList[i]
    const sectionName = searchSection === apps.value ? 'apps' : 'features'
    const data = [...searchSection.value]

    console.log(`[SearchBox] Processing section ${i} (${sectionName}) with ${data.length} items`)

    for (let j = 0; j < data.length; j++) {
      const item = data[j]

      try {
        const result = handleItemData(item, keyword, options)

        if (Array.isArray(result)) {
          console.log(
            `[SearchBox] Item "${item?.name || 'unknown'}" returned ${result.length} results`
          )
          ;[...result].forEach((resultItem, idx) => {
            if (resultItem) {
              console.log(
                `[SearchBox] Adding result ${idx}: "${resultItem?.name || 'unknown'}" (type: ${resultItem?.type || 'unknown'})`
              )
              callback(resultItem)
              results.push(resultItem)
            }
          })
        } else if (result) {
          console.log(
            `[SearchBox] Item "${item?.name || 'unknown'}" returned single result: "${result?.name || 'unknown'}" (type: ${result?.type || 'unknown'})`
          )
          callback(result)
          results.push(result)
        }
      } catch (error) {
        console.error(`[SearchBox] Error processing item:`, error, item)
      }
    }
  }

  console.log(`[SearchBox] Search completed - total results: ${results.length}`)
}
