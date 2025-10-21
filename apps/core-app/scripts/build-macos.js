/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

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

  // 3. 清理之前的构建产物
  const distDir = path.join(projectRoot, 'dist');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log('Cleaned previous build artifacts');
  }

  // 4. 运行 electron-builder
  console.log('Step 2: Running electron-builder...');

  try {
    execSync('electron-builder --mac --config electron-builder.yml', { stdio: 'inherit' });
  } catch (error) {
    // 如果构建失败且是因为 Electron 可执行文件缺失，尝试修复
    if (error.message.includes('ENOENT') && error.message.includes('Electron')) {
      console.log('Detected Electron executable missing, attempting to fix...');

      const electronAppPath = path.join(projectRoot, 'dist/mac-arm64/Electron.app/Contents/MacOS');
      const electronSourcePath = path.join(projectRoot, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');

      // 确保目标目录存在
      if (!fs.existsSync(electronAppPath)) {
        fs.mkdirSync(electronAppPath, { recursive: true });
      }

      // 复制 Electron 可执行文件
      if (fs.existsSync(electronSourcePath)) {
        fs.copyFileSync(electronSourcePath, path.join(electronAppPath, 'Electron'));
        console.log('Electron executable copied successfully');

        // 再次尝试构建
        console.log('Retrying electron-builder...');
        execSync('electron-builder --mac --config electron-builder.yml', { stdio: 'inherit' });
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  console.log('macOS build completed successfully');

} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
