/* eslint-disable no-console */
import process from 'node:process'
import path from 'pathe'
import fs from 'fs-extra'
import cliProgress from 'cli-progress'
import { globSync } from 'glob'
import * as readline from 'node:readline'
import { CompressLimit, TalexCompress } from './compress-util'
import { generateFilesSha256, generateSignature } from './security-util'
import type { Options } from '../types'

// Default configuration
const DEFAULT_OPTIONS: Required<Omit<Options, 'assets' | 'versionSync' | 'manifestPath'>> & Pick<Options, 'assets' | 'versionSync'> = {
  root: process.cwd(),
  manifest: './manifest.json',
  outDir: 'dist',
  sourceDir: 'src',
  widgetsDir: 'widgets',
  publicDir: 'public',
  indexDir: 'index',
  sourcemap: false,
  minify: true,
  external: ['electron'],
  maxSizeMB: 10,
  assets: undefined,
  versionSync: undefined,
}

interface IndexBuildConfig {
  entry: string
  format?: 'cjs' | 'esm'
  target?: string
  external?: string[]
  minify?: boolean
  sourcemap?: boolean
}

/**
 * Resolve options with defaults
 */
function resolveOptions(options?: Options): Required<Omit<Options, 'assets' | 'versionSync' | 'manifestPath'>> & Pick<Options, 'assets' | 'versionSync'> {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
    // Handle deprecated manifestPath
    manifest: options?.manifest || options?.manifestPath || DEFAULT_OPTIONS.manifest,
  }
}

/**
 * Prompt user for confirmation
 */
async function promptConfirm(question: string, defaultValue = true): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    const hint = defaultValue ? 'Y/n' : 'y/N'
    rl.question(`${question} (${hint}) `, (answer) => {
      rl.close()
      const value = answer.trim().toLowerCase()
      if (value === '') {
        resolve(defaultValue)
      } else {
        resolve(value === 'y' || value === 'yes')
      }
    })
  })
}

/**
 * Check and sync version from package.json to manifest.json
 */
async function checkVersionSync(
  opts: ReturnType<typeof resolveOptions>,
  chalk: any
): Promise<{ synced: boolean; version?: string }> {
  const packageJsonPath = path.join(opts.root, 'package.json')
  const manifestPath = path.join(opts.root, opts.manifest)

  if (!fs.existsSync(packageJsonPath)) {
    return { synced: false }
  }

  if (!fs.existsSync(manifestPath)) {
    return { synced: false }
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

  const pkgVersion = packageJson.version
  const manifestVersion = manifest.version

  if (!pkgVersion) {
    return { synced: false }
  }

  if (pkgVersion === manifestVersion) {
    return { synced: false }
  }

  // Versions differ
  console.log('')
  console.info(
    chalk.bgYellow.black(' VERSION MISMATCH ') +
    chalk.yellow(` package.json: ${pkgVersion} ≠ manifest.json: ${manifestVersion}`)
  )

  const versionSync = opts.versionSync
  let shouldSync = false

  if (versionSync?.enabled) {
    if (versionSync.auto) {
      shouldSync = true
      console.info(chalk.cyan('  → Auto-syncing version from package.json'))
    } else {
      shouldSync = await promptConfirm(
        chalk.cyan('  → Sync version from package.json to manifest.json?'),
        true
      )
    }
  } else {
    // Not enabled, just inform
    console.info(
      chalk.gray('  → Use --sync-version or set versionSync.enabled to auto-sync')
    )
    return { synced: false }
  }

  if (shouldSync) {
    manifest.version = pkgVersion
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    console.info(
      chalk.bgGreen.black(' SYNCED ') +
      chalk.green(` manifest.json version updated to ${pkgVersion}`)
    )
    return { synced: true, version: pkgVersion }
  }

  return { synced: false }
}

/**
 * Check plugin size and warn if exceeds limit
 */
function checkPluginSize(tpexPath: string, maxSizeMB: number, chalk: any): void {
  const stats = fs.statSync(tpexPath)
  const sizeMB = stats.size / (1024 * 1024)

  if (sizeMB > maxSizeMB) {
    console.log('')
    console.warn(
      chalk.bgYellow.black(' WARNING ') +
      chalk.yellow(` Plugin size (${sizeMB.toFixed(2)} MB) exceeds ${maxSizeMB} MB limit!`)
    )
    console.warn(chalk.yellow('  → Consider optimizing assets or splitting into smaller plugins'))
    console.warn(chalk.yellow('  → Large plugins may be rejected by the plugin store'))
    console.log('')
  } else {
    console.info(
      chalk.bgBlack.white(' Talex-Touch ') +
      chalk.gray(` Plugin size: ${sizeMB.toFixed(2)} MB`)
    )
  }
}

/**
 * Detect index/ folder and find entry point
 */
async function detectIndexFolder(indexDir: string, opts: ReturnType<typeof resolveOptions>): Promise<IndexBuildConfig | null> {
  const indexDirPath = path.resolve(opts.root, indexDir)
  
  if (!fs.existsSync(indexDirPath)) {
    return null
  }
  
  const entryFiles = ['main.ts', 'main.js', 'index.ts', 'index.js']
  for (const file of entryFiles) {
    const entryPath = path.join(indexDirPath, file)
    if (fs.existsSync(entryPath)) {
      return {
        entry: entryPath,
        format: 'cjs',
        target: 'node18',
        external: opts.external,
        minify: opts.minify,
        sourcemap: opts.sourcemap
      }
    }
  }
  
  return null
}

/**
 * Bundle index/ folder into a single index.js using esbuild
 */
async function bundleIndexFolder(
  config: IndexBuildConfig,
  buildDir: string,
  manifest: { name: string; version: string },
  chalk: any
): Promise<boolean> {
  try {
    const esbuild = await import('esbuild')
    
    console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.blueBright(' Bundling index/ folder with esbuild...'))
    
    const startTime = Date.now()
    const result = await esbuild.build({
      entryPoints: [config.entry],
      bundle: true,
      format: config.format || 'cjs',
      target: config.target || 'node18',
      platform: 'node',
      outfile: path.join(buildDir, 'index.js'),
      external: config.external || ['electron'],
      minify: config.minify ?? true,
      sourcemap: config.sourcemap ?? false,
      define: {
        '__PLUGIN_NAME__': JSON.stringify(manifest.name),
        '__PLUGIN_VERSION__': JSON.stringify(manifest.version),
      },
      alias: {
        '@': path.resolve('index'),
        '~': path.resolve('index'),
      },
      logLevel: 'warning',
    })
    
    const duration = Date.now() - startTime
    
    if (result.errors.length > 0) {
      console.error(chalk.bgRed.white(' ERROR ') + chalk.red(' Index folder bundling failed:'))
      result.errors.forEach(err => console.error(chalk.red(`  - ${err.text}`)))
      return false
    }
    
    const outputPath = path.join(buildDir, 'index.js')
    const stats = fs.statSync(outputPath)
    const sizeKb = (stats.size / 1024).toFixed(1)
    
    console.info(
      chalk.bgBlack.white(' Talex-Touch ') + 
      chalk.greenBright(` Index folder bundled successfully (${sizeKb}kb) in ${duration}ms`)
    )
    
    return true
  } catch (error: any) {
    console.error(chalk.bgRed.white(' ERROR ') + chalk.red(` Failed to bundle index folder: ${error.message}`))
    return false
  }
}

