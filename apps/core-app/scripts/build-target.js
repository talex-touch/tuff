/* eslint-disable */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
  try {
    execSync(builderCommand, {
      stdio: 'inherit',
      env: {
        ...process.env,
        BUILD_TYPE: buildType
      }
    });
  } catch (error) {
    console.error('\n=== electron-builder failed ===');
    console.error(`Exit code: ${error.status}`);
    console.error(`Signal: ${error.signal}`);
    console.error(`Error message: ${error.message}`);
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
      if (allFiles.length > 0) {
        console.log('Files in dist:');
        allFiles.slice(0, 20).forEach(file => {
          const sizeKB = (file.size / 1024).toFixed(2);
          console.log(`  - ${file.path} (${sizeKB} KB)`);
        });
        if (allFiles.length > 20) {
          console.log(`  ... and ${allFiles.length - 20} more files`);
        }
      }
      
      // Windows 特定检查
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
