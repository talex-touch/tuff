import { touchChannel } from "~/modules/channel/channel-core";
import cprocess from "child_process";
import { ref } from "vue";
import type { IFeatureCommand, IPluginIcon } from '@talex-touch/utils/plugin';
import { handleItemData } from './search-core';

export const apps = ref([]);
export const features = ref<any[]>([])

let lastRefreshTime = 0;
const REFRESH_COOLDOWN = 15000;

export const enum BoxMode {
  INPUT,
  COMMAND,
  IMAGE,
  FILE,
  FEATURE,
}

setTimeout(initialize, 200)

const searchList: any = [apps, features];

/**
 * Initializes the search system and sets up feature update listeners
 */
async function initialize() {
  await refreshSearchList(true)

  touchChannel.regChannel("core-box-updated:features", () => {
    features.value = touchChannel.sendSync("core-box-get:features");
  })
}

/**
 * Refreshes the search list with cooldown protection
 * @param forceRefresh - Whether to bypass cooldown protection
 */
export async function refreshSearchList(forceRefresh = false) {
  const currentTime = Date.now();

  if (!forceRefresh && currentTime - lastRefreshTime < REFRESH_COOLDOWN) {
    return;
  }

  try {
    lastRefreshTime = currentTime;
    apps.value = await touchChannel.send("core-box-get:apps");
    features.value = touchChannel.sendSync("core-box-get:features");
  } catch (error) {
    console.error("Failed to refresh search list:", error);
    lastRefreshTime = 0;
  }
}

/**
 * Forces a refresh of the search list bypassing cooldown
 */
export async function forceRefreshSearchList() {
  return await refreshSearchList(true);
}

export const appAmo: any = JSON.parse(
  localStorage.getItem("app-count") || "{}"
);

/**
 * Executes a search item (app or plugin feature)
 * @param item - The item to execute
 * @param query - The search query that triggered the execution
 */
export function execute(item: any, query: any = '') {
  if (!item) return

  appAmo[item.name] = (appAmo[item.name] || 0) + 1;
  localStorage.setItem("app-count", JSON.stringify(appAmo));

  const { type, action, pluginType, value } = item;

  if (type === 'app' || pluginType === 'app') {
    touchChannel.sendSync("core-box:hide");

    cprocess.exec(action, (error) => {
      if (error) {
        console.error(`Failed to launch app: ${error.message}`);

        if (process.platform === 'darwin' && action.startsWith('open ')) {
          const appPath = action.replace('open ', '').replace(/\\ /g, ' ');
          cprocess.exec(`open -a "${appPath}"`, (altError) => {
            if (altError) {
              console.error(`Alternative launch failed: ${altError.message}`);
            }
          });
        }
      }
    });
  }
  else if (type === 'plugin') {
    if (item.push) {
      return "push"
    }

    if (pluginType === 'feature' || pluginType === 'cmd') {
      touchChannel.sendSync("trigger-plugin-feature", {
        query,
        plugin: value,
        feature: JSON.parse(JSON.stringify(item)),
      })

    }
  }

}

/**
 * Search result item interface - unified with backend types
 * Compatible with ISearchItem from @talex-touch/utils
 */
export interface SearchItem {
  /** Display name of the search result */
  name: string;

  /** Description or subtitle of the search result */
  desc: string;

  /** Icon configuration for visual representation */
  icon: IPluginIcon;

  /** Whether this item supports push mode functionality */
  push: boolean;

  /** List of feature commands associated with this item */
  commands?: IFeatureCommand[];

  /** Array of searchable names for this item */
  names: string[];

  /** Array of keywords for search matching */
  keyWords: string[];

  /** Type of plugin this item belongs to */
  pluginType: string;

  /** General type classification of the item */
  type: string;

  /** Associated value, typically the plugin name */
  value: string;

  /** Usage frequency counter for ranking */
  amo?: number;

  /** Matching information from search algorithms */
  matched?: any;

  /** Whether this item was matched by name */
  matchedByName?: boolean;

  /** Whether this item was matched by description */
  descMatched?: boolean;

  /** Whether this item was matched by abbreviation */
  abridgeMatched?: boolean;

  /** Unique identifier for this search item */
  id?: string;

  /** Action to execute when this item is selected */
  action?: string;

  /** Reference to original feature object for command matching */
  originFeature?: SearchItem;

  /** Additional properties for extensibility */
  [key: string]: any;
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
export async function search(keyword: string, options: SearchOptions, info: any, callback: (res: SearchItem) => void) {
  await refreshSearchList()

  const results = [];

  if (options.mode === BoxMode.FEATURE) {
    touchChannel.send("trigger-plugin-feature-input-changed", {
      query: keyword,
      plugin: info?.plugin,
      feature: JSON.parse(JSON.stringify(info?.feature)),
    })
    // In FEATURE mode, don't search through apps and features list
    return;
  }

  for (let searchSection of searchList) {
    const data = [...searchSection.value];

    for (let item of data) {
      const result = handleItemData(item, keyword, options)

      if (Array.isArray(result)) {
        ;[...result].forEach(item => {
          item && (callback(item), results.push(item))
        })
      } else result && (callback(result), results.push(result))

    }
  }
}
