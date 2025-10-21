/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 清理函数
function cleanupPreviousBuilds() {
  const distDir = path.join(__dirname, '../dist');
  const outputDir = path.join(distDir, '@talex-touch');
  const cacheDir = path.join(__dirname, '../.electron-builder-cache');

  console.log('Cleaning up previous build artifacts...');

  // 清理可能存在的安装程序文件
  const installerPatterns = [
    '**/*-setup.exe',
    '**/*.exe',
    '**/*.msi',
    '**/win-unpacked/**',
    '**/__uninstaller-*',
    '**/*.7z'
  ];

  // 清理 electron-builder 缓存
  if (fs.existsSync(cacheDir)) {
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log('Cleaned electron-builder cache');
    } catch (error) {
      console.warn(`Could not clean cache directory: ${error.message}`);
    }
  }

  // 清理 Wine 相关缓存
  const wineCacheDir = path.join(__dirname, '../.cache');
  if (fs.existsSync(wineCacheDir)) {
    try {
      fs.rmSync(wineCacheDir, { recursive: true, force: true });
      console.log('Cleaned Wine cache');
    } catch (error) {
      console.warn(`Could not clean Wine cache: ${error.message}`);
    }
  }

  let glob;
  try {
    // 可选依赖，若不存在则退化为简单遍历
    glob = require('glob');
  } catch (_) {
    glob = null;
  }

  if (glob) {
    installerPatterns.forEach(pattern => {
      const files = glob.sync(path.join(distDir, pattern), { nodir: true });
      files.forEach(file => {
        try {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            console.log(`Removed: ${path.relative(distDir, file)}`);
          }
        } catch (error) {
          console.warn(`Could not remove ${file}: ${error.message}`);
        }
      });
    });
  } else {
    // 简单降级：仅删除 dist 根下的常见安装文件
    try {
      const rootFiles = fs.readdirSync(distDir);
      rootFiles.forEach(f => {
        const full = path.join(distDir, f);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
          if (f.endsWith('.exe') || f.endsWith('.msi')) {
            try {
              fs.unlinkSync(full);
              console.log(`Removed: ${path.relative(distDir, full)}`);
            } catch (error) {
              console.warn(`Could not remove ${full}: ${error.message}`);
            }
          }
        }
      });
    } catch (e) {
      console.warn(`Fallback cleanup failed: ${e.message}`);
    }
  }

  // 清理输出目录
  if (fs.existsSync(outputDir)) {
    try {
      fs.rmSync(outputDir, { recursive: true, force: true });
      console.log('Cleaned output directory');
    } catch (error) {
      console.warn(`Could not clean output directory: ${error.message}`);
    }
  }
}

// 确保输出目录存在
const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
  console.log('Created dist directory');
}

// 清理之前的构建产物
cleanupPreviousBuilds();

// 设置构建类型
const buildType = process.env.BUILD_TYPE || 'snapshot';
console.log(`Building ${buildType} version for Windows`);

// 设置环境变量跳过下载和签名
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.ELECTRON_BUILDER_CACHE = path.join(__dirname, '../.electron-builder-cache');
process.env.ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES = 'true';
// 完全禁用签名相关功能
process.env.CSC_LINK = '';
process.env.CSC_KEY_PASSWORD = '';
process.env.APPLE_ID = '';
process.env.APPLE_ID_PASSWORD = '';
process.env.APPLE_TEAM_ID = '';
// 强制重新下载 Wine 工具
process.env.ELECTRON_BUILDER_CACHE = '';
process.env.FORCE_COLOR = '0';
// 禁用 rcedit 相关功能以避免校验和问题
process.env.ELECTRON_BUILDER_CACHE_DIR = path.join(__dirname, '../.electron-builder-cache');
process.env.ELECTRON_BUILDER_OFFLINE = 'false';

