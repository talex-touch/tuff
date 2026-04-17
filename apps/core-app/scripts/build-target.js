/* eslint-disable */
const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { postProcessMacArtifacts } = require('./build-target/postprocess-mac');
const {
  PACKAGED_RUNTIME_MODULES,
  collectResourceModuleClosure,
  findPackagedResourcesDir: resolvePackagedResourcesDir
} = require('./build-target/runtime-modules');

const projectRoot = path.join(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..', '..');
process.chdir(projectRoot);

function ensureLocalPnpmLockfile() {
  const workspaceLockPath = path.join(workspaceRoot, 'pnpm-lock.yaml');
  const localLockPath = path.join(projectRoot, 'pnpm-lock.yaml');

  if (!fs.existsSync(workspaceLockPath) || fs.existsSync(localLockPath)) {
    return () => {};
  }

  fs.copyFileSync(workspaceLockPath, localLockPath);
  console.log('[build-target] Injected temporary pnpm-lock.yaml for electron-builder');

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      if (fs.existsSync(localLockPath)) {
        fs.rmSync(localLockPath);
        console.log('[build-target] Removed temporary pnpm-lock.yaml');
      }
    } catch (err) {
      console.warn(`[build-target] Failed to clean up temporary pnpm-lock.yaml: ${err.message}`);
    }
  };

  process.once('exit', cleanup);
  process.once('SIGINT', () => {
    cleanup();
    process.exit(1);
  });
  process.once('SIGTERM', () => {
    cleanup();
    process.exit(1);
  });

  return cleanup;
}

/**
 * Detect if version contains beta
 * @param {string} version - Version string (e.g., "2.4.3-beta.9" or "v2.4.3-beta.9")
 * @returns {boolean} True if version contains beta
 */
function isBetaVersion(version) {
  if (!version) return false
  // Remove 'v' prefix if present
  const normalizedVersion = version.replace(/^v/i, '')
  return normalizedVersion.includes('-beta.') || normalizedVersion.includes('-beta')
}

/**
 * Convert beta version to snapshot version format
 * @param {string} version - Beta version string (e.g., "2.4.3-beta.9" or "v2.4.3-beta.9")
 * @returns {string} Snapshot version (e.g., "2.4.3-SNAPSHOT.9")
 * 
 * Note: Windows requires version numbers to start with a digit for FileVersion.
 * Format: X.Y.Z-SNAPSHOT.N (starts with digit, compatible with Windows)
 */
function convertBetaToSnapshotVersion(version) {
  if (!version) return version
  // Remove 'v' prefix if present
  let normalizedVersion = version.replace(/^v/i, '')

  // Match pattern: X.Y.Z-beta.N
  const betaMatch = normalizedVersion.match(/^(\d+\.\d+\.\d+)-beta\.(\d+)$/i)
  if (betaMatch) {
    const [, baseVersion, betaNumber] = betaMatch
    // Windows-compatible format: starts with digit
    return `${baseVersion}-SNAPSHOT.${betaNumber}`
  }

  // Fallback: try to extract base version and beta number
  const parts = normalizedVersion.split('-beta.')
  if (parts.length === 2) {
    const baseVersion = parts[0]
    const betaNumber = parts[1]
    // Windows-compatible format: starts with digit
    return `${baseVersion}-SNAPSHOT.${betaNumber}`
  }

  // If pattern doesn't match, return original
  console.warn(`Warning: Could not parse beta version "${version}", using original`)
  return version
}

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

function verifyNativeOcrModule(strict) {
  const releaseDir = path.join(
    projectRoot,
    'node_modules',
    '@talex-touch',
    'tuff-native',
    'build',
    'Release'
  );
  const modulePath = path.join(releaseDir, 'tuff_native_ocr.node');
  if (fs.existsSync(modulePath)) {
    console.log(`✓ Native OCR module found: ${modulePath}`);
    return;
  }

  let files = [];
  if (fs.existsSync(releaseDir)) {
    try {
      files = fs.readdirSync(releaseDir).filter((name) => name.endsWith('.node'));
    } catch (error) {
      console.warn(`Warning: Failed to inspect native release directory: ${error.message}`);
    }
  }

  if (files.length > 0) {
    console.log(`✓ Native OCR module found: ${path.join(releaseDir, files[0])}`);
    return;
  }

  const message =
    `Native OCR module missing at ${releaseDir}. Please ensure @talex-touch/tuff-native was rebuilt for Electron target.`;

  if (strict) {
    throw new Error(message);
  }

  console.warn(`Warning: ${message}`);
}

