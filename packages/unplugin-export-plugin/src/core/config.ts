import type { BuildConfig, DevConfig, PublishConfig, TuffConfig } from '../types'
import path from 'node:path'
import fs from 'fs-extra'
import { loadConfigFromFile } from 'vite'

const CONFIG_FILES = [
  'tuff.config.ts',
  'tuff.config.js',
  'tuff.config.mjs',
  'tuff.config.cjs',
]

const DEFAULT_BUILD_CONFIG: BuildConfig = {
  outDir: 'dist',
  watch: false,
  minify: true,
  sourcemap: false,
}

const DEFAULT_DEV_CONFIG: DevConfig = {
  open: false,
}

const DEFAULT_PUBLISH_CONFIG: PublishConfig = {}

function applyDefined<T extends Record<string, unknown>>(base: T, overrides: Partial<T>): T {
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined)
      (base as Record<string, unknown>)[key] = value
  }
  return base
}

function normalizeBuildConfig(source: unknown, label: string): BuildConfig {
  if (!source || typeof source !== 'object')
    return {}

  const config = source as Record<string, unknown>
  const result: BuildConfig = {}

  if ('outDir' in config) {
    if (typeof config.outDir !== 'string')
      throw new Error(`${label}.outDir must be a string`)
    result.outDir = config.outDir
  }

  if ('watch' in config) {
    if (typeof config.watch !== 'boolean')
      throw new Error(`${label}.watch must be a boolean`)
    result.watch = config.watch
  }

  if ('minify' in config) {
    if (typeof config.minify !== 'boolean')
      throw new Error(`${label}.minify must be a boolean`)
    result.minify = config.minify
  }

  if ('sourcemap' in config) {
    if (typeof config.sourcemap !== 'boolean')
      throw new Error(`${label}.sourcemap must be a boolean`)
    result.sourcemap = config.sourcemap
  }

  return result
}

function normalizeDevConfig(source: unknown, label: string): DevConfig {
  if (!source || typeof source !== 'object')
    return {}

  const config = source as Record<string, unknown>
  const result: DevConfig = {}

  if ('host' in config) {
    const hostValue = config.host
    if (typeof hostValue !== 'string' && typeof hostValue !== 'boolean')
      throw new Error(`${label}.host must be a string or boolean`)
    result.host = hostValue
  }

  if ('port' in config) {
    if (typeof config.port !== 'number' || Number.isNaN(config.port))
      throw new Error(`${label}.port must be a number`)
    result.port = config.port
  }

  if ('open' in config) {
    if (typeof config.open !== 'boolean')
      throw new Error(`${label}.open must be a boolean`)
    result.open = config.open
  }

  return result
}

function normalizePublishConfig(source: unknown, label: string): PublishConfig {
  if (!source || typeof source !== 'object')
    return {}

  const config = source as Record<string, unknown>
  const result: PublishConfig = {}

  if ('tag' in config) {
    if (typeof config.tag !== 'string')
      throw new Error(`${label}.tag must be a string`)
    result.tag = config.tag
  }

  if ('channel' in config) {
    if (typeof config.channel !== 'string')
      throw new Error(`${label}.channel must be a string`)
    result.channel = config.channel as PublishConfig['channel']
  }

  if ('notes' in config) {
    if (typeof config.notes !== 'string')
      throw new Error(`${label}.notes must be a string`)
    result.notes = config.notes
  }

  if ('apiUrl' in config) {
    if (typeof config.apiUrl !== 'string')
      throw new Error(`${label}.apiUrl must be a string`)
    result.apiUrl = config.apiUrl
  }

  if ('dryRun' in config) {
    if (typeof config.dryRun !== 'boolean')
      throw new Error(`${label}.dryRun must be a boolean`)
    result.dryRun = config.dryRun
  }

  return result
}

async function loadManifestConfig(root: string): Promise<{
  build?: BuildConfig
  dev?: DevConfig
}> {
  const manifestPath = path.join(root, 'manifest.json')
  if (!(await fs.pathExists(manifestPath)))
    return {}

  const manifest = await fs.readJson(manifestPath)
  const buildConfig = normalizeBuildConfig(manifest?.build, 'manifest.build')
  const devConfig: DevConfig = {}

  if (manifest?.dev?.address && typeof manifest.dev.address === 'string') {
    try {
      const url = new URL(manifest.dev.address)
      devConfig.host = url.hostname
      devConfig.port = url.port ? Number(url.port) : undefined
    }
    catch {
      // Ignore invalid dev address
    }
  }

  return {
    build: buildConfig,
    dev: devConfig,
  }
}

export async function loadTuffConfig(root: string): Promise<TuffConfig | null> {
  for (const filename of CONFIG_FILES) {
    const filePath = path.join(root, filename)
    if (!(await fs.pathExists(filePath)))
      continue

    const result = await loadConfigFromFile(
      { command: 'build', mode: 'production' },
      filePath,
    )

    if (!result?.config || typeof result.config !== 'object')
      throw new Error('tuff.config has no default export')

    return result.config as TuffConfig
  }

  return null
}

export async function resolveBuildConfig(root: string, cliOverrides: BuildConfig): Promise<BuildConfig> {
  const manifestConfig = await loadManifestConfig(root)
  const tuffConfig = await loadTuffConfig(root)

  const configBuild = normalizeBuildConfig(tuffConfig?.build, 'tuff.config.build')
  const rootBuild = normalizeBuildConfig(tuffConfig, 'tuff.config')

  const merged = applyDefined({ ...DEFAULT_BUILD_CONFIG }, manifestConfig.build || {})
  applyDefined(merged, rootBuild)
  applyDefined(merged, configBuild)
  applyDefined(merged, cliOverrides)

  return merged
}

export async function resolveDevConfig(root: string, cliOverrides: DevConfig): Promise<DevConfig> {
  const manifestConfig = await loadManifestConfig(root)
  const tuffConfig = await loadTuffConfig(root)

  const configDev = normalizeDevConfig(tuffConfig?.dev, 'tuff.config.dev')

  const merged = applyDefined({ ...DEFAULT_DEV_CONFIG }, manifestConfig.dev || {})
  applyDefined(merged, configDev)
  applyDefined(merged, cliOverrides)

  return merged
}

export async function resolvePublishConfig(root: string, cliOverrides: PublishConfig): Promise<PublishConfig> {
  const tuffConfig = await loadTuffConfig(root)
  const configPublish = normalizePublishConfig(tuffConfig?.publish, 'tuff.config.publish')

  const merged = applyDefined({ ...DEFAULT_PUBLISH_CONFIG }, configPublish)
  applyDefined(merged, cliOverrides)

  return merged
}
