/* eslint-disable no-console */
import process from 'node:process'
import path from 'pathe'
import fs from 'fs-extra'
import cliProgress from 'cli-progress'
import { globSync } from 'glob'
import { CompressLimit, TalexCompress } from './compress-util'
import { generateFilesSha256, generateSignature } from './security-util'

export async function build() {
  const { default: chalk } = await import('chalk')
  const distPath = path.resolve('dist')
  const outDir = path.resolve('dist/out')
  const buildDir = path.resolve('dist/build')

  console.log('\n\n\n')

  // 步骤1：备份 Vite 构建产物到 dist/out
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.blueBright(' Backing up Vite build output...'))

  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })

  // 移动 dist 下所有文件到 dist/out（排除 out 和 build 目录）
  const distFiles = fs.readdirSync(distPath)
  for (const file of distFiles) {
    if (file !== 'out' && file !== 'build') {
      const sourcePath = path.join(distPath, file)
      const destPath = path.join(outDir, file)
      fs.moveSync(sourcePath, destPath, { overwrite: true })
    }
  }

  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' Vite output backed up to dist/out/'))

  // 步骤2：收集文件到 dist/build
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.blueBright(' Collecting files to dist/build/...'))

  fs.rmSync(buildDir, { recursive: true, force: true })
  fs.mkdirSync(buildDir, { recursive: true })

  // 2.1 复制 Vite 产物
  fs.copySync(outDir, buildDir)
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' Vite output copied to dist/build/'))

  // 2.2 复制插件文件
  const filesToCopy = [
    { from: 'index.js', to: 'index.js' },
    { from: 'widgets', to: 'widgets' },
    { from: 'preload.js', to: 'preload.js' },
    { from: 'README.md', to: 'README.md' },
  ]

  for (const file of filesToCopy) {
    const source = path.resolve(process.cwd(), file.from)
    const destination = path.join(buildDir, file.to)
    if (fs.existsSync(source)) {
      fs.copySync(source, destination)
      console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.gray(` Copied ${file.from}`))
    }
  }

  // 2.3 合并 assets 目录（三方合并）
  await mergeAssets(chalk, buildDir)

  // 2.4 生成配置文件
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.blueBright(' Generating manifest.json ...'))

  const manifest = genInit(buildDir)

  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' Manifest.json generated successfully!'))

  // 生成密钥
  const key = genStr(32)
  fs.writeFileSync(path.join(buildDir, 'key.talex'), key)
  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' key.talex generated successfully!'))

  // 步骤3：压缩生成 .tpex
  const tpexPath = await compressPlugin(manifest, buildDir, chalk)

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

async function mergeAssets(chalk: any, buildDir: string) {
  const assetsDir = path.resolve('assets')
  const srcAssetsDir = path.resolve('src/assets')
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
        conflicts.push({ file, sources: ['dist/build/assets/', 'assets/'] })
    }
  }

  // 检查 buildAssets 与 srcAssets 的冲突
  for (const file of srcAssets) {
    if (buildAssets.includes(file)) {
      const existing = conflicts.find(c => c.file === file)
      if (existing) {
        if (!existing.sources.includes('src/assets/'))
          existing.sources.push('src/assets/')
      }
      else {
        conflicts.push({ file, sources: ['dist/build/assets/', 'src/assets/'] })
      }
    }
  }

  // 检查 userAssets 与 srcAssets 的冲突
  for (const file of srcAssets) {
    if (userAssets.includes(file)) {
      const existing = conflicts.find(c => c.file === file)
      if (existing) {
        if (!existing.sources.includes('src/assets/'))
          existing.sources.push('src/assets/')
      }
      else {
        conflicts.push({ file, sources: ['assets/', 'src/assets/'] })
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
    console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' Merged assets/ into dist/build/assets/'))
  }

  // 复制 src/assets
  if (srcAssetsExists) {
    fs.copySync(srcAssetsDir, buildAssetsDir)
    console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' Merged src/assets/ into dist/build/assets/'))
  }

  console.info(chalk.bgBlack.white(' Talex-Touch ') + chalk.greenBright(' Assets merged successfully!'))
}

function genInit(_buildDir: string): IManifest {
  const manifestPath = path.resolve(process.cwd(), 'manifest.json')

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

  if (!manifest.id)
    throw new Error('`id` field is required in manifest.json')

  if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$/.test(manifest.id))
    throw new Error('`id` field must be in the format of `com.xxx.xxx`')

  // manifest.json 会在后续添加签名后再写入，这里只返回解析后的对象
  return manifest as IManifest
}

async function compressPlugin(manifest: IManifest, buildDir: string, chalk: any): Promise<string> {
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

  const buildPath = path.resolve('dist', `${manifest.name.replace(/\//g, '-')}-${manifest.version}.tpex`)

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
