import * as fs from 'fs/promises'
import * as path from 'path'
import { IManifest } from '@talex-touch/utils/plugin' // 注意：这里需要修改为正确的路径
import { IPluginSource } from '@talex-touch/utils/plugin/plugin-source'

/**
 * tpex 格式插件的解析器。
 * 期望在插件根目录找到 plugin.json。
 */
export class TpexPluginSource implements IPluginSource {
  public async resolveManifest(pluginPath: string): Promise<IManifest | undefined> {
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
}

/**
 * npm 格式插件的解析器。
 * 期望在插件根目录找到 package.json，并检查 keywords 是否包含 'talex-touch-plugin'。
 */
export class NpmPluginSource implements IPluginSource {
  public async resolveManifest(pluginPath: string): Promise<IManifest | undefined> {
    const packageJsonPath = path.join(pluginPath, 'package.json')
    try {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8')
      const packageJson: any = JSON.parse(packageJsonContent)

      // 检查是否为 talex-touch 插件
      const isTalexTouchPlugin = packageJson.keywords && packageJson.keywords.includes('talex-touch-plugin')
      if (!isTalexTouchPlugin) {
        console.debug(`[NpmPluginSource] package.json found but not a talex-touch plugin: ${pluginPath}`)
        return undefined
      }

      // 将 package.json 映射到 IManifest
      const manifest: IManifest = {
        id: packageJson.name,
        name: packageJson.displayName || packageJson.name,
        version: packageJson.version,
        description: packageJson.description || '',
        author: packageJson.author || '',
        main: packageJson.main || 'index.js', // 默认入口文件
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
}