export async function build(userOptions?: Options) {
  const opts = resolveOptions(userOptions)
  const { default: chalk } = await import('chalk')
  
  const distPath = path.resolve(opts.root, opts.outDir)
  const outDir = path.resolve(opts.root, opts.outDir, 'out')
  const buildDir = path.resolve(opts.root, opts.outDir, 'build')

  console.log('\n\n\n')

  // Check version sync before building
  await checkVersionSync(opts, chalk)

  // 步骤1：备份 Vite 构建产物到 dist/out
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.blueBright(` Backing up Vite build output to ${opts.outDir}/out/...`))

  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  // 移动 dist 下所有文件到 dist/out（排除 out 和 build 目录）
  if (fs.existsSync(distPath)) {
    const distFiles = fs.readdirSync(distPath)
    for (const file of distFiles) {
      if (file !== 'out' && file !== 'build') {
        const sourcePath = path.join(distPath, file)
        const destPath = path.join(outDir, file)
        fs.moveSync(sourcePath, destPath, { overwrite: true })
      }
    }
  }

  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(` Vite output backed up to ${opts.outDir}/out/`))

  // 步骤2：收集文件到 dist/build
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.blueBright(` Collecting files to ${opts.outDir}/build/...`))

  fs.rmSync(buildDir, { recursive: true, force: true })
  fs.mkdirSync(buildDir, { recursive: true })

  // 2.1 复制 Vite 产物
  if (fs.existsSync(outDir)) {
    fs.copySync(outDir, buildDir)
    console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(` Vite output copied to ${opts.outDir}/build/`))
  }

  // 2.2 复制插件文件
  const filesToCopy = [
    { from: opts.widgetsDir, to: 'widgets' },
    { from: 'preload.js', to: 'preload.js' },
    { from: 'README.md', to: 'README.md' },
  ]

  for (const file of filesToCopy) {
    const source = path.resolve(opts.root, file.from)
    const destination = path.join(buildDir, file.to)
    if (fs.existsSync(source)) {
      fs.copySync(source, destination)
      console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.gray(` Copied ${file.from}`))
    }
  }

  // 2.2.1 Handle custom assets copy
  if (opts.assets?.copy && opts.assets.copy.length > 0) {
    console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.blueBright(' Copying custom assets...'))
    for (const pattern of opts.assets.copy) {
      const files = globSync(pattern, { 
        cwd: opts.root, 
        nodir: true,
        ignore: opts.assets.exclude || []
      })
      for (const file of files) {
        const source = path.resolve(opts.root, file)
        const destination = path.join(buildDir, file)
        fs.ensureDirSync(path.dirname(destination))
        fs.copySync(source, destination)
      }
      if (files.length > 0) {
        console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.gray(` Copied ${files.length} files from ${pattern}`))
      }
    }
  }

  // 2.2.2 Handle index.js: either bundle from index/ folder or copy existing file
  const indexConfig = await detectIndexFolder(opts.indexDir, opts)
  if (indexConfig) {
    // Read manifest early for bundling
    const manifestPath = path.resolve(opts.root, opts.manifest)
    const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    
    const bundleSuccess = await bundleIndexFolder(indexConfig, buildDir, manifestData, chalk)
    if (!bundleSuccess) {
      throw new Error('Failed to bundle index/ folder')
    }
  } else {
    // Fallback: copy existing index.js
    const indexSource = path.resolve(opts.root, 'index.js')
    const indexDest = path.join(buildDir, 'index.js')
    if (fs.existsSync(indexSource)) {
      fs.copySync(indexSource, indexDest)
      console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.gray(' Copied index.js'))
    }
  }

  // 2.3 合并 assets 目录（三方合并）
  await mergeAssets(chalk, buildDir, opts)

  // 2.4 生成配置文件
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.blueBright(' Generating manifest.json ...'))

  const manifest = genInit(buildDir, opts)

  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' Manifest.json generated successfully!'))

  // 生成密钥
  const key = genStr(32)
  fs.writeFileSync(path.join(buildDir, 'key.talex'), key)
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' key.talex generated successfully!'))

  // 步骤3：压缩生成 .tpex
  const tpexPath = await compressPlugin(manifest, buildDir, opts, chalk)

  // Check plugin size
  checkPluginSize(tpexPath, opts.maxSizeMB, chalk)

  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(` Export plugin ${manifest.name}-${manifest.version}.tpex successfully!`))
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.cyan(` Output path: ${chalk.yellow(tpexPath)}`))
  console.log('\n\n\n')
}

