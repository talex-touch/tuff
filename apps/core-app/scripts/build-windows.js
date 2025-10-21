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
    '**/win-unpacked/**'
  ];
  
  installerPatterns.forEach(pattern => {
    const glob = require('glob');
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

// 检查磁盘空间和权限
function checkBuildEnvironment() {
  console.log('Checking build environment...');
  
  // 检查磁盘空间（Windows）
  try {
    const { execSync } = require('child_process');
    const freeSpace = execSync('wmic logicaldisk get size,freespace /format:csv', { encoding: 'utf8' });
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

// 检查构建环境
checkBuildEnvironment();

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
      ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true',
      ELECTRON_BUILDER_CACHE: path.join(__dirname, '../.electron-builder-cache')
    }
  });

  console.log('Windows build completed successfully');
  
  // 验证构建产物
  const expectedFiles = [
    path.join(distDir, '@talex-touch', '*.exe'),
    path.join(distDir, '@talex-touch', '*.msi')
  ];
  
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
