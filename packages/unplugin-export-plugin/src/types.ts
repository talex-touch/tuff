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
export function defineConfig(options: Options): Options {
  return options
}
