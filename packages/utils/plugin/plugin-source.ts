import type { IManifest } from '@talex-touch/utils/plugin'

/**
 * Interface for plugin download options.
 */
export interface IDownloadOptions {
  /**
   * Timeout configuration for download in milliseconds.
   */
  timeout?: number
  /**
   * List of fallback download URLs.
   */
  fallbackUrls?: string[]
  /**
   * Callback function for download progress, with progress value (0-100).
   */
  onProgress?: (progress: number) => void
}

/**
 * Interface for plugin download results.
 */
export interface IDownloadResult {
  /**
   * Local file path after download, which can be the plugin's compressed package or the unzipped folder path.
   */
  filePath?: string
}

/**
 * Interface for options when resolving a plugin manifest.
 */
export interface IResolveManifestOptions {
  // Add any future resolution options here, e.g., caching strategy, network request configuration.
}

/**
 * Abstract interface for a plugin source. Defines how to resolve and download plugins.
 */
export interface IPluginSource {
  /**
   * Get the name of the plugin source.
   * @returns The name of the plugin source.
   */
  getSourceName: () => string
  /**
   * Get the description of the plugin source.
   * @returns The description of the plugin source.
   */
  getSourceDesc: () => string
  /**
   * Timestamp of the last update for this plugin source.
   */
  lastUpdateTime?: number

  /**
   * Attempts to resolve a plugin manifest from the specified path or URL.
   * If resolution is successful, returns an IManifest; otherwise, returns undefined.
   * The returned result must be a plugin manifest object conforming to the IManifest format.
   * @param sourcePath The root directory path or URL of the plugin.
   * @param options Resolution options.
   * @returns A Promise containing the plugin manifest, or undefined if resolution fails.
   */
  resolveManifest: (sourcePath: string, options?: IResolveManifestOptions) => Promise<IManifest | undefined>

  /**
   * Downloads the plugin source.
   * @param sourceUrl The URL of the plugin source.
   * @param options Download options.
   * @returns A Promise containing the download result. The filePath must be the path to the plugin's compressed package or unzipped folder.
   */
  downloadPlugin: (sourceUrl: string, options?: IDownloadOptions) => Promise<IDownloadResult>
}
