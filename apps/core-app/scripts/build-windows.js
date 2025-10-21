const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 确保输出目录存在
const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
  console.log('Created dist directory');
}

// 设置构建类型
const buildType = process.env.BUILD_TYPE || 'snapshot';
console.log(`Building ${buildType} version for Windows`);

// 设置环境变量跳过下载和签名
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.ELECTRON_BUILDER_CACHE = path.join(__dirname, '../.electron-builder-cache');

try {
  // 运行构建命令
  const command = `cross-env BUILD_TYPE=${buildType} npm run build && electron-builder --win`;
  console.log(`Executing: ${command}`);
  
  execSync(command, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ELECTRON_BUILDER_CACHE: path.join(__dirname, '../.electron-builder-cache')
    }
  });

  console.log('Windows build completed successfully');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