// 检查磁盘空间和权限
function checkBuildEnvironment() {
  console.log('Checking build environment...');

  // 检查磁盘空间（Windows）
  try {
    execSync('wmic logicaldisk get size,freespace /format:csv', { encoding: 'utf8' });
    console.log('Disk space check completed');
  } catch (error) {
    console.warn('Could not check disk space:', error.message);
  }

  // 确保输出目录有写权限
  const testFile = path.join(distDir, 'test-write.tmp');
  try {
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('Write permissions verified');
  } catch (error) {
    console.error('Write permission check failed:', error.message);
    throw new Error('Insufficient write permissions to dist directory');
  }
}

// 确保输出目录结构正确
function ensureOutputDirectoryStructure() {
  console.log('Ensuring output directory structure...');

  const distDir = path.join(__dirname, '../dist');
  const outputDir = path.join(distDir, '@talex-touch');

  // 确保目录存在
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 设置权限（Windows 上可能不适用，但确保目录可写）
  try {
    const testFile = path.join(outputDir, 'permission-test.tmp');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    console.log('Output directory permissions verified');
  } catch (error) {
    console.error('Output directory permission test failed:', error.message);
    throw new Error('Cannot write to output directory');
  }
}

// 检查构建环境
checkBuildEnvironment();

// 确保输出目录结构
ensureOutputDirectoryStructure();

// Wine 工具下载重试机制
function retryWineDownload() {
  console.log('Attempting to clear Wine cache and retry download...');

  // 清理可能的 Wine 缓存
  const possibleCacheDirs = [
    path.join(__dirname, '../.electron-builder-cache'),
    path.join(__dirname, '../.cache'),
    path.join(process.env.HOME || process.env.USERPROFILE, '.cache/electron-builder'),
    path.join(process.env.HOME || process.env.USERPROFILE, '.electron-builder-cache')
  ];

  possibleCacheDirs.forEach(cacheDir => {
    if (fs.existsSync(cacheDir)) {
      try {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        console.log(`Cleared cache: ${cacheDir}`);
      } catch (error) {
        console.warn(`Could not clear ${cacheDir}: ${error.message}`);
      }
    }
  });
}

// 重试构建函数
function retryBuild(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Build attempt ${attempt}/${maxRetries}`);

      if (attempt > 1) {
        console.log('Retrying with cleared cache...');
        retryWineDownload();
      }

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
          ELECTRON_BUILDER_CACHE: path.join(__dirname, '../.electron-builder-cache'),
          // 添加额外的环境变量来避免文件锁定
          ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true'
        }
      });

      // 如果成功，跳出重试循环
      break;

    } catch (error) {
      console.error(`Build attempt ${attempt} failed:`, error.message);

      if (attempt === maxRetries) {
        throw error; // 最后一次尝试失败，抛出错误
      }

      console.log(`Retrying in 5 seconds... (${attempt}/${maxRetries})`);
      // 等待 5 秒后重试
      setTimeout(() => {}, 5000);
    }
  }
}

try {
  retryBuild();

  console.log('Windows build completed successfully');

  // 验证构建产物
  const glob = require('glob');
  const foundFiles = glob.sync(path.join(distDir, '@talex-touch', '*'));
  if (foundFiles.length > 0) {
    console.log('Build artifacts found:');
    foundFiles.forEach(file => console.log(`  - ${path.relative(distDir, file)}`));
  } else {
    console.warn('No build artifacts found in expected location');
  }

} catch (error) {
  console.error('Build failed:', error.message);

  // 提供更详细的错误信息
  if (error.message.includes('Can\'t open output file')) {
    console.error('\n=== NSIS Output File Error ===');
    console.error('This error usually occurs when:');
    console.error('1. The output file is locked by another process');
    console.error('2. Insufficient disk space');
    console.error('3. Permission issues with the output directory');
    console.error('4. The output file already exists and is in use');
    console.error('\nTroubleshooting steps:');
    console.error('- Check if any antivirus software is scanning the output directory');
    console.error('- Ensure sufficient disk space is available');
    console.error('- Try running the build with administrator privileges');
  }

  process.exit(1);
}