function ensureBuildNodeOptions(buildEnv) {
  const defaultHeapSize = process.env.BUILD_HEAP_MB || '6144';
  const hasHeapLimit = /--max-old-space-size(?:=|\s+)\d+/.test(buildEnv.NODE_OPTIONS || '');

  if (!hasHeapLimit) {
    const currentOptions = buildEnv.NODE_OPTIONS || '';
    buildEnv.NODE_OPTIONS = `${currentOptions} --max-old-space-size=${defaultHeapSize}`.trim();
    console.log(`[build-target] Injected NODE_OPTIONS: ${buildEnv.NODE_OPTIONS}`);
  } else {
    console.log(`[build-target] Using NODE_OPTIONS from environment: ${buildEnv.NODE_OPTIONS}`);
  }

  try {
    const heapLimitMb = execFileSync(
      process.execPath,
      [
        '-e',
        'const v8=require("node:v8");process.stdout.write(String(Math.round(v8.getHeapStatistics().heap_size_limit/1024/1024)))'
      ],
      { env: buildEnv, encoding: 'utf8' }
    ).trim();

    if (heapLimitMb) {
      console.log(`[build-target] Effective V8 heap limit: ${heapLimitMb} MB`);
    }
  } catch (error) {
    console.warn(`[build-target] Failed to detect V8 heap limit: ${error.message}`);
  }
}

function findPackagedResourcesDir(distDir) {
  return resolvePackagedResourcesDir(distDir, '[build-target]');
}

function verifyPackagedRuntimeModules(distDir, requiredModules) {
  if (!Array.isArray(requiredModules) || requiredModules.length === 0) {
    return;
  }

  const resourcesDir = findPackagedResourcesDir(distDir);
  if (!resourcesDir) {
    return;
  }

  const asarPath = path.join(resourcesDir, 'app.asar');

  const { listPackage } = require('@electron/asar');
  const packageEntries = new Set(
    listPackage(asarPath).map((entry) => entry.replace(/\\/g, '/'))
  );
  const resolvedModules = new Set();
  const missingModules = [];
  const requiredResourceModules = new Set(collectResourceModuleClosure(requiredModules));

  requiredResourceModules.forEach((moduleName) => {
    const resourceModuleDir = path.join(resourcesDir, 'node_modules', moduleName);
    const resourceEntrypoints = [
      path.join(resourceModuleDir, 'package.json'),
      path.join(resourceModuleDir, 'index.js')
    ];

    if (resourceEntrypoints.some((entryPath) => fs.existsSync(entryPath))) {
      resolvedModules.add(`${moduleName} (resources/node_modules)`);
      return;
    }

    missingModules.push(moduleName);
  });

  requiredModules.forEach((moduleSpec) => {
    const moduleName = typeof moduleSpec === 'string' ? moduleSpec : moduleSpec.name;
    const requireResources = typeof moduleSpec === 'object' && moduleSpec.location === 'resources';
    if (requireResources) {
      return;
    }

    const resourceModuleDir = path.join(resourcesDir, 'node_modules', moduleName);
    const resourceEntrypoints = [
      path.join(resourceModuleDir, 'package.json'),
      path.join(resourceModuleDir, 'index.js')
    ];
    const packagedEntry = path.posix.join('/node_modules', moduleName, 'package.json');

    if (packageEntries.has(packagedEntry)) {
      resolvedModules.add(`${moduleName} (asar)`);
      return;
    }

    if (resourceEntrypoints.some((entryPath) => fs.existsSync(entryPath))) {
      resolvedModules.add(`${moduleName} (resources/node_modules)`);
      return;
    }

    missingModules.push(moduleName);
  });

  if (missingModules.length > 0) {
    throw new Error(
      `Packaged runtime dependencies missing from ${asarPath}: ${Array.from(new Set(missingModules)).join(', ')}`
    );
  }

  console.log(`[build-target] Verified packaged runtime dependencies: ${Array.from(resolvedModules).join(', ')}`);
}

