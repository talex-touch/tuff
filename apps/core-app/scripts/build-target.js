/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

function parseArgs(argv) {
  const result = {
    target: process.env.BUILD_TARGET,
    type: process.env.BUILD_TYPE,
    publish: process.env.BUILD_PUBLISH,
    dir: false,
    arch: process.env.BUILD_ARCH
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target' && argv[i + 1]) {
      result.target = argv[++i];
      continue;
    }
    if (arg.startsWith('--target=')) {
      result.target = arg.split('=')[1];
      continue;
    }
    if (arg === '--type' && argv[i + 1]) {
      result.type = argv[++i];
      continue;
    }
    if (arg.startsWith('--type=')) {
      result.type = arg.split('=')[1];
      continue;
    }
    if (arg === '--publish' && argv[i + 1]) {
      result.publish = argv[++i];
      continue;
    }
    if (arg.startsWith('--publish=')) {
      result.publish = arg.split('=')[1];
      continue;
    }
    if (arg === '--arch' && argv[i + 1]) {
      result.arch = argv[++i];
      continue;
    }
    if (arg.startsWith('--arch=')) {
      result.arch = arg.split('=')[1];
      continue;
    }
    if (arg === '--dir') {
      result.dir = true;
    }
  }

  return result;
}

function resolveBuilderBin() {
  const binName = process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder';
  const binPath = path.join(projectRoot, 'node_modules', '.bin', binName);
  if (!fs.existsSync(binPath)) {
    console.error(`Could not find electron-builder binary at ${binPath}`);
    console.error('Please install dependencies first (pnpm i / npm install)');
    process.exit(1);
  }
  return binPath;
}

