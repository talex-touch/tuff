import { IManifest } from '@talex-touch/utils/plugin'

export interface IPluginSource {
  /**
   * 尝试从指定路径解析插件清单。
   * 如果解析成功，返回 IManifest；否则返回 undefined。
   * @param pluginPath 插件的根目录路径。
   */
  resolveManifest(pluginPath: string): Promise<IManifest | undefined>
}