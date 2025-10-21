/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 清理函数
function cleanupPreviousBuilds() {
  const distDir = path.join(__dirname, '../dist');
  const cacheDir = path.join(__dirname, '../.electron-builder-cache');

  console.log('Cleaning up previous build artifacts...');

  // 清理可能存在的构建产物
  const installerPatterns = [
    '**/*.dmg',
    '**/*.zip',
    '**/mac-unpacked/**',
    '**/*.app'
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
          if (f.endsWith('.dmg') || f.endsWith('.zip')) {
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
}

// 确保输出目录存在
const distDir = path.join(__dirname, '../dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
  console.log('Created dist directory');
}

// 添加路径调试信息
console.log('Script directory:', __dirname);
console.log('Working directory:', process.cwd());
console.log('Dist directory:', distDir);
console.log('Package.json exists:', fs.existsSync(path.join(__dirname, '../package.json')));

// 清理之前的构建产物
cleanupPreviousBuilds();

// 设置构建类型
const buildType = process.env.BUILD_TYPE || 'snapshot';
console.log(`Building ${buildType} version for macOS`);

// 设置环境变量跳过签名
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.ELECTRON_BUILDER_CACHE = path.join(__dirname, '../.electron-builder-cache');
process.env.ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES = 'true';
// 完全禁用签名相关功能
process.env.CSC_LINK = '';
process.env.CSC_KEY_PASSWORD = '';
process.env.APPLE_ID = '';
process.env.APPLE_ID_PASSWORD = '';
process.env.APPLE_TEAM_ID = '';
process.env.FORCE_COLOR = '0';

// 检查构建环境
function checkBuildEnvironment() {
  console.log('Checking build environment...');

  // 检查磁盘空间
  try {
    execSync('df -h', { encoding: 'utf8' });
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

  // 确保目录存在
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 设置权限
  try {
    const testFile = path.join(distDir, 'permission-test.tmp');
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

// 重试构建函数
function retryBuild(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Build attempt ${attempt}/${maxRetries}`);

      if (attempt > 1) {
        console.log('Retrying with cleared cache...');
        // 清理缓存
        const cacheDir = path.join(__dirname, '../.electron-builder-cache');
        if (fs.existsSync(cacheDir)) {
          fs.rmSync(cacheDir, { recursive: true, force: true });
        }
      }

      // 运行构建命令
      const command = `cross-env BUILD_TYPE=${buildType} npm run build && electron-builder --mac`;
      console.log(`Executing: ${command}`);

      // 确保工作目录存在且正确
      const workingDir = path.join(__dirname, '..');
      console.log(`Working directory: ${workingDir}`);
      console.log(`Working directory exists: ${fs.existsSync(workingDir)}`);
      console.log(`Package.json exists: ${fs.existsSync(path.join(workingDir, 'package.json'))}`);

      if (!fs.existsSync(workingDir)) {
        throw new Error(`Working directory does not exist: ${workingDir}`);
      }

      if (!fs.existsSync(path.join(workingDir, 'package.json'))) {
        throw new Error(`Package.json not found in working directory: ${workingDir}`);
      }

      // 分步执行构建命令
      console.log('Step 1: Running npm run build...');
      execSync(`cross-env BUILD_TYPE=${buildType} npm run build`, {
        stdio: 'inherit',
        cwd: workingDir,
        env: {
          ...process.env,
          NODE_ENV: 'production'
        }
      });

      console.log('Step 2: Running electron-builder --mac...');

      // 检查必要的文件是否存在
      const packageJsonPath = path.join(workingDir, 'package.json');
      const electronBuilderConfigPath = path.join(workingDir, 'electron-builder.yml');
      const outDir = path.join(workingDir, 'out');

      console.log('Checking required files:');
      console.log('- package.json exists:', fs.existsSync(packageJsonPath));
      console.log('- electron-builder.yml exists:', fs.existsSync(electronBuilderConfigPath));
      console.log('- out directory exists:', fs.existsSync(outDir));

      if (!fs.existsSync(packageJsonPath)) {
        throw new Error('package.json not found');
      }

      if (!fs.existsSync(electronBuilderConfigPath)) {
        throw new Error('electron-builder.yml not found');
      }

      if (!fs.existsSync(outDir)) {
        throw new Error('out directory not found - build may have failed');
      }

      // 列出 out 目录内容
      console.log('Contents of out directory:');
      try {
        const outContents = fs.readdirSync(outDir);
        outContents.forEach(item => {
          const itemPath = path.join(outDir, item);
          const stats = fs.statSync(itemPath);
          console.log(`  ${item} (${stats.isDirectory() ? 'directory' : 'file'})`);
        });
      } catch (error) {
        console.warn('Could not list out directory contents:', error.message);
      }

      execSync('electron-builder --mac', {
        stdio: 'inherit',
        cwd: workingDir,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          CSC_IDENTITY_AUTO_DISCOVERY: 'false',
          ELECTRON_BUILDER_CACHE: path.join(workingDir, '.electron-builder-cache'),
          ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true',
          ELECTRON_BUILDER_OFFLINE: 'false'
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

  console.log('macOS build completed successfully');

  // 验证构建产物
  const glob = require('glob');
  const foundFiles = glob.sync(path.join(distDir, '*'));
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
    console.error('\n=== macOS Output File Error ===');
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