function resolvePluginPreludeNodePaths() {
  const candidates = [
    path.join(projectRoot, 'node_modules'),
    path.join(workspaceRoot, 'node_modules'),
    ...(require.resolve.paths('@talex-touch/utils') || [])
  ];

  return Array.from(
    new Set(
      candidates.filter((value) => typeof value === 'string' && value.length > 0 && fs.existsSync(value))
    )
  );
}

function bundleBuiltinPluginPreludes() {
  const pluginsRoot = path.join(projectRoot, 'tuff', 'modules', 'plugins');
  if (!fs.existsSync(pluginsRoot)) {
    console.log(`[build-target] Built-in plugins directory not found, skip prelude bundling: ${pluginsRoot}`);
    return;
  }

  const { buildSync } = require('esbuild');
  const nodePaths = resolvePluginPreludeNodePaths();
  const pluginDirs = fs
    .readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(pluginsRoot, entry.name));

  let bundledCount = 0;
  let skippedCount = 0;

  for (const pluginDir of pluginDirs) {
    const manifestPath = path.join(pluginDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      skippedCount += 1;
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      throw new Error(`[build-target] Failed to parse manifest: ${manifestPath} (${error.message})`);
    }

    const pluginName = manifest?.name || path.basename(pluginDir);
    const mainRelativePath =
      typeof manifest?.main === 'string' && manifest.main.trim().length > 0
        ? manifest.main.trim()
        : 'index.js';
    const mainEntryPath = path.resolve(pluginDir, mainRelativePath);
    const mainExtension = path.extname(mainEntryPath).toLowerCase();

    if (!fs.existsSync(mainEntryPath)) {
      console.warn(`[build-target] Skip plugin prelude bundling (entry missing): ${pluginName} -> ${mainRelativePath}`);
      skippedCount += 1;
      continue;
    }

    if (!['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts'].includes(mainExtension)) {
      console.warn(`[build-target] Skip plugin prelude bundling (unsupported entry): ${pluginName} -> ${mainRelativePath}`);
      skippedCount += 1;
      continue;
    }

    const tempOutputPath = `${mainEntryPath}.bundle-tmp.cjs`;

    try {
      buildSync({
        entryPoints: [mainEntryPath],
        absWorkingDir: pluginDir,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node18',
        outfile: tempOutputPath,
        external: ['electron'],
        minify: true,
        sourcemap: false,
        logLevel: 'silent',
        nodePaths
      });

      fs.renameSync(tempOutputPath, mainEntryPath);
      bundledCount += 1;
      console.log(`[build-target] Bundled plugin prelude: ${pluginName} -> ${mainRelativePath}`);
    } catch (error) {
      if (fs.existsSync(tempOutputPath)) {
        fs.rmSync(tempOutputPath, { force: true });
      }
      throw new Error(
        `[build-target] Failed to bundle plugin prelude for ${pluginName} (${mainRelativePath}): ${error.message}`
      );
    }
  }

  console.log(
    `[build-target] Plugin prelude bundling completed. bundled=${bundledCount}, skipped=${skippedCount}`
  );
}