interface IManifest {
  name: string
  version: string
  description: string
  _files?: Record<string, string>
  _signature?: string
  dev: {
    enable: boolean
    address: string
    source: boolean
  }
  build?: {
    files: string[]
    secret: {
      pos: string
      addon: string[]
    }
    verify?: {
      enable: boolean
      online: 'custom' | 'always' | 'once'
    }
    version?: {
      update: 'auto' | 'ask' | 'readable'
      downgrade: boolean
    }
  }
}

async function mergeAssets(chalk: any, buildDir: string, opts: ReturnType<typeof resolveOptions>) {
  const assetsDir = path.resolve(opts.root, 'assets')
  const srcAssetsDir = path.resolve(opts.root, opts.sourceDir, 'assets')
  const buildAssetsDir = path.join(buildDir, 'assets')

  const assetsExists = fs.existsSync(assetsDir)
  const srcAssetsExists = fs.existsSync(srcAssetsDir)
  const buildAssetsExists = fs.existsSync(buildAssetsDir)

  if (!assetsExists && !srcAssetsExists) {
    // 没有额外的 assets 目录需要合并
    if (buildAssetsExists)
      console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.gray(' Using Vite assets only'))

    return
  }

  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.blueBright(' Merging assets directories...'))

  // 获取所有三个目录的文件列表
  const buildAssets = buildAssetsExists ? globSync('**/*', { cwd: buildAssetsDir, nodir: true }) : []
  const userAssets = assetsExists ? globSync('**/*', { cwd: assetsDir, nodir: true }) : []
  const srcAssets = srcAssetsExists ? globSync('**/*', { cwd: srcAssetsDir, nodir: true }) : []

  // 检测所有冲突（三方冲突检测）
  const conflicts: Array<{ file: string; sources: string[] }> = []

  // 检查 buildAssets 与 userAssets 的冲突
  for (const file of userAssets) {
    if (buildAssets.includes(file)) {
      const existing = conflicts.find(c => c.file === file)
      if (existing)
        existing.sources.push('assets/')
      else
        conflicts.push({ file, sources: [`${opts.outDir}/build/assets/`, 'assets/'] })
    }
  }

  // 检查 buildAssets 与 srcAssets 的冲突
  for (const file of srcAssets) {
    if (buildAssets.includes(file)) {
      const existing = conflicts.find(c => c.file === file)
      if (existing) {
        if (!existing.sources.includes(`${opts.sourceDir}/assets/`))
          existing.sources.push(`${opts.sourceDir}/assets/`)
      }
      else {
        conflicts.push({ file, sources: [`${opts.outDir}/build/assets/`, `${opts.sourceDir}/assets/`] })
      }
    }
  }

  // 检查 userAssets 与 srcAssets 的冲突
  for (const file of srcAssets) {
    if (userAssets.includes(file)) {
      const existing = conflicts.find(c => c.file === file)
      if (existing) {
        if (!existing.sources.includes(`${opts.sourceDir}/assets/`))
          existing.sources.push(`${opts.sourceDir}/assets/`)
      }
      else {
        conflicts.push({ file, sources: ['assets/', `${opts.sourceDir}/assets/`] })
      }
    }
  }

  if (conflicts.length > 0) {
    console.error(chalk.bgRed.white(' ERROR ') + chalk.red(' Assets merge conflict detected:'))
    for (const conflict of conflicts)
      console.error(chalk.red(`  - ${conflict.file} (in: ${conflict.sources.join(', ')})`))

    throw new Error('Assets merge conflict: same file exists in multiple asset directories')
  }

  // 创建 assets 目录（如果不存在）
  if (!buildAssetsExists)
    fs.mkdirSync(buildAssetsDir, { recursive: true })

  // 复制 assets
  if (assetsExists) {
    fs.copySync(assetsDir, buildAssetsDir)
    console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(` Merged assets/ into ${opts.outDir}/build/assets/`))
  }

  // 复制 src/assets
  if (srcAssetsExists) {
    fs.copySync(srcAssetsDir, buildAssetsDir)
    console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(` Merged ${opts.sourceDir}/assets/ into ${opts.outDir}/build/assets/`))
  }

  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' Assets merged successfully!'))
}

