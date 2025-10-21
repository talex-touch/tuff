/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 切换到项目根目录
const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

// 设置环境变量
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.NODE_ENV = 'production';

console.log('Building macOS application...');

try {
  // 1. 构建应用
  console.log('Step 1: Building application...');
  execSync('npm run build', { stdio: 'inherit' });

  // 2. 确保 out 目录有正确的 package.json
  const outPackageJsonPath = path.join(projectRoot, 'out/package.json');
  const minimalPackageJson = {
    "name": "@talex-touch/core-app",
    "version": "2.0.0",
    "main": "./main/index.js",
    "author": "TalexDreamSoul",
    "homepage": "https://talex-touch.tagzxia.com"
  };
  fs.writeFileSync(outPackageJsonPath, JSON.stringify(minimalPackageJson, null, 2));

  // 3. 运行 electron-builder
  console.log('Step 2: Running electron-builder...');
  execSync('electron-builder --mac --config electron-builder.yml', { stdio: 'inherit' });

  // 4. 修复 Electron 可执行文件问题（如果存在）
  const electronAppPath = path.join(projectRoot, 'dist/mac-arm64/Electron.app/Contents/MacOS');
  const electronSourcePath = path.join(projectRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

  if (fs.existsSync(electronAppPath) && !fs.existsSync(path.join(electronAppPath, 'Electron'))) {
    if (fs.existsSync(electronSourcePath)) {
      console.log('Fixing missing Electron executable...');
      fs.copyFileSync(electronSourcePath, path.join(electronAppPath, 'Electron'));
      console.log('Electron executable copied successfully');
    }
  }

  console.log('macOS build completed successfully');

} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
