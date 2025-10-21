/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.NODE_ENV = 'production';

console.log('Building macOS application...');

// 预检查
console.log('Pre-check: Verifying dependencies...');
const electronPath = path.join(projectRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
if (!fs.existsSync(electronPath)) {
  console.error('Electron not found. Please run: npm install');
  process.exit(1);
}
console.log('✓ Electron found');

try {
  console.log('Step 1: Building application...');
  execSync('npm run build', { stdio: 'inherit' });

  require(path.join(__dirname, 'prepare-out-package-json.js'));

  const distDir = path.join(projectRoot, 'dist');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log('Cleaned previous build artifacts');
  }

  console.log('Step 2: Using alternative build approach...');

  // 尝试使用更简单的配置，避免重命名问题
  const tempConfigPath = path.join(projectRoot, 'electron-builder-temp.yml');
  const tempConfig = `appId: com.tagzxia.app.talex-touch
productName: talex-touch
asar: false
compression: normal
directories:
  app: out
  buildResources: build
  output: dist
files:
  - '**/*'
  - '!**/.DS_Store'
  - '!**/.vscode/**'
  - '!src/**'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'

mac:
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    - NSCameraUsageDescription: Application requests access to the device's camera.
    - NSMicrophoneUsageDescription: Application requests access to the device's microphone.
    - NSDocumentsFolderUsageDescription: Application requests access to the user's Documents folder.
    - NSDownloadsFolderUsageDescription: Application requests access to the user's Downloads folder.
  notarize: false
  sign: false
  gatekeeperAssess: false
  target:
    - target: zip
      arch: [arm64]
  icon: build/icon.icns
  category: public.app-category.productivity
  forceCodeSigning: false
  identity: null
  hardenedRuntime: false
  artifactName: \${name}-\${version}-\${arch}.\${ext}

npmRebuild: false
forceCodeSigning: false`;

  fs.writeFileSync(tempConfigPath, tempConfig);

  try {
    execSync(`electron-builder --mac --config ${tempConfigPath}`, {
      stdio: 'inherit'
    });

    // 构建成功后，手动重命名可执行文件
    console.log('Step 3: Renaming executable...');
    const buildOutputPath = path.join(projectRoot, 'dist/mac-arm64');
    const electronAppPath = path.join(buildOutputPath, 'Electron.app');
    const macosPath = path.join(electronAppPath, 'Contents/MacOS');
    const electronPath = path.join(macosPath, 'Electron');
    const talexTouchPath = path.join(macosPath, 'talex-touch');

    if (fs.existsSync(electronPath)) {
      fs.renameSync(electronPath, talexTouchPath);
      console.log('Successfully renamed Electron to talex-touch');
    } else {
      console.log('Electron executable not found, but build may have succeeded');
    }

  } catch (error) {
    console.log('Alternative config failed, trying with --dir...');

    try {
      execSync(`electron-builder --mac --dir --config ${tempConfigPath}`, {
        stdio: 'inherit'
      });

      // 即使使用 --dir，也尝试重命名
      const buildOutputPath = path.join(projectRoot, 'dist/mac-arm64');
      const electronAppPath = path.join(buildOutputPath, 'Electron.app');
      const macosPath = path.join(electronAppPath, 'Contents/MacOS');
      const electronPath = path.join(macosPath, 'Electron');
      const talexTouchPath = path.join(macosPath, 'talex-touch');

      if (fs.existsSync(electronPath)) {
        fs.renameSync(electronPath, talexTouchPath);
        console.log('Successfully renamed Electron to talex-touch');
      }

    } catch (secondError) {
      console.log('All approaches failed');
      throw secondError;
    }
  } finally {
    // 清理临时配置文件
    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  }

  console.log('macOS build completed successfully');

} catch (error) {
  console.error('Build failed:', error.message);
  console.error('Error details:', error);

  // 清理可能损坏的构建文件
  const distDir = path.join(projectRoot, 'dist');
  if (fs.existsSync(distDir)) {
    console.log('Cleaning up build artifacts...');
    try {
      fs.rmSync(distDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn('Failed to clean up build artifacts:', cleanupError.message);
    }
  }

  process.exit(1);
}
