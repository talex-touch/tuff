// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import getMacApps from './get-mac-app';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import os from 'os';

/**
 * Get application icon base64 string
 * @param appPath Application path
 * @param appName Application name
 * @returns base64 string or null
 */
async function getApplicationIcon(appPath: string, appName: string): Promise<string | null> {
  const icondir = path.join(os.tmpdir(), 'ProcessIcon');
  const iconPath = path.join(icondir, `${appName}.png`);
  const iconNonePath = path.join(icondir, `${appName}.none`);

  if (fs.existsSync(iconPath)) {
    try {
      const iconBuffer = fs.readFileSync(iconPath);
      return iconBuffer.toString('base64');
    } catch (error) {
      console.warn(`[Darwin] Failed to read cached icon for ${appName}:`, error);
    }
  }

  if (fs.existsSync(iconNonePath)) {
    return null;
  }

  try {
    await getMacApps.app2png(appPath, iconPath);
    const iconBuffer = fs.readFileSync(iconPath);
    return iconBuffer.toString('base64');
  } catch (app2pngError) {
    console.warn(`[Darwin] app2png failed for ${appName}, trying manual extraction`);
  }

  const appFileName = appPath.split('/').pop() || '';
  const extname = path.extname(appFileName);
  const appSubStr = appFileName.split(extname)[0];

  const iconPaths = [
    path.join(appPath, '/Contents/Resources/App.icns'),
    path.join(appPath, '/Contents/Resources/AppIcon.icns'),
    path.join(appPath, `/Contents/Resources/${appSubStr}.icns`),
    path.join(appPath, `/Contents/Resources/${appSubStr.replace(/ /g, '')}.icns`),
    path.join(appPath, `/Contents/Resources/${appSubStr.replace(/[^a-zA-Z0-9]/g, '')}.icns`)
  ];

  let foundIconPath: string | null = null;

  for (const testPath of iconPaths) {
    if (fs.existsSync(testPath)) {
      foundIconPath = testPath;
      break;
    }
  }

  if (!foundIconPath) {
    try {
      const resourcesPath = path.join(appPath, '/Contents/Resources');
      if (fs.existsSync(resourcesPath)) {
        const resourceList = fs.readdirSync(resourcesPath);
        const iconName = resourceList.find(file => path.extname(file) === '.icns');
        if (iconName) {
          foundIconPath = path.join(resourcesPath, iconName);
        }
      }
    } catch (scanError) {
      console.warn(`[Darwin] Failed to scan resources for ${appName}:`, scanError);
    }
  }

  if (!foundIconPath) {
    fs.writeFileSync(iconNonePath, '');
    return null;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      exec(
        `sips -s format png '${foundIconPath}' --out '${iconPath}' --resampleHeightWidth 64 64`,
        (error: any) => {
          error ? reject(error) : resolve();
        }
      );
    });

    const iconBuffer = fs.readFileSync(iconPath);
    return iconBuffer.toString('base64');
  } catch (sipsError) {
    console.warn(`[Darwin] sips conversion failed for ${appName}:`, sipsError);
    fs.writeFileSync(iconNonePath, '');
    return null;
  }
}

export default async () => {
  const icondir = path.join(os.tmpdir(), 'ProcessIcon');
  if (!fs.existsSync(icondir)) {
    fs.mkdirSync(icondir);
  }

  const isZhRegex = /[\u4e00-\u9fa5]/;

  let apps: any = await getMacApps.getApps();

  apps = apps.filter((app: any) => {
    const extname = path.extname(app.path);
    return extname === '.app' || extname === '.prefPane';
  });
  
  let successCount = 0;
  let failCount = 0;

  for (const app of apps) {
    const base64Icon = await getApplicationIcon(app.path, app._name);
    if (base64Icon) {
      const dataUrl = `data:image/png;base64,${base64Icon}`;
      app.icon = {
        type: 'dataurl',
        value: dataUrl,
        _value: `${app._name}.png`
      };
      successCount++;
    } else {
      app.icon = null;
      failCount++;
      console.log(`[Darwin] ❌ ${app._name} - no icon`);
    }
  }

  console.log(`[Darwin] Icon processing complete: ${successCount} success, ${failCount} failed`);

  apps = apps.map((app: any) => {
    const appName: any = app.path.split('/').pop();
    const extname = path.extname(appName);
    const appSubStr = appName.split(extname)[0];
    let fileOptions = {
      ...app,
      type: 'app',
      value: 'plugin',
      desc: app.path,
      pluginType: 'app',
      push: false,
      action: `open ${app.path.replace(/ /g, '\\ ') as string}`,
      keyWords: [appSubStr],
    };

    if (app._name && isZhRegex.test(app._name)) {
      // const [, pinyinArr] = translate(app._name);
      // const firstLatter = pinyinArr.map((py) => py[0]);
      // // 拼音
      // fileOptions.keyWords.push(pinyinArr.join(''));
      // // 缩写
      // fileOptions.keyWords.push(firstLatter.join(''));
      // 中文
      fileOptions.keyWords.push(app._name);
    }

    fileOptions = {
      ...fileOptions,
      name: app._name,
      names: [app._name, appSubStr], // Include both full name and name without extension
    };
    return fileOptions;
  });

  return apps;
};
