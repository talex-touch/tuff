import { touchChannel } from "~/modules/channel/channel-core";
import PinyinMatch from "pinyin-match";
import cprocess from "child_process";
import { ref } from "vue";

export const apps = ref([]);

(() => {
  if (document.body.classList.contains("core-box"))
    apps.value = touchChannel.sendSync("core-box-get:apps");

})();

const searchList: any = [apps];

function check(keyword: string, appName: string) {
  let res = PinyinMatch.match(appName, keyword);

  // if (res !== false) return res

  return res;
  // return PinyinMatchTw.match(appName, keyword)
}

export const appAmo: any = JSON.parse(
  localStorage.getItem("app-count") || "{}"
);

export function execute(item: any) {
  appAmo[item.name] = (appAmo[item.name] || 0) + 1;
  localStorage.setItem("app-count", JSON.stringify(appAmo));

  const { action } = item;
  cprocess.execSync(action);
  console.log("execute", item);
}

export function search(keyword: string, callback: (res: Array<any>) => void) {
  const results = [];

  console.log("[CoreBox] Searching " + keyword);

  for (let searchSection of searchList) {
    const data = [...searchSection.value];

    for (let item of data) {
      console.log("search", item)
      const [matchedName, matchedDesc, matchedAbridge] = [
        check(keyword, item.name),
        check(keyword, item.desc),
        check(keyword, item.keyWords.at(-1)),
      ];

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

  console.log("[CoreBox] Searched " + keyword, results);
}