function build() {
  const cleanupTempLock = ensureLocalPnpmLockfile();
  console.time('build-target:total');
  try {
    const { target, type, publish, dir, arch } = parseArgs(process.argv.slice(2));
    const skipInstallAppDeps = process.env.SKIP_INSTALL_APP_DEPS === 'true';

  if (!target) {
    console.error('Missing build target. Usage: node build-target.js --target=win|mac|linux [--type=snapshot|release]');
    process.exit(1);
  }

  // Read version from package.json
  const packageJsonPath = path.join(projectRoot, 'package.json');
  let packageVersion = '0.0.0';
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageVersion = packageJson.version || '0.0.0';
    console.log(`Detected version from package.json: ${packageVersion}`);
  } catch (err) {
    console.warn(`Warning: Could not read package.json: ${err.message}`);
  }

  // Auto-detect build type from version if beta
  // Beta versions always use snapshot build, regardless of explicit type
  let finalBuildType = (type || 'release').toLowerCase();
  const runtimeVersion = packageVersion;

  if (isBetaVersion(packageVersion)) {
    console.log(`\n✓ Beta version detected: ${packageVersion}`);
    // Force snapshot build for beta versions
    finalBuildType = 'snapshot';
    console.log(`  → Auto-switching to snapshot build (beta versions always use snapshot)`);
    if (type && type.toLowerCase() !== 'snapshot') {
      console.log(`  → Note: Explicit --type=${type} was overridden for beta version`);
    }
  } else {
    // For non-beta versions, use provided type or default to release
    finalBuildType = (type || 'release').toLowerCase();
  }

  const buildType = finalBuildType;
  const normalizedTarget = target.toLowerCase();

  const supportedTargets = ['win', 'mac', 'linux'];
  if (!supportedTargets.includes(normalizedTarget)) {
    console.error(`Unsupported build target "${target}". Supported targets: ${supportedTargets.join(', ')}`);
    process.exit(1);
  }

  console.log(`Preparing ${buildType} build for ${normalizedTarget}...`);

  let builderVersion = packageVersion;
  if (isBetaVersion(packageVersion) && normalizedTarget === 'win') {
    builderVersion = convertBetaToSnapshotVersion(packageVersion);
    console.log(`  → Windows builder version override: ${packageVersion} → ${builderVersion}`);
  } else if (isBetaVersion(packageVersion)) {
    console.log(`  → Keeping runtime version for ${normalizedTarget}: ${runtimeVersion}`);
  }

  const distDir = path.join(projectRoot, 'dist');
  console.time('build-target:prepare-dist');
  try {
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
  } finally {
    console.timeEnd('build-target:prepare-dist');
  }

  process.env.BUILD_TYPE = buildType;

  // Map target to platform name for downstream tooling
  const platformMap = {
    win: 'win32',
    mac: 'darwin',
    linux: 'linux'
  };
  const electronPlatform = platformMap[normalizedTarget] || normalizedTarget;

  // Determine architecture (default based on target)
  const defaultArch = normalizedTarget === 'mac' ? 'arm64' : 'x64';
  const effectiveArch = arch || defaultArch;

  // Set environment variables for downstream tooling
  process.env.BUILD_TARGET = normalizedTarget;
  process.env.BUILD_ARCH = effectiveArch;
  process.env.ELECTRON_PLATFORM = electronPlatform;
  process.env.ELECTRON_ARCH = effectiveArch;

  // Set APP_VERSION for runtime code paths that should keep the package version.
  process.env.APP_VERSION = runtimeVersion;
  console.log(`Setting APP_VERSION environment variable: ${runtimeVersion}`);

  console.log(`Setting BUILD_TARGET=${normalizedTarget}, BUILD_ARCH=${effectiveArch}, ELECTRON_PLATFORM=${electronPlatform}`);

  console.time('build-target:bundle-plugin-preludes');
  try {
    bundleBuiltinPluginPreludes();
  } finally {
    console.timeEnd('build-target:bundle-plugin-preludes');
  }

  console.log('Running application build (npm run build)...');
  const buildCmd = 'npm run build';

  try {
    console.time('build-target:app-build');
    const buildEnv = {
      ...process.env,
      BUILD_TYPE: buildType,
      BUILD_TARGET: normalizedTarget,
      BUILD_ARCH: effectiveArch,
      ELECTRON_PLATFORM: electronPlatform,
      ELECTRON_ARCH: effectiveArch,
      APP_VERSION: runtimeVersion
    };
    ensureBuildNodeOptions(buildEnv);
    execSync(buildCmd, {
      stdio: 'inherit',
      env: buildEnv
    });
    console.timeEnd('build-target:app-build');
  } catch (error) {
    console.timeEnd('build-target:app-build');
    console.error('\n❌ Application build failed!');
    console.error(`Exit code: ${error.status || error.code}`);
    throw error;
  }

  // 验证 out 目录是否正确生成
  const outDir = path.join(projectRoot, 'out');
  console.log('\n=== Verifying out directory after build ===');

  console.time('build-target:out-verify');
  try {
    if (!fs.existsSync(outDir)) {
      console.error('❌ ERROR: out directory does not exist after build!');
      throw new Error('out directory was not created by electron-vite build');
    }

    // 检查 out 目录的内容
    const outItems = fs.readdirSync(outDir, { withFileTypes: true });
    console.log(`Out directory exists with ${outItems.length} top-level items`);

    if (outItems.length === 0) {
      console.error('❌ ERROR: out directory is empty after build!');
      throw new Error('out directory is empty - electron-vite build may have failed');
    }

    // 检查关键目录是否存在
    const requiredDirs = ['main', 'preload', 'renderer'];
    const missingDirs = [];

    requiredDirs.forEach(dir => {
      const dirPath = path.join(outDir, dir);
      if (!fs.existsSync(dirPath)) {
        missingDirs.push(dir);
      } else {
        const dirItems = fs.readdirSync(dirPath, { withFileTypes: true });
        console.log(`  ✓ ${dir}/: ${dirItems.length} items`);
      }
    });

    if (missingDirs.length > 0) {
      console.error(`❌ ERROR: Missing required directories: ${missingDirs.join(', ')}`);
      throw new Error(`out directory missing required subdirectories: ${missingDirs.join(', ')}`);
    }

    console.log('✓ Out directory verification passed\n');
  } finally {
    console.timeEnd('build-target:out-verify');
  }

  const builderBin = resolveBuilderBin();
  let runtimeModuleSyncSummary = null;

  // 确保关键平台依赖存在于应用 node_modules 中
  try {
    console.time('build-target:ensure-platform-modules');
    const ensureModules = require(path.join(__dirname, 'ensure-platform-modules.js'));
    ensureModules(normalizedTarget, effectiveArch);
    console.log('✓ Platform-specific modules synced to app node_modules\n');
    console.timeEnd('build-target:ensure-platform-modules');
  } catch (err) {
    console.timeEnd('build-target:ensure-platform-modules');
    console.warn(`Warning: Failed to ensure platform modules: ${err.message}`);
  }

  if (skipInstallAppDeps) {
    console.log('Skipping electron-builder install-app-deps step (SKIP_INSTALL_APP_DEPS=true)\n');
    verifyNativeOcrModule(process.env.CI === 'true');
  } else {
    console.log('=== Rebuilding Electron native modules for packaged app ===');
    console.time('build-target:install-app-deps');
    const installPlatformMap = {
      win: 'win32',
      mac: 'darwin',
      linux: 'linux'
    };
    const installPlatform = installPlatformMap[normalizedTarget] || normalizedTarget;
    const effectiveArch =
      arch ||
      (normalizedTarget === 'mac'
        ? 'arm64'
        : 'x64');
    const installAppDepsArgs = ['install-app-deps', `--platform=${installPlatform}`];
    if (effectiveArch) {
      installAppDepsArgs.push(`--arch=${effectiveArch}`);
    }
    const builderBinForShell = process.platform === 'win32' ? `"${builderBin}"` : builderBin;
    const installCommand = `${builderBinForShell} ${installAppDepsArgs.join(' ')}`.trim();

    try {
      execSync(installCommand, {
        stdio: 'inherit',
        env: {
          ...process.env,
          BUILD_TYPE: buildType
        }
      });
      console.log('✓ electron-builder install-app-deps completed\n');
      console.timeEnd('build-target:install-app-deps');
      verifyNativeOcrModule(process.env.CI === 'true');
    } catch (error) {
      console.timeEnd('build-target:install-app-deps');
      console.error('\n❌ electron-builder install-app-deps failed!');
      throw error;
    }
  }

  try {
    console.time('build-target:ensure-runtime-modules');
    const ensureRuntimeModules = require(path.join(__dirname, 'ensure-runtime-modules.js'));
    runtimeModuleSyncSummary = ensureRuntimeModules();
    console.log(
      `✓ Runtime modules synced to app node_modules (${runtimeModuleSyncSummary.resolvedModules.length} modules)\n`
    );
    console.timeEnd('build-target:ensure-runtime-modules');
  } catch (err) {
    console.timeEnd('build-target:ensure-runtime-modules');
    throw err;
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

  if (builderVersion !== packageVersion) {
    builderArgs.push(`--config.extraMetadata.version=${builderVersion}`);
    console.log(`Overriding package version for builder: ${builderVersion}`);
  }

  const macLsuiElementFlag = process.env.TUFF_MAC_LSUIELEMENT || process.env.BUILD_MAC_LSUIELEMENT;
  const enableMacLsuiElement =
    normalizedTarget === 'mac' &&
    typeof macLsuiElementFlag === 'string' &&
    ['1', 'true', 'yes', 'on'].includes(macLsuiElementFlag.toLowerCase());
  if (enableMacLsuiElement) {
    builderArgs.push('--config.mac.extendInfo.LSUIElement=true');
    console.log('[build-target] Enabled macOS LSUIElement via explicit build flag');
  }

  const publishPolicy = publish || (buildType === 'snapshot' ? 'never' : undefined);
  if (publishPolicy) {
    builderArgs.push(`--publish=${publishPolicy}`);
  }

  const builderCommand = `${builderBin} ${builderArgs.join(' ')}`.trim();
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

  // outDir 已经在前面声明了，这里只需要检查即可
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

  console.log(`Using electron-builder: ${builderBin}`);

  let builderExitCode = 0;
  try {
    console.time('build-target:electron-builder');
    execSync(builderCommand, {
      stdio: 'inherit',
      env: {
        ...process.env,
        BUILD_TYPE: buildType
      }
    });
    builderExitCode = 0;
    console.log('\n✓ electron-builder completed with exit code 0');
    console.timeEnd('build-target:electron-builder');

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
    console.timeEnd('build-target:electron-builder');
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
  console.time('build-target:post-check');
  try {
    if (fs.existsSync(distDir)) {
    // 列出所有文件
    const allFiles = [];
    const allDirs = [];
    function listFiles(dir, basePath = '') {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          const relativePath = basePath ? `${basePath}/${item.name}` : item.name;
          if (item.isDirectory()) {
            // Check if it's a .app directory (macOS application bundle)
            if (relativePath.endsWith('.app')) {
              try {
                const stat = fs.statSync(fullPath);
                allDirs.push({ path: relativePath, size: stat.size });
              } catch (statErr) {
                console.warn(`Warning: Cannot stat ${relativePath}: ${statErr.message}`);
              }
            }
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
      } else if (normalizedTarget === 'mac') {
        // Check for both .dmg files and .app directories (dir mode generates .app only)
        const dmgFiles = allFiles.filter(f => f.path.endsWith('.dmg'));
        const appDirs = allDirs.filter(d => d.path.endsWith('.app') && d.path.includes('mac-'));
        console.log(`\nmacOS build artifacts found:`);
        console.log(`  - .dmg files: ${dmgFiles.length}`);
        console.log(`  - .app directories: ${appDirs.length}`);
        if (dmgFiles.length > 0) {
          dmgFiles.forEach(file => {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            console.log(`    - ${file.path} (${sizeMB} MB)`);
          });
        }
        if (appDirs.length > 0) {
          appDirs.forEach(dir => {
            const sizeMB = (dir.size / (1024 * 1024)).toFixed(2);
            console.log(`    - ${dir.path} (${sizeMB} MB)`);
          });
        }
        if (dmgFiles.length === 0 && appDirs.length === 0) {
          console.error('\nERROR: No .dmg or .app files found in dist directory!');
          throw new Error('macOS build failed: No build artifacts generated');
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
      throw err;
    }
    } else {
      console.error('ERROR: Dist directory does not exist after build!');
      throw new Error('Dist directory not created by electron-builder');
    }
  } finally {
    console.timeEnd('build-target:post-check');
  }

  if (normalizedTarget === 'mac') {
    postProcessMacArtifacts(distDir);
  }

  if (runtimeModuleSyncSummary) {
    console.log(
      `[build-target] Runtime module sync summary: resolved=${runtimeModuleSyncSummary.resolvedModules.length}, copied=${runtimeModuleSyncSummary.copiedModules.length}`
    );
  }

  verifyPackagedRuntimeModules(distDir, PACKAGED_RUNTIME_MODULES);

  console.log('\n✓ Build completed successfully.');
  } finally {
    console.timeEnd('build-target:total');
    cleanupTempLock();
  }
}

build();
