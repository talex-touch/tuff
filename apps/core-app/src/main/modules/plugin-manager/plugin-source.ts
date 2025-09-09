import * as fs from 'fs/promises'
import * as path from 'path'
import { IManifest } from '@talex-touch/utils/plugin'
import { IPluginSource, IDownloadOptions, IDownloadResult, IResolveManifestOptions } from '@talex-touch/utils/plugin/plugin-source'

/**
 * Plugin resolver for the tpex format.
 * Expects to find a `plugin.json` in the plugin's root directory.
 */
export class TpexPluginSource implements IPluginSource {
  /**
   * Get the name of the TPEX plugin source.
   * @returns The name of the plugin source.
   */
  getSourceName(): string {
    return 'TPEX Plugin Source';
  }

  /**
   * Get the description of the TPEX plugin source.
   * @returns The description of the plugin source.
   */
  getSourceDesc(): string {
    return 'Resolves plugins from tpex format (plugin.json)';
  }

  /**
   * Attempts to resolve a TPEX plugin manifest from the specified path.
   * @param pluginPath The root directory path of the plugin.
   * @param options Resolution options.
   * @returns A Promise containing the plugin manifest, or undefined if resolution fails.
   */
  public async resolveManifest(pluginPath: string, options?: IResolveManifestOptions): Promise<IManifest | undefined> {
    const manifestPath = path.join(pluginPath, 'plugin.json')
    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8')
      const manifest: IManifest = JSON.parse(manifestContent)
      console.debug(`[TpexPluginSource] Loaded plugin.json for ${pluginPath}`)
      return manifest
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`[TpexPluginSource] Failed to read plugin.json for ${pluginPath}:`, error.message)
      }
      return undefined
    }
  }

  /**
   * Simulates downloading a TPEX plugin.
   * Since TPEX plugins are typically transferred as a buffer from the frontend, this method returns a simulated local file path.
   * @param sourceUrl The URL of the plugin source.
   * @param options Download options.
   * @returns A Promise containing the download result. The filePath points to a simulated plugin archive path.
   */
  public async downloadPlugin(sourceUrl: string, options?: IDownloadOptions): Promise<IDownloadResult> {
    console.log(`[TpexPluginSource] Simulating download for TPEX plugin from ${sourceUrl}.`)
    const tempFileName = `tpex_plugin_${Date.now()}.zip`; // Simulated archive name
    const tempFilePath = path.join('/tmp', tempFileName); // Simulated temporary save path
    return { filePath: tempFilePath };
  }
}

/**
 * Plugin resolver for the npm format.
 * Expects to find a `package.json` in the plugin's root directory and checks if its `keywords` include 'talex-touch-plugin'.
 */
export class NpmPluginSource implements IPluginSource {
  /**
   * Get the name of the NPM plugin source.
   * @returns The name of the plugin source.
   */
  getSourceName(): string {
    return 'NPM Plugin Source';
  }

  /**
   * Get the description of the NPM plugin source.
   * @returns The description of the plugin source.
   */
  getSourceDesc(): string {
    return 'Resolves plugins from npm packages (package.json with "talex-touch-plugin" keyword)';
  }

  /**
   * Attempts to resolve an NPM plugin manifest from the specified path.
   * @param pluginPath The root directory path of the plugin.
   * @param options Resolution options.
   * @returns A Promise containing the plugin manifest, or undefined if resolution fails.
   */
  public async resolveManifest(pluginPath: string, options?: IResolveManifestOptions): Promise<IManifest | undefined> {
    const packageJsonPath = path.join(pluginPath, 'package.json')
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8')
      const packageJson: any = JSON.parse(packageJsonContent)

      // Check if it's a talex-touch plugin
      const isTalexTouchPlugin = packageJson.keywords && packageJson.keywords.includes('talex-touch-plugin')
      if (!isTalexTouchPlugin) {
        console.debug(`[NpmPluginSource] package.json found but not a talex-touch plugin: ${pluginPath}`)
        return undefined
      }

      // Map package.json to IManifest
      const manifest: IManifest = {
        id: packageJson.name,
        name: packageJson.displayName || packageJson.name,
        version: packageJson.version,
        description: packageJson.description || '',
        author: packageJson.author || '',
        main: packageJson.main || 'index.js', // Default entry file
        icon: packageJson.icon,
        activationKeywords: packageJson.keywords?.filter((kw: string) => kw !== 'talex-touch-plugin') || []
      }
      console.debug(`[NpmPluginSource] Loaded package.json as manifest for ${pluginPath}`)
      return manifest
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`[NpmPluginSource] Failed to read package.json for ${pluginPath}:`, error.message)
      }
      return undefined
    }
  }

  /**
   * Simulates downloading an NPM plugin.
   * This method simulates downloading an npm package (typically a .tgz file) based on the source URL
   * and extracting it to a temporary directory.
   * @param sourceUrl The URL of the plugin source (npm package name or registry URL).
   * @param options Download options.
   * @returns A Promise containing the download result. The filePath points to a simulated plugin folder path.
   */
  public async downloadPlugin(sourceUrl: string, options?: IDownloadOptions): Promise<IDownloadResult> {
    console.log(`[NpmPluginSource] Simulating download for NPM package from ${sourceUrl}.`)
    const npmPackageName = sourceUrl.split('/').pop() || 'npm_plugin';
    const tempDirName = `${npmPackageName}_${Date.now()}`;
    const tempDirPath = path.join('/tmp', tempDirName); // Simulated temporary save directory

    if (options?.onProgress) {
      options.onProgress(0);
      await new Promise(resolve => setTimeout(resolve, 100));
      options.onProgress(50);
      await new Promise(resolve => setTimeout(resolve, 100));
      options.onProgress(100);
    }

    return { filePath: tempDirPath };
  }
}
