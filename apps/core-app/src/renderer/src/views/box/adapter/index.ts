import { touchChannel } from '~/modules/channel/channel-core'
import { handleItemData } from './matcher'
import {
  apps,
  features,
  searchList,
  lastRefreshTime,
  REFRESH_COOLDOWN,
  setLastRefreshTime,
  appAmo
} from './store'
import { BoxMode, SearchItem, SearchOptions } from './types'

export * from './types'
export { appAmo }

/**
 * Initializes the search system and sets up feature update listeners
 * @returns Promise<void>
 */
async function initialize(): Promise<void> {
  await refreshSearchList(true)

  touchChannel.regChannel('core-box-updated:features', () => {
    features.value = touchChannel.sendSync('core-box-get:features')
  })
}

// Initialize the search system after a short delay
setTimeout(initialize, 200)

/**
 * Refreshes the search list with cooldown protection
 * @param forceRefresh - Whether to bypass cooldown protection
 * @returns Promise<void>
 */
export async function refreshSearchList(forceRefresh = false): Promise<void> {
  const currentTime = Date.now()
  const timeSinceLastRefresh = currentTime - lastRefreshTime

  if (!forceRefresh && timeSinceLastRefresh < REFRESH_COOLDOWN) {
    return
  }

  try {
    setLastRefreshTime(currentTime)

    apps.value = await touchChannel.send('core-box-get:apps')
    features.value = touchChannel.sendSync('core-box-get:features')
  } catch (error) {
    console.error('[SearchBox] Failed to refresh search list:', error)
    setLastRefreshTime(0)
  }
}

/**
 * Forces a refresh of the search list bypassing cooldown
 * @returns Promise<void>
 */
export async function forceRefreshSearchList(): Promise<void> {
  return await refreshSearchList(true)
}

/**
 * Executes a search item (app or plugin feature)
 * @param item - The item to execute
 * @param query - The search query that triggered the execution
 * @returns string | void
 */
export function execute(item: any, query: any = ''): string | void {
  if (!item) return

  appAmo[item.name] = (appAmo[item.name] || 0) + 1
  localStorage.setItem('app-count', JSON.stringify(appAmo))

  const { type, action, pluginType, value } = item

  if (type === 'app' || pluginType === 'app') {
    touchChannel.sendSync('core-box:hide')

    // TODO: complete this part
    // cprocess.exec(action, (error) => {
    //   if (error) {
    //     console.error(`Failed to launch app: ${error.message}`);
    //
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
      // Safely handle item serialization
      let feature = item
      try {
        feature = JSON.parse(JSON.stringify(item))
      } catch (error) {
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
      return 'push'
    }
  }
}

/**
 * Performs search across all available items
 * @param keyword - The search keyword
 * @param options - Search options including mode
 * @param info - Additional search context information
 * @param callback - Callback function called for each search result
 * @returns Promise<void>
 */
export async function search(
  keyword: string,
  options: SearchOptions,
  info: any,
  callback: (res: SearchItem) => void
): Promise<void> {
  if (options.mode === BoxMode.FEATURE) {
    // Safely handle feature serialization
    let feature = null
    if (info?.feature) {
      try {
        feature = JSON.parse(JSON.stringify(info.feature))
      } catch (error) {
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

  for (let i = 0; i < searchList.length; i++) {
    const searchSection = searchList[i]
    const data = [...searchSection.value]

    for (let j = 0; j < data.length; j++) {
      const item = data[j]

      try {
        const result = handleItemData(item, keyword, options)

        if (Array.isArray(result)) {
          ;[...result].forEach((resultItem) => {
            if (resultItem) {
              callback(resultItem)
            }
          })
        } else if (result) {
          callback(result)
        }
      } catch (error) {
        console.error(`[SearchBox] Error processing item:`, error, item)
      }
    }
  }
}