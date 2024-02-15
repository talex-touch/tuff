import { execSync } from 'child_process'
import iconv from 'iconv-lite'

const env = process.platform

function getInstalledAppsWindows() {
  try {
    const output = execSync('cmd /c chcp 65001 && reg query HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall /s');
    return iconv.decode(output, 'cp936');
  } catch (error) {
    console.error(`exec error: ${error}`);
    return '';
  }
}

function searchInstalledAppsWindows() {
  return new Promise((resolve, reject) => {
    const output = getInstalledAppsWindows()

    console.log(output)

    // 将输出按换行符分割成数组
    const lines = output.split('\n');
    let appData: any = {};
    const appsInfo = [];

    // 遍历每一行
    lines.forEach(line => {
      // 如果是新的应用程序信息开始
      if (line.startsWith('HKEY_LOCAL_MACHINE')) {
        // 将之前的应用程序信息保存到数组中
        if (Object.keys(appData).length > 0) {
          appsInfo.push(appData);
        }
        // 创建新的应用程序信息对象
        appData = {};
      } else {
        // 如果不是新的应用程序信息开始，则解析键值对并存储到当前应用程序信息对象中
        const parts = line.split(/\s{2,}/);
        if (parts.length === 4) {
          const key = parts[1].trim();
          const value = parts[3].trim();
          appData[key] = {
            value,
            parts
          };
        }
      }
    });

    // 将最后一个应用程序信息对象保存到数组中
    if (Object.keys(appData).length > 0) {
      appsInfo.push(appData);
    }

    resolve(appsInfo)

    // exec('chcp 65001 && reg query HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall /s', { encoding: 'buffer' }, (error, stdout, stderr) => {
    //   if (error || stderr) {
    //     console.error(`exec error: ${error}`);

    //     reject([error, stderr])
    //     return;
    //   }

    //   const utf8Output = iconv.decode(stdout, 'utf8')

    //   console.log(utf8Output)


    // });
  })
}

export default () => {
  if (env === 'win32') {
    let app: any = []
    searchInstalledAppsWindows().then((res: any) => {
      app = res

      console.log('[CoreBox] [AppAddon] Search apps as ' + res.length + ' results.')
      console.log(app.map((item: any) => item['DisplayName']?.value))
    })

    return async (keyword: string) => {
      // search app each item that DisplayName matches keyword
      return await app.filter((item: any) => item['DisplayName']?.value?.includes(keyword))
    }
  }

  return () => []
}