function build() {
  const { target, type, publish, dir, arch } = parseArgs(process.argv.slice(2));

  if (!target) {
    console.error('Missing build target. Usage: node build-target.js --target=win|mac|linux [--type=snapshot|release]');
    process.exit(1);
  }

  const buildType = (type || 'release').toLowerCase();
  const normalizedTarget = target.toLowerCase();

  const supportedTargets = ['win', 'mac', 'linux'];
  if (!supportedTargets.includes(normalizedTarget)) {
    console.error(`Unsupported build target "${target}". Supported targets: ${supportedTargets.join(', ')}`);
    process.exit(1);
  }

  console.log(`Preparing ${buildType} build for ${normalizedTarget}...`);

  const distDir = path.join(projectRoot, 'dist');
  if (fs.existsSync(distDir)) {
    console.log('Cleaning previous dist directory...');
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  fs.mkdirSync(distDir, { recursive: true });

  if (normalizedTarget === 'linux') {
    fs.mkdirSync(path.join(distDir, '@talex-touch'), { recursive: true });
    fs.mkdirSync(path.join(distDir, '__appImage-x64'), { recursive: true });
    fs.mkdirSync(path.join(distDir, '__deb-x64'), { recursive: true });
  } else if (normalizedTarget === 'win') {
    const winDirs = ['@talex-touch'];
    winDirs.forEach(dirName => {
      fs.mkdirSync(path.join(distDir, dirName), { recursive: true });
    });
  }

  process.env.BUILD_TYPE = buildType;
  console.log('Running application build (npm run build)...');
  // Skip typecheck in snapshot/release builds if SKIP_TYPECHECK is set
  const buildCmd = process.env.SKIP_TYPECHECK === 'true'
    ? 'electron-vite build'
    : 'npm run build';
  execSync(buildCmd, { stdio: 'inherit', env: { ...process.env, BUILD_TYPE: buildType } });

  const outPackageJsonPath = path.join(projectRoot, 'out', 'package.json');
  if (!fs.existsSync(outPackageJsonPath)) {
    require(path.join(__dirname, 'prepare-out-package-json.js'));
  } else {
    console.log('out/package.json already present');
  }

  const builderArgs = [`--${normalizedTarget}`];

  if (normalizedTarget === 'linux' && !arch) {
    builderArgs.push('--x64');
  }

  if (arch) {
    builderArgs.push(`--${arch}`);
  }

  if (dir) {
    builderArgs.push('--dir');
  }

  const publishPolicy = publish || (buildType === 'snapshot' ? 'never' : undefined);
  if (publishPolicy) {
    builderArgs.push(`--publish=${publishPolicy}`);
  }

  const builderCommand = `${resolveBuilderBin()} ${builderArgs.join(' ')}`.trim();
  console.log(`Executing electron-builder: ${builderCommand}`);

  // 检查构建前的 dist 目录状态
  console.log('\n=== Pre-build dist directory check ===');
  if (fs.existsSync(distDir)) {
    const filesBefore = fs.readdirSync(distDir, { withFileTypes: true });
    console.log(`Dist directory exists. Contents: ${filesBefore.length} items`);
    filesBefore.forEach(item => {
      console.log(`  - ${item.name} (${item.isDirectory() ? 'dir' : 'file'})`);
    });
  } else {
    console.log('Dist directory does not exist yet');
  }

  // 检查 out 目录
  const outDir = path.join(projectRoot, 'out');
  if (fs.existsSync(outDir)) {
    const outFiles = fs.readdirSync(outDir, { withFileTypes: true });
    console.log(`Out directory exists. Contents: ${outFiles.length} items`);
  } else {
    console.log('WARNING: Out directory does not exist!');
  }

  console.log('\n=== Running electron-builder ===');
  console.log(`Working directory: ${process.cwd()}`);
  console.log(`Dist directory: ${distDir}`);
  console.log(`Out directory: ${outDir}`);

  const builderBin = resolveBuilderBin();
  console.log(`Using electron-builder: ${builderBin}`);

  let builderExitCode = 0;
  try {
    execSync(builderCommand, {
      stdio: 'inherit',
      env: {
        ...process.env,
        BUILD_TYPE: buildType
      }
    });
    builderExitCode = 0;
    console.log('\n✓ electron-builder completed with exit code 0');

    // 即使退出码为 0，也要检查是否真的生成了文件（防止静默失败）
    console.log('\nVerifying electron-builder actually produced files...');
    if (fs.existsSync(distDir)) {
      const items = fs.readdirSync(distDir, { withFileTypes: true });
      // 过滤掉空目录
      const hasFiles = items.some(item => {
        if (item.isFile()) return true;
        if (item.isDirectory()) {
          try {
            const subItems = fs.readdirSync(path.join(distDir, item.name), { withFileTypes: true });
            return subItems.length > 0;
          } catch {
            return false;
          }
        }
        return false;
      });

      if (!hasFiles && items.length > 0) {
        console.warn('⚠️  WARNING: dist directory only contains empty subdirectories');
        console.warn('  This may indicate electron-builder failed silently');
      } else if (items.length === 0) {
        console.error('❌ ERROR: electron-builder exited with code 0 but produced no files!');
        console.error('  This is a silent failure - electron-builder may have encountered an error');
      }
    }
  } catch (error) {
    builderExitCode = error.status || error.code || 1;
    console.error('\n=== electron-builder failed ===');
    console.error(`Exit code: ${builderExitCode}`);
    console.error(`Signal: ${error.signal}`);
    console.error(`Error message: ${error.message}`);

    // 即使失败，也检查是否有部分输出
    console.log('\nChecking for partial build artifacts despite failure...');
    if (fs.existsSync(distDir)) {
      try {
        const items = fs.readdirSync(distDir, { withFileTypes: true });
        console.log(`Found ${items.length} items in dist after failure`);
        items.forEach(item => {
          console.log(`  - ${item.name} (${item.isDirectory() ? 'dir' : 'file'})`);
        });
      } catch (err) {
        console.error(`Cannot read dist directory: ${err.message}`);
      }
    }

    throw error;
  }

  // 检查构建后的 dist 目录状态
  console.log('\n=== Post-build dist directory check ===');
  if (fs.existsSync(distDir)) {
    // 列出所有文件
    const allFiles = [];
    function listFiles(dir, basePath = '') {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          const relativePath = basePath ? `${basePath}/${item.name}` : item.name;
          if (item.isDirectory()) {
            listFiles(fullPath, relativePath);
          } else {
            try {
              const stat = fs.statSync(fullPath);
              allFiles.push({ path: relativePath, size: stat.size });
            } catch (statErr) {
              console.warn(`Warning: Cannot stat ${relativePath}: ${statErr.message}`);
            }
          }
        }
      } catch (readErr) {
        console.warn(`Warning: Cannot read directory ${basePath || dir}: ${readErr.message}`);
      }
    }

    try {
      listFiles(distDir);
      console.log(`Total files found: ${allFiles.length}`);
      if (allFiles.length === 0) {
        console.error('\n❌ ERROR: Dist directory is empty after electron-builder!');
        console.error('This indicates electron-builder may have failed silently.');
        console.error('\nChecking for electron-builder error patterns...');

        // 检查可能的错误位置
        const possibleErrors = [
          path.join(projectRoot, 'node_modules', '.cache'),
          path.join(projectRoot, '.electron-builder-cache'),
          path.join(os.homedir(), '.cache', 'electron-builder')
        ];
        possibleErrors.forEach(errPath => {
          if (fs.existsSync(errPath)) {
            console.log(`  Found: ${errPath}`);
          }
        });

        // 检查 out 目录是否存在且有内容
        console.error('\nChecking out directory...');
        if (fs.existsSync(outDir)) {
          try {
            const outFiles = fs.readdirSync(outDir, { withFileTypes: true });
            console.log(`  Out directory has ${outFiles.length} items`);
            if (outFiles.length === 0) {
              console.error('  ❌ Out directory is also empty - application build may have failed!');
            }
          } catch (err) {
            console.error(`  Cannot read out directory: ${err.message}`);
          }
        } else {
          console.error('  ❌ Out directory does not exist - application build failed!');
        }

        // 根据平台抛出特定错误
        if (normalizedTarget === 'win') {
          throw new Error('Windows build failed: electron-builder produced no output files');
        } else if (normalizedTarget === 'linux') {
          throw new Error('Linux build failed: electron-builder produced no output files');
        } else {
          throw new Error(`${normalizedTarget} build failed: electron-builder produced no output files`);
        }
      } else {
        console.log('Files in dist:');
        allFiles.slice(0, 20).forEach(file => {
          const sizeKB = (file.size / 1024).toFixed(2);
          console.log(`  - ${file.path} (${sizeKB} KB)`);
        });
        if (allFiles.length > 20) {
          console.log(`  ... and ${allFiles.length - 20} more files`);
        }
      }

      // 平台特定检查
      if (normalizedTarget === 'win') {
        const exeFiles = allFiles.filter(f => f.path.endsWith('.exe'));
        console.log(`\nWindows .exe files found: ${exeFiles.length}`);
        exeFiles.forEach(file => {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
          console.log(`  - ${file.path} (${sizeMB} MB)`);
        });

        if (exeFiles.length === 0) {
          console.error('\nERROR: No .exe files found in dist directory!');
          console.error('electron-builder may have failed silently.');
          throw new Error('Windows build failed: No .exe files generated');
        }
      } else if (normalizedTarget === 'linux') {
        const appImageFiles = allFiles.filter(f => f.path.endsWith('.AppImage') || f.path.includes('.AppImage'));
        const debFiles = allFiles.filter(f => f.path.endsWith('.deb'));
        console.log(`\nLinux artifacts found:`);
        console.log(`  - AppImage files: ${appImageFiles.length}`);
        appImageFiles.forEach(file => {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
          console.log(`    - ${file.path} (${sizeMB} MB)`);
        });
        console.log(`  - Debian package files: ${debFiles.length}`);
        debFiles.forEach(file => {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
          console.log(`    - ${file.path} (${sizeMB} MB)`);
        });

        if (appImageFiles.length === 0 && debFiles.length === 0) {
          console.error('\nERROR: No Linux artifacts (.AppImage or .deb) found in dist directory!');
          console.error('electron-builder may have failed silently.');
          console.error('Checking common output locations...');

          // 检查是否输出到了子目录
          const subDirs = ['__appImage-x64', '__deb-x64', '@talex-touch'];
          subDirs.forEach(subDir => {
            const subPath = path.join(distDir, subDir);
            if (fs.existsSync(subPath)) {
              try {
                const subItems = fs.readdirSync(subPath, { withFileTypes: true });
                console.log(`  ${subDir}: ${subItems.length} items`);
                subItems.slice(0, 5).forEach(item => {
                  console.log(`    - ${item.name} (${item.isDirectory() ? 'dir' : 'file'})`);
                });
              } catch (err) {
                console.log(`  ${subDir}: Cannot read (${err.message})`);
              }
            }
          });

          throw new Error('Linux build failed: No .AppImage or .deb files generated');
        }
      }
    } catch (err) {
      console.error(`Error listing dist files: ${err.message}`);
    }
  } else {
    console.error('ERROR: Dist directory does not exist after build!');
    throw new Error('Dist directory not created by electron-builder');
  }

  console.log('\n✓ Build completed successfully.');
}

build();
