import { touchChannel } from "~/modules/channel/channel-core";
import PinyinMatch from "pinyin-match";
import cprocess from "child_process";
import { ref } from "vue";
import type { IFeatureCommand, IPluginIcon } from '@talex-touch/utils/plugin';

export const apps = ref([]);
export const features = ref([])

setTimeout(refreshSearchList, 200)

const searchList: any = [apps, features];

function refreshSearchList() {
  apps.value = touchChannel.sendSync("core-box-get:apps");
  features.value = touchChannel.sendSync("core-box-get:features");

  console.log('search box all', features, apps)
}

function check(keyword: string, appName: string) {
  let res = PinyinMatch.match(appName, keyword);

  // if (res !== false) return res

  return res;
  // return PinyinMatchTw.match(appName, keyword)
}

export const appAmo: any = JSON.parse(
  localStorage.getItem("app-count") || "{}"
);

export function execute(item: any, query: any) {
  appAmo[item.name] = (appAmo[item.name] || 0) + 1;
  localStorage.setItem("app-count", JSON.stringify(appAmo));

  console.log("execute", item, query);

  const { type, action, pluginType, value } = item;
  if (type === 'app')
    cprocess.execSync(action);
  else if (type === 'plugin') {
    if (pluginType === 'feature' || pluginType === 'cmd') {
      touchChannel.sendSync("trigger-plugin-feature", {
        query,
        plugin: value,
        feature: JSON.parse(JSON.stringify(item)),
      })

    }
  }

}

interface SearchItem {
  "name": string,
  "desc": string,
  "icon": IPluginIcon
  "push": boolean,
  "commands"?: IFeatureCommand
  "names": string[]
  "keyWords": string[],
  "pluginType": string,
  "type": string,
  "value": string
  amo?: number
  [key: string]: any
}

export function search(keyword: string, callback: (res: SearchItem) => void) {
  const results = [];

  console.log("[CoreBox] Searching " + keyword, searchList);

  for (let searchSection of searchList) {
    const data = [...searchSection.value];

    for (let item of data) {
      const [matchedName, matchedDesc, matchedAbridge] = [
        check(keyword, item.name),
        check(keyword, item.desc),
        check(keyword, item.keyWords.at(-1)),
      ];

      // 如果是 feature 检验 feature commands
      if (item.pluginType === 'feature') {
        for (let cmd of item.commands) {
          const { type, value } = cmd as IFeatureCommand

          const cmdObj: SearchItem = {
            id: item.id,
            name: item.name,
            desc: item.desc,
            icon: item.icon,
            push: true,
            names: [...item.names],
            keyWords: [...item.keyWords],
            pluginType: "cmd",
            type: item.type,
            value: item.value,
            originFeature: item
          }

          function _push() {
            results.push(cmdObj);

            callback(cmdObj);
          }

          // function => todo channel transmission
          if (type === 'match') {
            value === keyword && _push()
          } else if (type === 'regex') {
            const _r = new RegExp(value as string)
            _r.test(keyword) && _push()
          } else if (type === 'contain') {
            ; (keyword.length && (value === "" || keyword.indexOf(value as string) !== -1)) && _push()
          }
        }
      }

      let obj: any;

      if (matchedName !== false) {
        obj = {
          ...item,
          matched: matchedName,
        };
      } else if (matchedDesc !== false) {
        obj = {
          ...item,
          descMatched: true,
          matched: matchedDesc,
        };
      } else if (matchedAbridge !== false) {
        [0]
        obj = {
          ...item,
          abridgeMatched: true,
          matched: matchedAbridge,
        };
      } else {

        continue;
      }

      results.push(obj);

      callback(obj);
    }
  }

  // console.log("[CoreBox] Searched " + keyword, results);
}
