import fs from "fs";
import path from "path";
import os from "os";
import { shell } from "electron";

const filePath = path.resolve(
  "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs"
);
const appData = path.join(os.homedir(), "./AppData/Roaming");
const startMenu = path.join(
  appData,
  "Microsoft\\Windows\\Start Menu\\Programs"
);

const isZhRegex = /[\u4e00-\u9fa5]/;
const iconDir = path.join(os.tmpdir(), "ProcessIcon");

async function getIcon(app: any) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fileIcon = (await import("extract-file-icon")).default;
    if (typeof fileIcon !== "function") {
      return;
    }

    const buffer = fileIcon(app.desc, 32);
    const iconPath = path.join(iconDir, `${app.name}.png`);

    fs.exists(iconPath, (exists) => {
      if (!exists) {
        fs.writeFile(iconPath, buffer, "base64", () => {
          //
        });
      }
    });
  } catch (e) {
    console.log(e, app.desc);
  }
}

const fileLists: any = [];
const fileMapper: Record<string, any> = new Map();

export default (): { name: string; path: string; icon: string; bundleId: string }[] => {
  const exists = fs.existsSync(iconDir);
  if (!exists) {
    fs.mkdirSync(iconDir);
  }

  function fileDisplay(filePath: string) {
    fs.readdir(filePath, async function (err, files) {
      if (err) {
        console.warn(err);
      } else {

        for (let fileName of files) {
          const fileDir = path.join(filePath, fileName);

          fs.stat(fileDir, function (eror, stats) {
            if (eror) {
              console.warn("[Win] [CoreBox] [App] Read file stats err: " + fileName, fileDir);
            } else {
              const isFile = stats.isFile(); // 是文件
              const isDir = stats.isDirectory(); // 是文件夹
              if (isFile) {
                const appName = fileName.split(".")[0];
                const keyWords = [appName];
                let appDetail: any = {};
                try {
                  appDetail = shell.readShortcutLink(fileDir);
                } catch (e) {
                  //
                }
                if (
                  !appDetail.target ||
                  appDetail.target.toLowerCase().indexOf("unin") >= 0
                )
                  return;

                // C:/program/cmd.exe => cmd
                keyWords.push(path.basename(appDetail.target, ".exe"));

                if (isZhRegex.test(appName)) {
                  // const [, pinyinArr] = translate(appName);
                  // const zh_firstLatter = pinyinArr.map((py) => py[0]);
                  // // 拼音
                  // keyWords.push(pinyinArr.join(''));
                  // 缩写
                  // keyWords.push(zh_firstLatter.join(''));
                } else {
                  const firstLatter = appName
                    .split(" ")
                    .map((name) => name[0])
                    .join("");
                  keyWords.push(firstLatter);
                }

                const icon = path.join(
                  os.tmpdir(),
                  "ProcessIcon",
                  `${encodeURIComponent(appName)}.png`
                );

                const appInfo = {
                  name: appName,
                  path: appDetail.target,
                  icon,
                  bundleId: '',
                  value: "plugin",
                  desc: appDetail.target,
                  type: "app",
                  pluginType: "app",
                  push: false,
                  action: `start "dummyclient" "${appDetail.target}"`,
                  keyWords: keyWords,
                  names: [appName, ...keyWords], // Include app name and keywords
                };

                if (fileMapper.has(appName)) {
                  const oldApp = fileMapper.get(appName);

                  if (
                    oldApp.value === appInfo.value &&
                    oldApp.desc === appInfo.desc &&
                    oldApp.type === appInfo.type &&
                    oldApp.name === appInfo.name
                  ) {
                    return;
                  }
                }

                fileLists.push(appInfo);
                fileMapper.set(appName, appInfo);
                getIcon(appInfo);
              }
              if (isDir) {
                fileDisplay(fileDir);
              }
            }

          });
        }
      }

    });
  }

  fileDisplay(filePath);
  fileDisplay(startMenu);

  return fileLists;
};
