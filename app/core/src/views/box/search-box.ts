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

async function initialize() {
  await refreshSearchList()

  touchChannel.regChannel("core-box-updated:features", () => {
    features.value = touchChannel.sendSync("core-box-get:features");

    console.log('[Feature] Features updated.')
  })

  console.log('search box all', features, apps)
}

export async function refreshSearchList() {
  try {
    // 使用异步调用获取 app 数据
    console.log("[SearchBox] Requesting app data from backend...");
    apps.value = await touchChannel.send("core-box-get:apps");
    console.log(`[SearchBox] Received ${apps.value.length} apps from backend`);

    // 检查前几个应用的图标数据
    const appsWithIcons = apps.value.filter(app => app.icon);
    const appsWithoutIcons = apps.value.filter(app => !app.icon);
    console.log(`[SearchBox] Apps with icons: ${appsWithIcons.length}, without icons: ${appsWithoutIcons.length}`);

    if (appsWithIcons.length > 0) {
      console.log("[SearchBox] Sample apps with icons:", appsWithIcons.slice(0, 3).map(app => ({
        name: app.name,
        icon: app.icon
      })));
    }

    features.value = touchChannel.sendSync("core-box-get:features");
  } catch (error) {
    console.error("[SearchBox] Failed to refresh search list:", error);
    // 如果异步调用失败，保持原有数据
  }
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
  console.log(`[Execute Debug] type: ${type}, action: ${action}, pluginType: ${pluginType}`);

  if (type === 'app' || pluginType === 'app') {
    console.log(`[App Launch] Attempting to launch app with action: ${action}`);
    touchChannel.sendSync("core-box:hide");

    cprocess.exec(action, (error, stdout, stderr) => {
      if (error) {
        console.error(`[App Launch] Failed to launch app: ${error.message}`);
        console.error(`[App Launch] Command: ${action}`);
        if (stderr) console.error(`[App Launch] stderr: ${stderr}`);

        if (process.platform === 'darwin' && action.startsWith('open ')) {
          const appPath = action.replace('open ', '').replace(/\\ /g, ' ');
          console.log(`[App Launch] Trying alternative launch method for: ${appPath}`);

          cprocess.exec(`open -a "${appPath}"`, (altError, altStdout, altStderr) => {
            if (altError) {
              console.error(`[App Launch] Alternative launch also failed: ${altError.message}`);
              if (altStderr) console.error(`[App Launch] Alternative stderr: ${altStderr}`);
            } else {
              console.log(`[App Launch] Successfully launched app using alternative method`);
              if (altStdout) console.log(`[App Launch] stdout: ${altStdout}`);
            }
          });
        }
      } else {
        console.log(`[App Launch] Successfully launched app: ${action}`);
        if (stdout) console.log(`[App Launch] stdout: ${stdout}`);
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

export async function search(keyword: string, options: SearchOptions, info: any, callback: (res: SearchItem) => void) {
  await refreshSearchList()

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
