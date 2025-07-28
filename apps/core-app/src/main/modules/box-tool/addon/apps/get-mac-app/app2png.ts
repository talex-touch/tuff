import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import plist from 'simple-plist';

const getIconFile = (appFileInput: string): Promise<string> => {
  return new Promise((resolve, _reject) => {
    const plistPath = path.join(appFileInput, 'Contents', 'Info.plist');

    if (!fs.existsSync(plistPath)) {
      console.warn(`[app2png] Info.plist not found: ${plistPath}`);
      return resolve(
        '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns'
      );
    }

    try {
      const data = plist.readFileSync(plistPath) as any;

      if (!data || !data.CFBundleIconFile) {
        console.warn(`[app2png] No CFBundleIconFile in plist: ${plistPath}`);
        return resolve(
          '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns'
        );
      }

      let iconFileName = data.CFBundleIconFile;

      if (!iconFileName.endsWith('.icns') && !iconFileName.endsWith('.tiff') && !iconFileName.endsWith('.png')) {
        iconFileName = iconFileName + '.icns';
      }

      const iconFile = path.join(
        appFileInput,
        'Contents',
        'Resources',
        iconFileName
      );

      const iconFiles = [
        iconFile,
        iconFile.replace(/\.(icns|tiff|png)$/, '.icns'),
        iconFile.replace(/\.(icns|tiff|png)$/, '.tiff'),
        iconFile.replace(/\.(icns|tiff|png)$/, '.png')
      ];

      const existedIcon = iconFiles.find((iconPath) => {
        return fs.existsSync(iconPath);
      });

      if (existedIcon) {
        resolve(existedIcon);
      } else {
        console.warn(`[app2png] Icon file not found, tried: ${iconFiles.join(', ')}`);
        resolve(
          '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns'
        );
      }
    } catch (error) {
      console.error(`[app2png] Error reading plist ${plistPath}:`, error);
      resolve(
        '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericApplicationIcon.icns'
      );
    }
  });
};

const tiffToPng = (iconFile: string, pngFileOutput: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(iconFile)) {
      const error = new Error(`Input icon file does not exist: ${iconFile}`);
      console.error(`[app2png] ${error.message}`);
      reject(error);
      return;
    }

    const command = `sips -s format png '${iconFile}' --out '${pngFileOutput}' --resampleHeightWidth 64 64`;
    console.debug(`[app2png] Running command: ${command}`);

    exec(command, (error: any, stdout: string, stderr: string) => {
      if (error) {
        console.error(`[app2png] sips conversion failed:`, error.message);
        if (stderr) console.error(`[app2png] stderr:`, stderr);
        reject(error);
      } else {
        console.debug(`[app2png] sips command completed successfully`);
        if (stdout) console.debug(`[app2png] stdout:`, stdout);

        if (fs.existsSync(pngFileOutput)) {
          const stats = fs.statSync(pngFileOutput);
          console.debug(`[app2png] ✅ Successfully created ${pngFileOutput} (${stats.size} bytes)`);
          resolve();
        } else {
          const error = new Error(`Output file was not created: ${pngFileOutput}`);
          console.error(`[app2png] ${error.message}`);
          reject(error);
        }
      }
    });
  });
};

const app2png = async (appFileInput: string, pngFileOutput: string): Promise<void> => {
  try {
    const iconFile = await getIconFile(appFileInput);
    await tiffToPng(iconFile, pngFileOutput);
  } catch (error) {
    console.error(`[app2png] Failed to convert app icon for ${appFileInput}:`, error);
    throw error;
  }
};

export default app2png;