function genInit(_buildDir: string, opts: ReturnType<typeof resolveOptions>): IManifest {
  const manifestPath = path.resolve(opts.root, opts.manifest)

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

  if (!manifest.id)
    throw new Error('`id` field is required in manifest.json')

  if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$/.test(manifest.id))
    throw new Error('`id` field must be in the format of `com.xxx.xxx`')

  // manifest.json 会在后续添加签名后再写入，这里只返回解析后的对象
  return manifest as IManifest
}

async function compressPlugin(manifest: IManifest, buildDir: string, opts: ReturnType<typeof resolveOptions>, chalk: any): Promise<string> {
  const buildConfig = manifest.build || {
    files: [],
    secret: {
      pos: 'TalexTouch',
      addon: ['windows', 'darwin', 'linux'],
    },
    version: {
      update: 'auto',
      downgrade: false,
    },
  }

  // Generate file hashes and signature
  const filesInBuild = globSync('**/*', { cwd: buildDir, nodir: true, absolute: true })
  const filesToHash = filesInBuild.filter(file => path.basename(file) !== 'manifest.json' && path.basename(file) !== 'key.talex')

  manifest._files = generateFilesSha256(filesToHash, buildDir)
  manifest._signature = generateSignature(manifest._files)

  manifest.dev = {
    ...manifest.dev,
    enable: false,
    address: '',
    source: false,
  }

  // Write the final manifest with signature
  fs.writeFileSync(path.join(buildDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  buildConfig.files = [buildDir]

  const buildPath = path.resolve(opts.root, opts.outDir, `${manifest.name.replace(/\//g, '-')}-${manifest.version}.tpex`)

  const tCompress = new TalexCompress(buildConfig.files, buildPath)

  const p = new cliProgress.SingleBar({
    format: '{step} | {bar} | {percentage}% | {value}/{total} Chunks',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
  })

  tCompress.on('progress', (bytes: number) => p.update(bytes))
  tCompress.on('stats', (e: any) => {
    if (e.type === 'start') {
      p.start(e.totalFiles, 0, { step: 'Calculating file sizes' })
    }
    else if (e === -1) {
      p.stop()
      p.start(tCompress.totalBytes, 0, { step: 'Compressing files' })
    }
    else if (e.type === 'progress') {
      p.increment()
    }
  })
  tCompress.on('err', (msg: any) => console.error(msg))
  tCompress.on('flush', () => {
    p.stop()
    // 不清理 dist/build 目录，保留用于调试
  })

  tCompress.setLimit(new CompressLimit(0, 0))

  console.log('\n')
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' Start compressing plugin files...'))
  console.log('\n')

  await tCompress.compress()

  return path.resolve(buildPath)
}

function genStr(len: number): string {
  return (Math.random() * 100000).toString(16).slice(-8) + (len > 8 ? genStr(len - 8) : '')
}
