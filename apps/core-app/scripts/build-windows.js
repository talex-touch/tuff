const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 设置环境变量
process.env.ELECTRON_BUILDER_CACHE = path.join(__dirname, '../.electron-builder-cache');
process.env.ELECTRON_CACHE = path.join(__dirname, '../.electron-cache');

// 确保缓存目录存在
const cacheDir = process.env.ELECTRON_BUILDER_CACHE;
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
  console.log('Created electron-builder cache directory');
}

// 确保输出目录存在
const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
  console.log('Created dist directory');
}

// 设置构建类型
const buildType = process.env.BUILD_TYPE || 'release';
console.log(`Building ${buildType} version for Windows`);

try {
  // 运行构建命令
  const command = `cross-env BUILD_TYPE=${buildType} npm run build && electron-builder --win`;
  console.log(`Executing: ${command}`);

  execSync(command, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production'
    }
  });

  console.log('Windows build completed successfully');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
