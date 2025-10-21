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

  process.env.BUILD_TYPE = buildType;
  console.log('Running application build (npm run build)...');
  execSync('npm run build', { stdio: 'inherit', env: { ...process.env, BUILD_TYPE: buildType } });

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

  execSync(builderCommand, {
    stdio: 'inherit',
    env: {
      ...process.env,
      BUILD_TYPE: buildType
    }
  });

  console.log('Build completed successfully.');
}

build();
