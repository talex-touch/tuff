export interface AssetsOptions {
  /**
   * Additional files/directories to copy (glob patterns)
   * Example: `['./assets/**\/*', './public/icons/*']`
   */
  copy?: string[]

  /**
   * Files to exclude from copying (glob patterns)
   * Example: `['**\/*.test.ts', '**\/*.spec.js']`
   */
  exclude?: string[]
}

export interface VersionSyncOptions {
  /**
   * Enable version sync from package.json to manifest.json
   * @default false
   */
  enabled?: boolean

  /**
   * Auto sync without prompting
   * @default false
   */
  auto?: boolean
}

export interface BuildConfig {
  /**
   * Output directory for build artifacts
   * @default 'dist'
   */
  outDir?: string

  /**
   * Watch files and rebuild on changes
   * @default false
   */
  watch?: boolean

  /**
   * Minify output
   * @default true (production) / false (development)
   */
  minify?: boolean

  /**
   * Generate source maps
   * @default false
   */
  sourcemap?: boolean
}

export interface DevConfig {
  /**
   * Dev server host
   */
  host?: string | boolean

  /**
   * Dev server port
   */
  port?: number

  /**
   * Open browser on start
   */
  open?: boolean
}

export interface PublishConfig {
  /**
   * Release tag
   */
  tag?: string

  /**
   * Release channel
   */
  channel?: 'RELEASE' | 'BETA' | 'SNAPSHOT'

  /**
   * Changelog/notes
   */
  notes?: string

  /**
   * Dry-run without publishing
   */
  dryRun?: boolean

  /**
   * Custom publish API URL
   */
  apiUrl?: string
}

export interface TuffConfig extends BuildConfig {
  /**
   * Dev server configuration
   */
  dev?: DevConfig

  /**
   * Build configuration
   */
  build?: BuildConfig

  /**
   * Publish configuration
   */
  publish?: PublishConfig
}

export interface Options {
  /**
   * Project root directory
   * @default process.cwd()
   */
  root?: string

  /**
   * Path to manifest.json relative to root
   * @default './manifest.json'
   */
  manifest?: string

  /**
   * Output directory for build artifacts
   * @default 'dist'
   */
  outDir?: string

  /**
   * Source directory to load resources from
   * @default 'src'
   */
  sourceDir?: string

  /**
   * Widgets directory path
   * @default 'widgets'
   */
  widgetsDir?: string

  /**
   * Public/static assets directory
   * @default 'public'
   */
  publicDir?: string

  /**
   * Index folder path (for Prelude script)
   * @default 'index'
   */
  indexDir?: string

  /**
   * Generate source maps
   * @default false
   */
  sourcemap?: boolean

  /**
   * Minify output
   * @default true (production) / false (development)
   */
  minify?: boolean

  /**
   * External dependencies (not bundled)
   * @default ['electron']
   */
  external?: string[]

  /**
   * Asset handling options
   */
  assets?: AssetsOptions

  /**
   * Version sync options (sync version from package.json to manifest.json)
   */
  versionSync?: VersionSyncOptions

  /**
   * Maximum plugin size in MB before warning
   * @default 10
   */
  maxSizeMB?: number

  /**
   * @deprecated Use `manifest` instead
   */
  manifestPath?: string
}

/**
 * Define plugin export configuration with type hints
 */
export function defineConfig(options: TuffConfig): TuffConfig
export function defineConfig(options: Options): Options
export function defineConfig(options: TuffConfig | Options): TuffConfig | Options {
  return options
}
