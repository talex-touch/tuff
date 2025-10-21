/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 清理函数
function cleanupPreviousBuilds() {
  const distDir = path.join(__dirname, '../dist');
  const outputDir = path.join(distDir, '@talex-touch');

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
      ELECTRON_BUILDER_CACHE: path.join(__dirname, '../.electron-builder-cache'),
      // 添加额外的环境变量来避免文件锁定
      ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true'
    }
  });

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
