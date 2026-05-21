import fs from 'fs-extra'
import path from 'pathe'

export const PRELUDE_OUTPUT_FILE = 'index.js'
export const DEFAULT_PRELUDE_DIR = 'src/prelude'
export const LEGACY_INDEX_DIR = 'index'
export const PRELUDE_ENTRY_FILES = ['main.ts', 'main.js', 'index.ts', 'index.js'] as const
export const DEFAULT_PRELUDE_EXTERNAL = ['electron', 'node:*']

export interface PreludeBuildConfig {
  entry: string
  format?: 'cjs' | 'esm'
  target?: string
  external?: string[]
  minify?: boolean
  sourcemap?: boolean
  source: 'manifest-prelude' | 'manifest-index' | 'src-prelude' | 'legacy-index'
}

export type PreludeConfigOverride = Partial<
  Omit<PreludeBuildConfig, 'entry' | 'source'> & { entry: string }
>

export interface PreludeResolveOptions {
  root: string
  sourceDir: string
  indexDir: string
  external?: string[]
  minify?: boolean
  sourcemap?: boolean
}

interface PreludeManifestConfig {
  build?: {
    prelude?: unknown
    index?: unknown
  }
}

export function normalizePreludeConfig(
  source: unknown,
  label: string,
): PreludeConfigOverride | null {
  if (!source || typeof source !== 'object')
    return null

  const config = source as Record<string, unknown>
  const result: PreludeConfigOverride = {}

  if ('entry' in config) {
    if (typeof config.entry !== 'string')
      throw new Error(`${label}.entry must be a string`)
    result.entry = config.entry
  }

  if ('format' in config) {
    if (config.format !== 'cjs' && config.format !== 'esm')
      throw new Error(`${label}.format must be 'cjs' or 'esm'`)
    result.format = config.format
  }

  if ('target' in config) {
    if (typeof config.target !== 'string')
      throw new Error(`${label}.target must be a string`)
    result.target = config.target
  }

  if ('external' in config) {
    if (!Array.isArray(config.external) || config.external.some(item => typeof item !== 'string'))
      throw new Error(`${label}.external must be a string array`)
    result.external = config.external as string[]
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

export function findPreludeEntry(preludeDirPath: string): string | null {
  if (!fs.existsSync(preludeDirPath))
    return null

  for (const file of PRELUDE_ENTRY_FILES) {
    const entryPath = path.join(preludeDirPath, file)
    if (fs.existsSync(entryPath))
      return entryPath
  }

  return null
}

export function resolvePreludeDir(root: string, sourceDir = 'src'): string {
  return path.resolve(root, sourceDir, 'prelude')
}

export function getPreludeConfigFromManifest(
  manifest: PreludeManifestConfig | null | undefined,
): {
  config: PreludeConfigOverride | null
  source: 'manifest-prelude' | 'manifest-index' | null
} {
  const preludeConfig = normalizePreludeConfig(manifest?.build?.prelude, 'manifest.build.prelude')
  if (preludeConfig)
    return { config: preludeConfig, source: 'manifest-prelude' }

  const indexConfig = normalizePreludeConfig(manifest?.build?.index, 'manifest.build.index')
  if (indexConfig)
    return { config: indexConfig, source: 'manifest-index' }

  return { config: null, source: null }
}

export function resolvePreludeBundleConfig(
  opts: PreludeResolveOptions,
  manifest: PreludeManifestConfig | null | undefined,
): PreludeBuildConfig | null {
  const rootIndexPath = path.resolve(opts.root, PRELUDE_OUTPUT_FILE)
  const preludeDirPath = resolvePreludeDir(opts.root, opts.sourceDir)
  const legacyIndexDirPath = path.resolve(opts.root, opts.indexDir)
  const manifestConfig = getPreludeConfigFromManifest(manifest)

  if (manifestConfig.config && manifestConfig.source) {
    const config = manifestConfig.config
    const defaultDir =
      manifestConfig.source === 'manifest-prelude' ? preludeDirPath : legacyIndexDirPath
    const entryPath = config.entry ? path.resolve(opts.root, config.entry) : findPreludeEntry(defaultDir)

    if (!entryPath || !fs.existsSync(entryPath)) {
      const displayPath =
        config.entry ||
        (manifestConfig.source === 'manifest-prelude'
          ? `${opts.sourceDir}/prelude/(main|index).[jt]s`
          : `${opts.indexDir}/(main|index).[jt]s`)
      throw new Error(
        `${manifestConfig.source === 'manifest-prelude' ? 'manifest.build.prelude' : 'manifest.build.index'}.entry not found: ${displayPath}`,
      )
    }

    return {
      entry: entryPath,
      format: config.format ?? 'cjs',
      target: config.target ?? 'node18',
      external: config.external ?? opts.external ?? DEFAULT_PRELUDE_EXTERNAL,
      minify: config.minify ?? opts.minify,
      sourcemap: config.sourcemap ?? opts.sourcemap,
      source: manifestConfig.source,
    }
  }

  if (fs.existsSync(rootIndexPath))
    return null

  const preludeEntry = findPreludeEntry(preludeDirPath)
  if (preludeEntry) {
    return {
      entry: preludeEntry,
      format: 'cjs',
      target: 'node18',
      external: opts.external ?? DEFAULT_PRELUDE_EXTERNAL,
      minify: opts.minify,
      sourcemap: opts.sourcemap,
      source: 'src-prelude',
    }
  }

  const legacyEntry = findPreludeEntry(legacyIndexDirPath)
  if (legacyEntry) {
    return {
      entry: legacyEntry,
      format: 'cjs',
      target: 'node18',
      external: opts.external ?? DEFAULT_PRELUDE_EXTERNAL,
      minify: opts.minify,
      sourcemap: opts.sourcemap,
      source: 'legacy-index',
    }
  }

  return null
}

export function createPreludeAlias(entryPath: string): Record<string, string> {
  const sourceDir = path.dirname(entryPath)
  return {
    '@': sourceDir,
    '~': sourceDir,
  }
}

export function toProjectRelative(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, '/')
}
