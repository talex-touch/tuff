import { touchChannel } from "~/modules/channel/channel-core";
import cprocess from "child_process";
import { ref } from "vue";
import type { IFeatureCommand, IPluginIcon } from '@talex-touch/utils/plugin';
import { handleItemData } from './search-core';

export const apps = ref([]);
export const features = ref<any[]>([])

export const enum BoxMode {
  INPUT,
  COMMAND,
  IMAGE,
  FILE,
  FEATURE,
}

setTimeout(initialize, 200)

const searchList: any = [apps, features];

function initialize() {
  refreshSearchList()

  touchChannel.regChannel("core-box-updated:features", () => {
    features.value = touchChannel.sendSync("core-box-get:features");

    console.log('[Feature] Features updated.')
  })

  console.log('search box all', features, apps)
}

export function refreshSearchList() {
  apps.value = touchChannel.sendSync("core-box-get:apps");
  features.value = touchChannel.sendSync("core-box-get:features");
}

export const appAmo: any = JSON.parse(
  localStorage.getItem("app-count") || "{}"
);

export function execute(item: any, query: any = '') {
  if (!item) return

  appAmo[item.name] = (appAmo[item.name] || 0) + 1;
  localStorage.setItem("app-count", JSON.stringify(appAmo));

  console.log("execute", item, query);

  const { type, action, pluginType, value } = item;
  if (type === 'app') {
    touchChannel.sendSync("core-box:hide");

    cprocess.exec(action);
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

export interface SearchItem {
  "name": string,
  "desc": string,
  "icon": IPluginIcon
  "push": boolean,
  "commands"?: IFeatureCommand[]
  "names": string[]
  "keyWords": string[],
  "pluginType": string,
  "type": string,
  "value": string
  amo?: number
  [key: string]: any
}

export interface SearchOptions {
  mode: BoxMode
}

export function search(keyword: string, options: SearchOptions, info: any, callback: (res: SearchItem) => void) {
  refreshSearchList()

  const results = [];

  console.debug("[CoreBox] Searching " + keyword, searchList);

  if (options.mode === BoxMode.FEATURE) {
    touchChannel.send("trigger-plugin-feature-input-changed", {
      query: keyword,
      plugin: info?.plugin,
      feature: JSON.parse(JSON.stringify(info?.feature)),
    })
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

  // console.log("[CoreBox] Searched " + keyword, results);
}
