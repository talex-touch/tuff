import { UpdateProvider } from './UpdateProvider'
import {
  UpdateProviderType,
  UpdateSourceConfig,
  AppPreviewChannel,
  GitHubRelease,
  UpdateErrorType
} from '@talex-touch/utils'

export class OfficialUpdateProvider extends UpdateProvider {
  readonly name = 'Official Website'
  readonly type = UpdateProviderType.OFFICIAL

  // 检查是否可以处理该配置
  canHandle(config: UpdateSourceConfig): boolean {
    return config.type === UpdateProviderType.OFFICIAL
  }

  // 获取最新版本信息
  async fetchLatestRelease(_channel: AppPreviewChannel): Promise<GitHubRelease> {
    throw this.createError(
      UpdateErrorType.API_ERROR,
      'Official update server is not ready yet. Please use GitHub Releases for now.'
    )
  }

  // 获取下载资源列表
  getDownloadAssets(_release: GitHubRelease): any[] {
    // Note: _release parameter is unused but required by interface
    throw this.createError(
      UpdateErrorType.API_ERROR,
      'Official update server is not ready yet. Please use GitHub Releases for now.'
    )
  }

  // 健康检查
  async healthCheck(): Promise<boolean> {
    // 官方服务器暂未实现，返回false
    return false
  }

  // 获取服务器状态
  async getServerStatus(): Promise<{
    available: boolean
    message: string
    estimatedLaunchDate?: string
  }> {
    return {
      available: false,
      message: 'Official update server is under development',
      estimatedLaunchDate: 'TBD'
    }
  }

  // 获取服务器信息
  async getServerInfo(): Promise<{
    name: string
    version: string
    location: string
    features: string[]
  }> {
    return {
      name: 'TalexTouch Official Update Server',
      version: '0.0.0',
      location: 'Global CDN',
      features: [
        'Faster download speeds',
        'Regional optimization',
        'Advanced analytics',
        'Custom update channels'
      ]
    }
  }

  // 检查服务器维护状态
  async checkMaintenanceStatus(): Promise<{
    inMaintenance: boolean
    maintenanceMessage?: string
    estimatedEndTime?: string
  }> {
    return {
      inMaintenance: false,
      maintenanceMessage: undefined,
      estimatedEndTime: undefined
    }
  }

  // 获取服务器负载
  async getServerLoad(): Promise<{
    cpu: number
    memory: number
    network: number
    status: 'healthy' | 'warning' | 'critical'
  }> {
    return {
      cpu: 0,
      memory: 0,
      network: 0,
      status: 'healthy'
    }
  }
}
