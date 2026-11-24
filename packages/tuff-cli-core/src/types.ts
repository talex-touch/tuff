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

export type BuildPackageFormat = 'tpex' | 'npm' | 'both'
export type PublishTarget = 'nexus' | 'npm' | 'both'
export type NpmPublishAccess = 'public' | 'restricted'

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

  /**
   * Include experimental widget features in package precompilation.
   * @default false
   */
  includeExperimentalWidgets?: boolean

  /**
   * Package output format(s): `.tpex`, npm package (`dist/npm` + `.tgz`), or both.
   * @default 'tpex'
   */
  format?: BuildPackageFormat

  /**
   * Shorthand to also stage and pack the npm distribution (`dist/npm/` + `.tgz`).
   * @default false
   */
  npm?: boolean
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
   * Publish target registry: Nexus store (default), npm registry, or both.
   * @default 'nexus'
   */
  target?: PublishTarget

  /**
   * Release tag (Nexus tag or npm dist-tag)
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
   * Custom publish API URL (Nexus)
   */
  apiUrl?: string

  /**
   * Custom npm registry URL (for `--target npm` or `--target both`)
   */
  registry?: string

  /**
   * Publish npm package with OIDC provenance (`npm publish --provenance`)
   */
  provenance?: boolean

  /**
   * npm package visibility (`public` or `restricted`)
   * @default 'public'
   */
  access?: NpmPublishAccess

  /**
   * Force non-interactive auth behavior.
   * When true, publish must fail closed instead of attempting browser/device re-auth.
   */
  nonInteractive?: boolean
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
   * Include experimental widget features in package precompilation.
   * @default false
   */
  includeExperimentalWidgets?: boolean

  /**
   * Path to a security scan waiver file.
   *
   * Defaults to `security-waivers.json` in the plugin root when present. Waivers only cover the
   * rules they name for the exact artifact hash they name; everything else still blocks.
   */
  securityWaivers?: string

  /**
   * Package output format(s): `'tpex'`, `'npm'`, or `'both'`.
   * @default 'tpex'
   */
  format?: BuildPackageFormat

  /**
   * Shorthand to also stage and pack the npm distribution (`dist/npm/` + `.tgz`).
   * @default false
   */
  npm?: boolean

  /**
   * Override npm package name when staging `dist/npm/package.json`.
   */
  npmPackageName?: string

  /**
   * npm publish access level for `dist/npm/package.json#publishConfig.access`.
   * @default 'public'
   */
  npmAccess?: NpmPublishAccess

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
