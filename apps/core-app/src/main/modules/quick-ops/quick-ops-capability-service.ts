import type {
  QuickOpsCapabilityEntry,
  QuickOpsCapabilityInfo
} from '@talex-touch/utils/transport/events/types'
import type { QuickOpsResolvedSettings } from './quick-ops-runtime-types'

const QUICK_OPS_STATEFUL_POLICY_REASON = 'stateful-tools-disabled-by-policy'
const QUICK_OPS_NETWORK_POLICY_REASON = 'network-tools-disabled-by-policy'
const QUICK_OPS_FILE_POLICY_REASON = 'file-tools-disabled-by-policy'
const QUICK_OPS_SYSTEM_POLICY_REASON = 'system-tools-disabled-by-policy'
const QUICK_OPS_DEVELOPER_POLICY_REASON = 'developer-tools-disabled-by-policy'
const QUICK_OPS_HIGH_RISK_POLICY_REASON = 'high-risk-tools-disabled-by-policy'

export function createQuickOpsCapabilityInfo(
  settings: QuickOpsResolvedSettings,
  platform: NodeJS.Platform = process.platform
): QuickOpsCapabilityInfo {
  const disabledReason = 'quickops-disabled'
  const statusForRisk = (
    riskLevel: QuickOpsCapabilityEntry['riskLevel'],
    reason?: string
  ): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason }
    if (!settings.allowStatefulTools && (riskLevel === 'stateful' || riskLevel === 'confirm')) {
      return { status: 'disabled', reason: QUICK_OPS_STATEFUL_POLICY_REASON }
    }
    return { status: 'supported' }
  }
  const statusForNetwork = (): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason: disabledReason }
    if (!settings.allowNetworkTools) {
      return { status: 'disabled', reason: QUICK_OPS_NETWORK_POLICY_REASON }
    }
    return { status: 'supported' }
  }
  const statusForFile = (
    riskLevel: QuickOpsCapabilityEntry['riskLevel'],
    reason?: string
  ): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason }
    if (!settings.allowFileTools) {
      return { status: 'disabled', reason: QUICK_OPS_FILE_POLICY_REASON }
    }
    return statusForRisk(riskLevel, reason)
  }
  const statusForSystem = (): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason: disabledReason }
    if (!settings.allowSystemTools) {
      return { status: 'disabled', reason: QUICK_OPS_SYSTEM_POLICY_REASON }
    }
    return { status: 'supported' }
  }
  const statusForDeveloper = (): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason: disabledReason }
    if (!settings.allowDeveloperTools) {
      return { status: 'disabled', reason: QUICK_OPS_DEVELOPER_POLICY_REASON }
    }
    return { status: 'supported' }
  }
  const statusForHighRisk = (
    fallbackReason: string
  ): Pick<QuickOpsCapabilityEntry, 'status' | 'reason'> => {
    if (!settings.enabled) return { status: 'disabled', reason: disabledReason }
    if (!settings.allowHighRiskTools) {
      return { status: 'disabled', reason: QUICK_OPS_HIGH_RISK_POLICY_REASON }
    }
    return { status: 'disabled', reason: fallbackReason }
  }
  const platformLabel = platform
  const systemProxyReason =
    platform === 'darwin'
      ? 'macos-scutil'
      : platform === 'win32'
        ? 'windows-internet-settings'
        : platform === 'linux'
          ? 'linux-gsettings-fallback'
          : 'unsupported-platform'
  const batteryReason =
    platform === 'darwin'
      ? 'macos-pmset'
      : platform === 'win32'
        ? 'windows-cim'
        : platform === 'linux'
          ? 'linux-sysfs'
          : 'unsupported-platform'

  const entries: QuickOpsCapabilityEntry[] = [
    {
      id: 'quickops.state.keepAwake',
      label: '显示器保持唤醒',
      riskLevel: 'stateful',
      ...statusForRisk('stateful', disabledReason)
    },
    {
      id: 'quickops.state.systemAwake',
      label: '系统睡眠阻止',
      riskLevel: 'stateful',
      ...statusForRisk('stateful', disabledReason)
    },
    {
      id: 'quickops.state.timer',
      label: '快速计时器 / 秒表 / 番茄钟',
      riskLevel: 'stateful',
      ...statusForRisk('stateful', disabledReason)
    },
    {
      id: 'quickops.screen.overlay',
      label: '清洁屏幕 / 纯色屏幕',
      riskLevel: 'stateful',
      ...statusForRisk('stateful', disabledReason)
    },
    {
      id: 'quickops.network.local',
      label: '本机网络只读查询',
      riskLevel: 'safe',
      ...statusForNetwork()
    },
    {
      id: 'quickops.network.publicIp',
      label: '公网 IP opt-in 查询',
      riskLevel: 'safe',
      status: !settings.enabled
        ? 'disabled'
        : !settings.allowNetworkTools
          ? 'disabled'
          : settings.allowPublicIpLookup
            ? 'supported'
            : 'disabled',
      reason: !settings.enabled
        ? disabledReason
        : !settings.allowNetworkTools
          ? QUICK_OPS_NETWORK_POLICY_REASON
          : settings.allowPublicIpLookup
            ? undefined
            : 'public-ip-disabled'
    },
    {
      id: 'quickops.network.systemProxy',
      label: '系统代理只读摘要',
      riskLevel: 'safe',
      status: !settings.enabled
        ? 'disabled'
        : !settings.allowNetworkTools
          ? 'disabled'
          : systemProxyReason === 'unsupported-platform'
            ? 'degraded'
            : 'supported',
      reason: !settings.enabled
        ? disabledReason
        : !settings.allowNetworkTools
          ? QUICK_OPS_NETWORK_POLICY_REASON
          : systemProxyReason
    },
    {
      id: 'quickops.files.readOnly',
      label: '文件 Hash / Base64 / 路径复制',
      riskLevel: 'safe',
      ...statusForFile('safe', disabledReason)
    },
    {
      id: 'quickops.files.writeTemp',
      label: 'Tuff 临时文件写入',
      riskLevel: 'confirm',
      ...statusForFile('confirm', disabledReason)
    },
    {
      id: 'quickops.files.moveRecentDownload',
      label: '最近下载文件移动',
      riskLevel: 'confirm',
      ...statusForFile('confirm', disabledReason)
    },
    {
      id: 'quickops.system.diagnostics',
      label: '脱敏诊断 / 系统信息',
      riskLevel: 'safe',
      ...statusForSystem()
    },
    {
      id: 'quickops.system.storage',
      label: '磁盘空间 / 目录占用',
      riskLevel: 'safe',
      ...statusForSystem()
    },
    {
      id: 'quickops.system.battery',
      label: '电池状态',
      riskLevel: 'safe',
      status: !settings.enabled
        ? 'disabled'
        : !settings.allowSystemTools
          ? 'disabled'
          : batteryReason === 'unsupported-platform'
            ? 'degraded'
            : 'supported',
      reason: !settings.enabled
        ? disabledReason
        : !settings.allowSystemTools
          ? QUICK_OPS_SYSTEM_POLICY_REASON
          : batteryReason
    },
    {
      id: 'quickops.developer.preview',
      label: 'PreviewSDK 开发者工具',
      riskLevel: 'safe',
      ...statusForDeveloper()
    },
    {
      id: 'quickops.network.portKill',
      label: '真实端口进程终止',
      riskLevel: 'danger',
      ...(!settings.allowNetworkTools
        ? { status: 'disabled' as const, reason: QUICK_OPS_NETWORK_POLICY_REASON }
        : statusForHighRisk('copy-only-command'))
    }
  ]

  return {
    platform: platformLabel,
    enabled: settings.enabled,
    entries
  }
}

export function formatQuickOpsCapabilityInfo(info: QuickOpsCapabilityInfo): string {
  return [
    `QuickOps Capabilities (${info.platform})`,
    `Enabled: ${info.enabled ? 'yes' : 'no'}`,
    ...info.entries.map((entry) =>
      [
        entry.id,
        entry.status,
        `risk=${entry.riskLevel}`,
        entry.reason ? `reason=${entry.reason}` : null,
        entry.label
      ]
        .filter((part): part is string => Boolean(part))
        .join(' | ')
    )
  ].join('\n')
}
