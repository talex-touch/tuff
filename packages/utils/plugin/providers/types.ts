import type { IDownloadOptions, IDownloadResult } from '../plugin-source'
import type { IManifest } from '..'
import type { RiskPromptHandler } from '../risk'

export enum PluginProviderType {
  GITHUB = 'github',
  NPM = 'npm',
  TPEX = 'tpex',
  FILE = 'file',
  DEV = 'dev'
}

export interface PluginInstallRequest {
  /** 用户输入或配置的原始地址，例如 repo URL、npm 包名、文件路径等。 */
  source: string
  /** 额外提示信息，例如指定 provider 类型或版本。 */
  hintType?: PluginProviderType
  /** 可选元数据，在调用链中透传。 */
  metadata?: Record<string, unknown>
  /** 客户端附加信息，仅用于 UI 状态同步。 */
  clientMetadata?: Record<string, unknown>
}

export interface PluginProviderContext {
  /** 下载配置，例如进度回调、超时时间等。 */
  downloadOptions?: IDownloadOptions
  /** 风险提示处理器，未提供时默认为自动通过。 */
  riskPrompt?: RiskPromptHandler
  /** 提供缓存或临时目录位置。 */
  tempDir?: string
}

export interface PluginInstallResult extends IDownloadResult {
  /** provider 类型，便于后续逻辑分支。 */
  provider: PluginProviderType
  /** 是否经过官方认证或白名单。 */
  official?: boolean
  /** 解析得到的 manifest；某些 provider 可能只提供压缩包路径。 */
  manifest?: IManifest
  /** 附加信息，例如使用的 tag、branch 等。 */
  metadata?: Record<string, unknown>
}

export interface PluginProvider {
  readonly type: PluginProviderType
  canHandle(request: PluginInstallRequest): boolean
  install(
    request: PluginInstallRequest,
    context?: PluginProviderContext
  ): Promise<PluginInstallResult>
}

export interface PluginInstallSummary {
  manifest?: IManifest
  providerResult: PluginInstallResult
}
