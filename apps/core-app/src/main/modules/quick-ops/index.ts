import type {
  FlowSession,
  FlowTarget,
  MaybePromise,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey,
  ModuleStopContext
} from '@talex-touch/utils'
import type {
  QuickOpsAuditEntry,
  QuickOpsAuditGetRequest,
  QuickOpsAuditGetResponse,
  QuickOpsBatteryStatusGetResponse,
  QuickOpsCommonDirectoryGetRequest,
  QuickOpsCommonDirectoryGetResponse,
  QuickOpsDiagnosticsGetResponse,
  QuickOpsDeveloperPreviewRequest,
  QuickOpsDeveloperPreviewResponse,
  QuickOpsDeveloperPreviewSaveRequest,
  QuickOpsDeveloperPreviewSaveResponse,
  QuickOpsDirectoryUsageGetRequest,
  QuickOpsDirectoryUsageGetResponse,
  QuickOpsDiskSpaceGetResponse,
  QuickOpsDnsQueryGetRequest,
  QuickOpsDnsQueryGetResponse,
  QuickOpsFileBase64GetRequest,
  QuickOpsFileBase64GetResponse,
  QuickOpsFileHashGetRequest,
  QuickOpsFileHashGetResponse,
  QuickOpsFormatTextGetRequest,
  QuickOpsFormatTextGetResponse,
  QuickOpsFormatTextMode,
  QuickOpsNetworkStatusGetResponse,
  QuickOpsPathFormatGetRequest,
  QuickOpsPathFormatGetResponse,
  QuickOpsPortStatusGetRequest,
  QuickOpsPortStatusGetResponse,
  QuickOpsQueryLocalIpGetResponse,
  QuickOpsRecentDownloadGetResponse,
  QuickOpsSessionSnapshot,
  QuickOpsSessionsGetResponse,
  QuickOpsSystemProxyGetResponse,
  QuickOpsSystemInfoGetResponse
} from '@talex-touch/utils/transport/events/types'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { PreviewAbilityContext, PreviewCardPayload } from '@talex-touch/utils/core-box/preview'
import crypto from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import { app, clipboard, shell } from 'electron'
import {
  QuickOpsDeveloperAbility,
  hasQuickOpsDeveloperCommand
} from '@talex-touch/utils/core-box/preview'
import { QuickOpsEvents } from '@talex-touch/utils/transport/events'
import { StorageList, TuffInputType, type AppSetting } from '@talex-touch/utils'
import { TalexEvents } from '../../core/eventbus/touch-event'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import {
  createBatteryStatusInfo,
  computeFileHashes,
  encodeFileBase64,
  createDiskSpaceInfo,
  createDirectoryUsageInfo,
  createDnsQueryInfo,
  createFilePathInfo,
  createNetworkStatusInfo,
  createSystemProxyInfo,
  createSystemInfo,
  createTempDirectory,
  createTempTextFile,
  findRecentDownloadFile,
  formatBatteryStatusInfo,
  formatDiskSpaceInfo,
  formatDirectoryUsageInfo,
  formatDnsQueryInfo,
  formatDiagnosticsInfo,
  formatLocalIpInfo,
  formatNetworkStatusInfo,
  formatQuickOpsCapabilityInfo,
  formatSystemProxyInfo,
  formatSystemInfo,
  getLocalIpAddresses,
  createPortReleaseCommand,
  isValidTcpPort,
  lookupPublicIp,
  parseDurationMs,
  parseDnsQuery,
  parsePortQuery,
  probeLocalTcpPort,
  quickOpsRuntime,
  resolveCommonDirectory,
  resolveFileBase64Path,
  resolveFileHashPath,
  resolveFilePathTarget
} from './quick-ops-runtime-host'
import type { QuickOpsScreenCleanMode, QuickOpsSession } from './quick-ops-session-manager'
import { formatDuration, getSessionDisplayDurationMs } from './quick-ops-session-manager'
import { flowBus } from '../flow-bus/flow-bus'
import { flowTargetRegistry } from '../flow-bus/target-registry'
import { notificationModule } from '../notification'
import { getMainConfig } from '../storage'

const QUICK_OPS_FLOW_PLUGIN_ID = 'quickops'
const QUICK_OPS_CAPABILITIES_FLOW_TARGET_ID = 'capabilities'
const QUICK_OPS_SESSIONS_FLOW_TARGET_ID = 'sessions'
const QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET_ID = 'stop-all-sessions'
const QUICK_OPS_SYSTEM_INFO_FLOW_TARGET_ID = 'system-info'
const QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET_ID = 'tuff-diagnostics'
const QUICK_OPS_DISK_SPACE_FLOW_TARGET_ID = 'disk-space'
const QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET_ID = 'directory-usage'
const QUICK_OPS_NETWORK_STATUS_FLOW_TARGET_ID = 'network-status'
const QUICK_OPS_BATTERY_STATUS_FLOW_TARGET_ID = 'battery-status'
const QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET_ID = 'system-proxy'
const QUICK_OPS_PUBLIC_IP_FLOW_TARGET_ID = 'public-ip'
const QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET_ID = 'query-local-ip'
const QUICK_OPS_PORT_STATUS_FLOW_TARGET_ID = 'port-status'
const QUICK_OPS_DNS_QUERY_FLOW_TARGET_ID = 'dns-query'
const QUICK_OPS_FILE_HASH_FLOW_TARGET_ID = 'file-hash'
const QUICK_OPS_FILE_BASE64_FLOW_TARGET_ID = 'file-base64'
const QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET_ID = 'recent-download'
const QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET_ID = 'common-directory'
const QUICK_OPS_PATH_FORMAT_FLOW_TARGET_ID = 'path-format'
const QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET_ID = 'temp-text-file'
const QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET_ID = 'temp-directory'
const QUICK_OPS_KEEP_AWAKE_FLOW_TARGET_ID = 'keep-awake'
const QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET_ID = 'stop-keep-awake'
const QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET_ID = 'system-awake'
const QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET_ID = 'stop-system-awake'
const QUICK_OPS_START_TIMER_FLOW_TARGET_ID = 'start-timer'
const QUICK_OPS_PAUSE_TIMER_FLOW_TARGET_ID = 'pause-timer'
const QUICK_OPS_RESUME_TIMER_FLOW_TARGET_ID = 'resume-timer'
const QUICK_OPS_STOP_TIMER_FLOW_TARGET_ID = 'stop-timer'
const QUICK_OPS_START_POMODORO_FLOW_TARGET_ID = 'start-pomodoro'
const QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET_ID = 'pause-pomodoro'
const QUICK_OPS_RESUME_POMODORO_FLOW_TARGET_ID = 'resume-pomodoro'
const QUICK_OPS_STOP_POMODORO_FLOW_TARGET_ID = 'stop-pomodoro'
const QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET_ID = 'clean-screen'
const QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET_ID = 'stop-clean-screen'
const QUICK_OPS_START_STOPWATCH_FLOW_TARGET_ID = 'start-stopwatch'
const QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET_ID = 'pause-stopwatch'
const QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET_ID = 'resume-stopwatch'
const QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET_ID = 'lap-stopwatch'
const QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET_ID = 'reset-stopwatch'
const QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET_ID = 'show-notification'
const QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET_ID = 'copy-to-clipboard'
const QUICK_OPS_FORMAT_TEXT_FLOW_TARGET_ID = 'format-text'
const QUICK_OPS_OPEN_FOLDER_FLOW_TARGET_ID = 'open-folder'
const QUICK_OPS_STATEFUL_POLICY_REASON = 'stateful-tools-disabled-by-policy'
const QUICK_OPS_NETWORK_POLICY_REASON = 'network-tools-disabled-by-policy'
const QUICK_OPS_FILE_POLICY_REASON = 'file-tools-disabled-by-policy'
const QUICK_OPS_SYSTEM_POLICY_REASON = 'system-tools-disabled-by-policy'
const QUICK_OPS_DEVELOPER_POLICY_REASON = 'developer-tools-disabled-by-policy'
export const QUICK_OPS_CAPABILITIES_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_CAPABILITIES_FLOW_TARGET_ID}`
export const QUICK_OPS_SESSIONS_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_SESSIONS_FLOW_TARGET_ID}`
export const QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET_ID}`
export const QUICK_OPS_SYSTEM_INFO_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_SYSTEM_INFO_FLOW_TARGET_ID}`
export const QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET_ID}`
export const QUICK_OPS_DISK_SPACE_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_DISK_SPACE_FLOW_TARGET_ID}`
export const QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET_ID}`
export const QUICK_OPS_NETWORK_STATUS_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_NETWORK_STATUS_FLOW_TARGET_ID}`
export const QUICK_OPS_BATTERY_STATUS_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_BATTERY_STATUS_FLOW_TARGET_ID}`
export const QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET_ID}`
export const QUICK_OPS_PUBLIC_IP_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_PUBLIC_IP_FLOW_TARGET_ID}`
export const QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET_ID}`
export const QUICK_OPS_PORT_STATUS_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_PORT_STATUS_FLOW_TARGET_ID}`
export const QUICK_OPS_DNS_QUERY_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_DNS_QUERY_FLOW_TARGET_ID}`
export const QUICK_OPS_FILE_HASH_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_FILE_HASH_FLOW_TARGET_ID}`
export const QUICK_OPS_FILE_BASE64_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_FILE_BASE64_FLOW_TARGET_ID}`
export const QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET_ID}`
export const QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET_ID}`
export const QUICK_OPS_PATH_FORMAT_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_PATH_FORMAT_FLOW_TARGET_ID}`
export const QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET_ID}`
export const QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET_ID}`
export const QUICK_OPS_KEEP_AWAKE_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_KEEP_AWAKE_FLOW_TARGET_ID}`
export const QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET_ID}`
export const QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET_ID}`
export const QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET_ID}`
export const QUICK_OPS_START_TIMER_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_START_TIMER_FLOW_TARGET_ID}`
export const QUICK_OPS_PAUSE_TIMER_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_PAUSE_TIMER_FLOW_TARGET_ID}`
export const QUICK_OPS_RESUME_TIMER_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_RESUME_TIMER_FLOW_TARGET_ID}`
export const QUICK_OPS_STOP_TIMER_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_STOP_TIMER_FLOW_TARGET_ID}`
export const QUICK_OPS_START_POMODORO_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_START_POMODORO_FLOW_TARGET_ID}`
export const QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET_ID}`
export const QUICK_OPS_RESUME_POMODORO_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_RESUME_POMODORO_FLOW_TARGET_ID}`
export const QUICK_OPS_STOP_POMODORO_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_STOP_POMODORO_FLOW_TARGET_ID}`
export const QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET_ID}`
export const QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET_ID}`
export const QUICK_OPS_START_STOPWATCH_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_START_STOPWATCH_FLOW_TARGET_ID}`
export const QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET_ID}`
export const QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET_ID}`
export const QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET_ID}`
export const QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET_ID}`
export const QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET_ID}`
export const QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET_ID}`
export const QUICK_OPS_FORMAT_TEXT_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_FORMAT_TEXT_FLOW_TARGET_ID}`
export const QUICK_OPS_OPEN_FOLDER_FLOW_TARGET_FULL_ID = `${QUICK_OPS_FLOW_PLUGIN_ID}.${QUICK_OPS_OPEN_FOLDER_FLOW_TARGET_ID}`

const QUICK_OPS_STATEFUL_FLOW_TARGET_IDS = new Set([
  QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET_ID,
  QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET_ID,
  QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET_ID,
  QUICK_OPS_KEEP_AWAKE_FLOW_TARGET_ID,
  QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET_ID,
  QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET_ID,
  QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET_ID,
  QUICK_OPS_START_TIMER_FLOW_TARGET_ID,
  QUICK_OPS_PAUSE_TIMER_FLOW_TARGET_ID,
  QUICK_OPS_RESUME_TIMER_FLOW_TARGET_ID,
  QUICK_OPS_STOP_TIMER_FLOW_TARGET_ID,
  QUICK_OPS_START_POMODORO_FLOW_TARGET_ID,
  QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET_ID,
  QUICK_OPS_RESUME_POMODORO_FLOW_TARGET_ID,
  QUICK_OPS_STOP_POMODORO_FLOW_TARGET_ID,
  QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET_ID,
  QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET_ID,
  QUICK_OPS_START_STOPWATCH_FLOW_TARGET_ID,
  QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET_ID,
  QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET_ID,
  QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET_ID,
  QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET_ID,
  QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET_ID,
  QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET_ID,
  QUICK_OPS_OPEN_FOLDER_FLOW_TARGET_ID
])

const QUICK_OPS_NETWORK_FLOW_TARGET_IDS = new Set([
  QUICK_OPS_NETWORK_STATUS_FLOW_TARGET_ID,
  QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET_ID,
  QUICK_OPS_PUBLIC_IP_FLOW_TARGET_ID,
  QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET_ID,
  QUICK_OPS_PORT_STATUS_FLOW_TARGET_ID,
  QUICK_OPS_DNS_QUERY_FLOW_TARGET_ID
])

const QUICK_OPS_FILE_FLOW_TARGET_IDS = new Set([
  QUICK_OPS_FILE_HASH_FLOW_TARGET_ID,
  QUICK_OPS_FILE_BASE64_FLOW_TARGET_ID,
  QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET_ID,
  QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET_ID,
  QUICK_OPS_PATH_FORMAT_FLOW_TARGET_ID,
  QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET_ID,
  QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET_ID,
  QUICK_OPS_OPEN_FOLDER_FLOW_TARGET_ID
])

const QUICK_OPS_SYSTEM_FLOW_TARGET_IDS = new Set([
  QUICK_OPS_SYSTEM_INFO_FLOW_TARGET_ID,
  QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET_ID,
  QUICK_OPS_DISK_SPACE_FLOW_TARGET_ID,
  QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET_ID,
  QUICK_OPS_BATTERY_STATUS_FLOW_TARGET_ID
])

const QUICK_OPS_DEVELOPER_FLOW_TARGET_IDS = new Set([QUICK_OPS_FORMAT_TEXT_FLOW_TARGET_ID])
const QUICK_OPS_AUDIT_MAX_ENTRIES = 100
const QUICK_OPS_AUDIT_DEFAULT_LIMIT = 20
const QUICK_OPS_AUDIT_MAX_LIMIT = 100

const QUICK_OPS_CAPABILITIES_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_CAPABILITIES_FLOW_TARGET_ID,
  name: 'QuickOps Capabilities',
  description: 'Returns a read-only QuickOps capability summary for Flow callers.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:tools-line',
  actionId: QUICK_OPS_CAPABILITIES_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_SESSIONS_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_SESSIONS_FLOW_TARGET_ID,
  name: 'QuickOps Sessions',
  description: 'Returns a read-only snapshot of active QuickOps sessions.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:pulse-line',
  actionId: QUICK_OPS_SESSIONS_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET_ID,
  name: 'QuickOps Stop All Sessions',
  description: 'Stops all active QuickOps runtime sessions through the shared provider.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:stop-circle-line',
  actionId: QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_SYSTEM_INFO_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_SYSTEM_INFO_FLOW_TARGET_ID,
  name: 'QuickOps System Info',
  description: 'Returns a read-only local system summary without external requests.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:computer-line',
  actionId: QUICK_OPS_SYSTEM_INFO_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET_ID,
  name: 'QuickOps Tuff Diagnostics',
  description: 'Returns a redacted local Tuff diagnostics summary without reading logs.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:stethoscope-line',
  actionId: QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_DISK_SPACE_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_DISK_SPACE_FLOW_TARGET_ID,
  name: 'QuickOps Disk Space',
  description: 'Returns a read-only local disk space summary for known safe roots.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:hard-drive-line',
  actionId: QUICK_OPS_DISK_SPACE_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET_ID,
  name: 'QuickOps Directory Usage',
  description: 'Returns a bounded read-only directory usage summary for known safe roots.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:folder-chart-line',
  actionId: QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_NETWORK_STATUS_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_NETWORK_STATUS_FLOW_TARGET_ID,
  name: 'QuickOps Network Status',
  description: 'Returns a read-only local network status summary without external requests.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:router-line',
  actionId: QUICK_OPS_NETWORK_STATUS_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_BATTERY_STATUS_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_BATTERY_STATUS_FLOW_TARGET_ID,
  name: 'QuickOps Battery Status',
  description: 'Returns a read-only local battery status summary when the platform supports it.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:battery-charge-line',
  actionId: QUICK_OPS_BATTERY_STATUS_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET_ID,
  name: 'QuickOps System Proxy',
  description: 'Returns a read-only local proxy summary with redacted proxy credentials.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:exchange-line',
  actionId: QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_PUBLIC_IP_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_PUBLIC_IP_FLOW_TARGET_ID,
  name: 'QuickOps Public IP',
  description: 'Returns an opt-in read-only public IP lookup result.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:global-line',
  actionId: QUICK_OPS_PUBLIC_IP_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET_ID,
  name: 'QuickOps Query Local IP',
  description: 'Returns non-internal local network addresses without external requests.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:global-line',
  actionId: QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_PORT_STATUS_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_PORT_STATUS_FLOW_TARGET_ID,
  name: 'QuickOps Port Status',
  description: 'Returns read-only local TCP port availability and optional process attribution.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:server-line',
  actionId: QUICK_OPS_PORT_STATUS_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_DNS_QUERY_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_DNS_QUERY_FLOW_TARGET_ID,
  name: 'QuickOps DNS Query',
  description: 'Returns read-only DNS records for a hostname through the local resolver.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:global-line',
  actionId: QUICK_OPS_DNS_QUERY_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_FILE_HASH_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_FILE_HASH_FLOW_TARGET_ID,
  name: 'QuickOps File Hash',
  description: 'Computes read-only MD5, SHA1 and SHA256 hashes for one local file.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:file-shield-line',
  actionId: QUICK_OPS_FILE_HASH_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_FILE_BASE64_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_FILE_BASE64_FLOW_TARGET_ID,
  name: 'QuickOps File Base64',
  description: 'Encodes one local file as Base64 within the existing QuickOps size limit.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:file-code-line',
  actionId: QUICK_OPS_FILE_BASE64_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 1024 * 1024 + 16 * 1024
  }
}

const QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET_ID,
  name: 'QuickOps Recent Download',
  description: 'Returns the latest regular file from Downloads without opening or moving it.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:download-line',
  actionId: QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET_ID,
  name: 'QuickOps Common Directory',
  description: 'Resolves a supported local common folder path without opening it.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:folder-line',
  actionId: QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_PATH_FORMAT_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_PATH_FORMAT_FLOW_TARGET_ID,
  name: 'QuickOps Path Format',
  description: 'Returns copy-only path formats without touching the filesystem.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:route-line',
  actionId: QUICK_OPS_PATH_FORMAT_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET_ID,
  name: 'QuickOps Temp Text File',
  description: 'Creates a bounded scratch text file under the QuickOps temp workspace.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:file-text-line',
  actionId: QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 80 * 1024
  }
}

const QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET_ID,
  name: 'QuickOps Temp Directory',
  description: 'Creates a sanitized directory under the QuickOps temp workspace.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:folder-add-line',
  actionId: QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET_ID,
  name: 'QuickOps Stop Keep Awake',
  description: 'Stops the current QuickOps display keep-awake session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:moon-clear-line',
  actionId: QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET_ID,
  name: 'QuickOps Stop System Awake',
  description: 'Stops the current QuickOps system-awake session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:shutdown-line',
  actionId: QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_KEEP_AWAKE_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_KEEP_AWAKE_FLOW_TARGET_ID,
  name: 'QuickOps Keep Awake',
  description: 'Starts or replaces the QuickOps display keep-awake session.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:sun-line',
  actionId: QUICK_OPS_KEEP_AWAKE_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET_ID,
  name: 'QuickOps System Awake',
  description: 'Starts or replaces the QuickOps system-awake session.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:power-line',
  actionId: QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_START_TIMER_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_START_TIMER_FLOW_TARGET_ID,
  name: 'QuickOps Start Timer',
  description: 'Starts or replaces the QuickOps timer with a bounded local duration.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:timer-line',
  actionId: QUICK_OPS_START_TIMER_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_PAUSE_TIMER_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_PAUSE_TIMER_FLOW_TARGET_ID,
  name: 'QuickOps Pause Timer',
  description: 'Pauses the current QuickOps timer session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:pause-circle-line',
  actionId: QUICK_OPS_PAUSE_TIMER_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_RESUME_TIMER_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_RESUME_TIMER_FLOW_TARGET_ID,
  name: 'QuickOps Resume Timer',
  description: 'Resumes the current paused QuickOps timer session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:play-circle-line',
  actionId: QUICK_OPS_RESUME_TIMER_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_STOP_TIMER_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_STOP_TIMER_FLOW_TARGET_ID,
  name: 'QuickOps Stop Timer',
  description: 'Stops the current QuickOps timer session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:stop-circle-line',
  actionId: QUICK_OPS_STOP_TIMER_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_START_POMODORO_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_START_POMODORO_FLOW_TARGET_ID,
  name: 'QuickOps Start Pomodoro',
  description: 'Starts or replaces the QuickOps Pomodoro session with local parameters.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:timer-flash-line',
  actionId: QUICK_OPS_START_POMODORO_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET_ID,
  name: 'QuickOps Pause Pomodoro',
  description: 'Pauses the current QuickOps Pomodoro session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:pause-circle-line',
  actionId: QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_RESUME_POMODORO_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_RESUME_POMODORO_FLOW_TARGET_ID,
  name: 'QuickOps Resume Pomodoro',
  description: 'Resumes the current paused QuickOps Pomodoro session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:play-circle-line',
  actionId: QUICK_OPS_RESUME_POMODORO_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_STOP_POMODORO_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_STOP_POMODORO_FLOW_TARGET_ID,
  name: 'QuickOps Stop Pomodoro',
  description: 'Stops the current QuickOps Pomodoro session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:stop-circle-line',
  actionId: QUICK_OPS_STOP_POMODORO_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET_ID,
  name: 'QuickOps Clean Screen',
  description: 'Starts or replaces the QuickOps local screen-clean overlay.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:fullscreen-line',
  actionId: QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET_ID,
  name: 'QuickOps Stop Clean Screen',
  description: 'Stops the current QuickOps screen-clean overlay if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:close-circle-line',
  actionId: QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_START_STOPWATCH_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_START_STOPWATCH_FLOW_TARGET_ID,
  name: 'QuickOps Start Stopwatch',
  description: 'Starts or replaces the QuickOps local stopwatch session.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:timer-line',
  actionId: QUICK_OPS_START_STOPWATCH_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET_ID,
  name: 'QuickOps Pause Stopwatch',
  description: 'Pauses the current QuickOps stopwatch session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:pause-circle-line',
  actionId: QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET_ID,
  name: 'QuickOps Resume Stopwatch',
  description: 'Resumes the current paused QuickOps stopwatch session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:play-circle-line',
  actionId: QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET_ID,
  name: 'QuickOps Lap Stopwatch',
  description: 'Records a lap for the current QuickOps stopwatch session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:flag-line',
  actionId: QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET_ID,
  name: 'QuickOps Reset Stopwatch',
  description: 'Stops and clears the current QuickOps stopwatch session if one is running.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:stop-circle-line',
  actionId: QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET_ID,
  name: 'QuickOps Show Notification',
  description: 'Shows a bounded local system notification through QuickOps.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:notification-3-line',
  actionId: QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET_ID,
  name: 'QuickOps Copy To Clipboard',
  description: 'Copies bounded text to the local clipboard through QuickOps.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:clipboard-line',
  actionId: QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_FORMAT_TEXT_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_FORMAT_TEXT_FLOW_TARGET_ID,
  name: 'QuickOps Format Text',
  description: 'Formats bounded text locally and returns the transformed value.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:text',
  actionId: QUICK_OPS_FORMAT_TEXT_FLOW_TARGET_FULL_ID,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_OPEN_FOLDER_FLOW_TARGET: FlowTarget = {
  id: QUICK_OPS_OPEN_FOLDER_FLOW_TARGET_ID,
  name: 'QuickOps Open Folder',
  description: 'Opens a supported local common folder through QuickOps.',
  supportedTypes: ['json', 'text'],
  icon: 'ri:folder-open-line',
  actionId: QUICK_OPS_OPEN_FOLDER_FLOW_TARGET_FULL_ID,
  requireConfirm: true,
  capabilities: {
    maxPayloadSize: 16 * 1024
  }
}

const QUICK_OPS_ALL_FLOW_TARGETS: FlowTarget[] = [
  QUICK_OPS_CAPABILITIES_FLOW_TARGET,
  QUICK_OPS_SESSIONS_FLOW_TARGET,
  QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET,
  QUICK_OPS_SYSTEM_INFO_FLOW_TARGET,
  QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET,
  QUICK_OPS_DISK_SPACE_FLOW_TARGET,
  QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET,
  QUICK_OPS_NETWORK_STATUS_FLOW_TARGET,
  QUICK_OPS_BATTERY_STATUS_FLOW_TARGET,
  QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET,
  QUICK_OPS_PUBLIC_IP_FLOW_TARGET,
  QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET,
  QUICK_OPS_PORT_STATUS_FLOW_TARGET,
  QUICK_OPS_DNS_QUERY_FLOW_TARGET,
  QUICK_OPS_FILE_HASH_FLOW_TARGET,
  QUICK_OPS_FILE_BASE64_FLOW_TARGET,
  QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET,
  QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET,
  QUICK_OPS_PATH_FORMAT_FLOW_TARGET,
  QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET,
  QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET,
  QUICK_OPS_KEEP_AWAKE_FLOW_TARGET,
  QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET,
  QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET,
  QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET,
  QUICK_OPS_START_TIMER_FLOW_TARGET,
  QUICK_OPS_PAUSE_TIMER_FLOW_TARGET,
  QUICK_OPS_RESUME_TIMER_FLOW_TARGET,
  QUICK_OPS_STOP_TIMER_FLOW_TARGET,
  QUICK_OPS_START_POMODORO_FLOW_TARGET,
  QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET,
  QUICK_OPS_RESUME_POMODORO_FLOW_TARGET,
  QUICK_OPS_STOP_POMODORO_FLOW_TARGET,
  QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET,
  QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET,
  QUICK_OPS_START_STOPWATCH_FLOW_TARGET,
  QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET,
  QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET,
  QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET,
  QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET,
  QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET,
  QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET,
  QUICK_OPS_FORMAT_TEXT_FLOW_TARGET,
  QUICK_OPS_OPEN_FOLDER_FLOW_TARGET
]

export class QuickOpsModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('QuickOps')
  name: ModuleKey = QuickOpsModule.key
  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private flowDeliveryDisposer: (() => void) | null = null
  private appQuitDisposers: Array<() => void> = []
  private flowTargetIds: string[] = []
  private auditEntries: QuickOpsAuditEntry[] = []
  private auditSeq = 0

  constructor() {
    super(QuickOpsModule.key, {
      create: false
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const runtime = resolveMainRuntime(ctx, 'QuickOpsModule.onInit')
    this.transport = runtime.transport
    this.registerTransportHandlers()
    this.registerFlowTarget()
    this.registerAppQuitCleanup(ctx)
  }

  stop(ctx: ModuleStopContext<TalexEvents>): MaybePromise<void> {
    this.disposeAppQuitCleanup()
    this.disposeTransportHandlers()
    this.disposeFlowTarget()
    quickOpsRuntime.cleanup(`module-stop:${ctx.reason}`)
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): MaybePromise<void> {
    this.disposeAppQuitCleanup()
    this.disposeTransportHandlers()
    this.disposeFlowTarget()
    this.auditEntries = []
    this.transport = null
    quickOpsRuntime.cleanup('module-destroy')
  }

  getRuntime(): typeof quickOpsRuntime {
    return quickOpsRuntime
  }

  private registerAppQuitCleanup(ctx: ModuleInitContext<TalexEvents>): void {
    this.disposeAppQuitCleanup()
    this.appQuitDisposers.push(
      this.on(ctx, TalexEvents.BEFORE_APP_QUIT, () => {
        quickOpsRuntime.cleanup('app-before-quit')
      }),
      this.on(ctx, TalexEvents.WILL_QUIT, () => {
        quickOpsRuntime.cleanup('app-will-quit')
      })
    )
  }

  private disposeAppQuitCleanup(): void {
    for (const dispose of this.appQuitDisposers.splice(0)) {
      dispose()
    }
  }

  private registerTransportHandlers(): void {
    const transport = this.transport
    if (!transport) return

    this.transportDisposers.push(
      transport.on(QuickOpsEvents.capabilities.get, () => quickOpsRuntime.getCapabilityInfo()),
      transport.on(QuickOpsEvents.sessions.get, () => createQuickOpsSessionsResponse()),
      transport.on(QuickOpsEvents.audit.get, (request) =>
        this.createQuickOpsAuditResponse(request || undefined)
      ),
      transport.on(QuickOpsEvents.systemInfo.get, () => createQuickOpsSystemInfoResponse()),
      transport.on(QuickOpsEvents.tuffDiagnostics.get, () => createQuickOpsDiagnosticsResponse()),
      transport.on(QuickOpsEvents.diskSpace.get, () => createQuickOpsDiskSpaceResponse()),
      transport.on(QuickOpsEvents.directoryUsage.get, (request) =>
        createQuickOpsDirectoryUsageResponse(request)
      ),
      transport.on(QuickOpsEvents.queryLocalIp.get, () => createQuickOpsQueryLocalIpResponse()),
      transport.on(QuickOpsEvents.portStatus.get, (request) =>
        createQuickOpsPortStatusResponse(request)
      ),
      transport.on(QuickOpsEvents.dnsQuery.get, (request) =>
        createQuickOpsDnsQueryResponse(request)
      ),
      transport.on(QuickOpsEvents.fileHash.get, (request) =>
        createQuickOpsFileHashResponse(request)
      ),
      transport.on(QuickOpsEvents.fileBase64.get, (request) =>
        createQuickOpsFileBase64Response(request)
      ),
      transport.on(QuickOpsEvents.recentDownload.get, () => createQuickOpsRecentDownloadResponse()),
      transport.on(QuickOpsEvents.commonDirectory.get, (request) =>
        createQuickOpsCommonDirectoryResponse(request || undefined)
      ),
      transport.on(QuickOpsEvents.pathFormat.get, (request) =>
        createQuickOpsPathFormatResponse(request)
      ),
      transport.on(QuickOpsEvents.formatText.get, (request) =>
        createQuickOpsFormatTextResponse(request)
      ),
      transport.on(QuickOpsEvents.networkStatus.get, () => createQuickOpsNetworkStatusResponse()),
      transport.on(QuickOpsEvents.batteryStatus.get, () => createQuickOpsBatteryStatusResponse()),
      transport.on(QuickOpsEvents.systemProxy.get, () => createQuickOpsSystemProxyResponse()),
      transport.on(QuickOpsEvents.developerPreview.get, (request) =>
        createQuickOpsDeveloperPreviewResponse(request)
      ),
      transport.on(QuickOpsEvents.developerPreview.save, (request) =>
        saveQuickOpsDeveloperPreview(request)
      )
    )
  }

  private registerFlowTarget(): void {
    this.disposeFlowTarget()

    for (const target of QUICK_OPS_ALL_FLOW_TARGETS) {
      const registered = flowTargetRegistry.registerTarget(QUICK_OPS_FLOW_PLUGIN_ID, target, {
        pluginName: 'QuickOps',
        pluginIcon: 'ri:tools-line',
        isEnabled: true,
        hasFlowHandler: true
      })
      if (registered) {
        this.flowTargetIds.push(`${QUICK_OPS_FLOW_PLUGIN_ID}.${target.id}`)
      }
    }

    if (this.flowTargetIds.length > 0) {
      this.flowDeliveryDisposer = flowBus.registerDeliveryHandler(
        QUICK_OPS_FLOW_PLUGIN_ID,
        async (session: FlowSession) => {
          await this.handleFlowDelivery(session)
        }
      )
    }
  }

  private async handleFlowDelivery(session: FlowSession): Promise<void> {
    if (isQuickOpsStatefulFlowTargetBlocked(session.targetId)) {
      this.acknowledgeQuickOpsPolicyBlocked(
        session,
        QUICK_OPS_STATEFUL_POLICY_REASON,
        'QuickOps stateful tools are disabled by policy'
      )
      return
    }

    if (isQuickOpsNetworkFlowTargetBlocked(session.targetId)) {
      this.acknowledgeQuickOpsPolicyBlocked(
        session,
        QUICK_OPS_NETWORK_POLICY_REASON,
        'QuickOps network tools are disabled by policy'
      )
      return
    }

    if (isQuickOpsFileFlowTargetBlocked(session.targetId)) {
      this.acknowledgeQuickOpsPolicyBlocked(
        session,
        QUICK_OPS_FILE_POLICY_REASON,
        'QuickOps file tools are disabled by policy'
      )
      return
    }

    if (isQuickOpsSystemFlowTargetBlocked(session.targetId)) {
      this.acknowledgeQuickOpsPolicyBlocked(
        session,
        QUICK_OPS_SYSTEM_POLICY_REASON,
        'QuickOps system tools are disabled by policy'
      )
      return
    }

    if (isQuickOpsDeveloperFlowTargetBlocked(session.targetId)) {
      this.acknowledgeQuickOpsPolicyBlocked(
        session,
        QUICK_OPS_DEVELOPER_POLICY_REASON,
        'QuickOps developer tools are disabled by policy'
      )
      return
    }

    if (session.targetId === QUICK_OPS_SYSTEM_INFO_FLOW_TARGET_ID) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.systemInfo',
        ...createQuickOpsSystemInfoResponse()
      })
      return
    }

    if (session.targetId === QUICK_OPS_SESSIONS_FLOW_TARGET_ID) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.sessions',
        ...createQuickOpsSessionsResponse()
      })
      return
    }

    if (session.targetId === QUICK_OPS_STOP_ALL_SESSIONS_FLOW_TARGET_ID) {
      const { sessions } = createQuickOpsSessionsResponse()
      const stopped = quickOpsRuntime.stopAllSessions()
      this.acknowledgeFlow(session, {
        kind: 'quickops.stopAllSessions',
        state: stopped > 0 ? 'stopped' : 'idle',
        stopped,
        sessions,
        text:
          stopped > 0
            ? `Stopped ${stopped} QuickOps session${stopped === 1 ? '' : 's'}`
            : 'QuickOps sessions: idle'
      })
      return
    }

    if (session.targetId === QUICK_OPS_TUFF_DIAGNOSTICS_FLOW_TARGET_ID) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.tuffDiagnostics',
        ...createQuickOpsDiagnosticsResponse()
      })
      return
    }

    if (session.targetId === QUICK_OPS_DISK_SPACE_FLOW_TARGET_ID) {
      await this.handleDiskSpaceDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_DIRECTORY_USAGE_FLOW_TARGET_ID) {
      await this.handleDirectoryUsageDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_NETWORK_STATUS_FLOW_TARGET_ID) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.networkStatus',
        ...createQuickOpsNetworkStatusResponse()
      })
      return
    }

    if (session.targetId === QUICK_OPS_BATTERY_STATUS_FLOW_TARGET_ID) {
      await this.handleBatteryStatusDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_SYSTEM_PROXY_FLOW_TARGET_ID) {
      await this.handleSystemProxyDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_PUBLIC_IP_FLOW_TARGET_ID) {
      await this.handlePublicIpDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_QUERY_LOCAL_IP_FLOW_TARGET_ID) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.queryLocalIp',
        ...createQuickOpsQueryLocalIpResponse()
      })
      return
    }

    if (session.targetId === QUICK_OPS_PORT_STATUS_FLOW_TARGET_ID) {
      await this.handlePortStatusDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_DNS_QUERY_FLOW_TARGET_ID) {
      await this.handleDnsQueryDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_FILE_HASH_FLOW_TARGET_ID) {
      await this.handleFileHashDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_FILE_BASE64_FLOW_TARGET_ID) {
      await this.handleFileBase64Delivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_RECENT_DOWNLOAD_FLOW_TARGET_ID) {
      await this.handleRecentDownloadDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_COMMON_DIRECTORY_FLOW_TARGET_ID) {
      this.handleCommonDirectoryDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_PATH_FORMAT_FLOW_TARGET_ID) {
      this.handlePathFormatDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_TEMP_TEXT_FILE_FLOW_TARGET_ID) {
      await this.handleTempTextFileDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_TEMP_DIRECTORY_FLOW_TARGET_ID) {
      await this.handleTempDirectoryDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_KEEP_AWAKE_FLOW_TARGET_ID) {
      const requestedDurationMs = resolveFlowDurationMs(session)
      const keepAwake = quickOpsRuntime.startKeepAwake(requestedDurationMs)
      this.acknowledgeFlow(session, {
        kind: 'quickops.keepAwake',
        state: 'started',
        durationMs: keepAwake.durationMs,
        durationText: formatDuration(keepAwake.durationMs),
        expiresAt: keepAwake.expiresAt
      })
      return
    }

    if (session.targetId === QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET_ID) {
      const requestedDurationMs = resolveFlowDurationMs(session)
      const systemAwake = quickOpsRuntime.startSystemAwake(requestedDurationMs)
      this.acknowledgeFlow(session, {
        kind: 'quickops.systemAwake',
        state: 'started',
        durationMs: systemAwake.durationMs,
        durationText: formatDuration(systemAwake.durationMs),
        expiresAt: systemAwake.expiresAt
      })
      return
    }

    if (session.targetId === QUICK_OPS_START_TIMER_FLOW_TARGET_ID) {
      const requestedDurationMs = resolveFlowDurationMs(session)
      const timer = quickOpsRuntime.startTimer(requestedDurationMs)
      this.acknowledgeFlow(session, {
        kind: 'quickops.startTimer',
        state: 'started',
        durationMs: timer.durationMs,
        durationText: formatDuration(timer.durationMs),
        expiresAt: timer.expiresAt
      })
      return
    }

    if (session.targetId === QUICK_OPS_PAUSE_TIMER_FLOW_TARGET_ID) {
      const timer = quickOpsRuntime.pauseTimer()
      this.acknowledgeFlow(session, {
        kind: 'quickops.pauseTimer',
        state: timer ? 'paused' : 'not-running',
        paused: Boolean(timer),
        remainingMs: timer?.remainingMs
      })
      return
    }

    if (session.targetId === QUICK_OPS_RESUME_TIMER_FLOW_TARGET_ID) {
      const timer = quickOpsRuntime.resumeTimer()
      this.acknowledgeFlow(session, {
        kind: 'quickops.resumeTimer',
        state: timer ? 'resumed' : 'not-running',
        resumed: Boolean(timer),
        durationMs: timer?.durationMs,
        durationText: timer ? formatDuration(timer.durationMs) : undefined,
        expiresAt: timer?.expiresAt
      })
      return
    }

    if (session.targetId === QUICK_OPS_START_POMODORO_FLOW_TARGET_ID) {
      const options = resolveFlowPomodoroOptions(session)
      const pomodoro = quickOpsRuntime.startPomodoro(
        options.durationMs,
        options.mode,
        options.breakDurationMs,
        options.cycles,
        options.longBreakDurationMs,
        options.longBreakEveryCycles
      )
      this.acknowledgeFlow(session, {
        kind: 'quickops.startPomodoro',
        state: 'started',
        mode: pomodoro.pomodoro?.mode ?? options.mode,
        phase: pomodoro.pomodoro?.phase,
        cycle: pomodoro.pomodoro?.cycle,
        totalCycles: pomodoro.pomodoro?.totalCycles,
        durationMs: pomodoro.durationMs,
        durationText: formatDuration(pomodoro.durationMs),
        breakDurationMs: pomodoro.pomodoro?.breakDurationMs,
        longBreakDurationMs: pomodoro.pomodoro?.longBreakDurationMs,
        longBreakEveryCycles: pomodoro.pomodoro?.longBreakEveryCycles,
        expiresAt: pomodoro.expiresAt
      })
      return
    }

    if (session.targetId === QUICK_OPS_PAUSE_POMODORO_FLOW_TARGET_ID) {
      const pomodoro = quickOpsRuntime.pausePomodoro()
      this.acknowledgeFlow(session, {
        kind: 'quickops.pausePomodoro',
        state: pomodoro ? 'paused' : 'not-running',
        paused: Boolean(pomodoro),
        remainingMs: pomodoro?.remainingMs,
        phase: pomodoro?.pomodoro?.phase,
        cycle: pomodoro?.pomodoro?.cycle
      })
      return
    }

    if (session.targetId === QUICK_OPS_RESUME_POMODORO_FLOW_TARGET_ID) {
      const pomodoro = quickOpsRuntime.resumePomodoro()
      this.acknowledgeFlow(session, {
        kind: 'quickops.resumePomodoro',
        state: pomodoro ? 'resumed' : 'not-running',
        resumed: Boolean(pomodoro),
        phase: pomodoro?.pomodoro?.phase,
        cycle: pomodoro?.pomodoro?.cycle,
        durationMs: pomodoro?.durationMs,
        durationText: pomodoro ? formatDuration(pomodoro.durationMs) : undefined,
        expiresAt: pomodoro?.expiresAt
      })
      return
    }

    if (session.targetId === QUICK_OPS_CLEAN_SCREEN_FLOW_TARGET_ID) {
      const options = resolveFlowScreenCleanOptions(session)
      const screenClean = quickOpsRuntime.startScreenClean(options.durationMs, options.screenMode)
      this.acknowledgeFlow(session, {
        kind: 'quickops.cleanScreen',
        state: 'started',
        durationMs: screenClean.durationMs,
        durationText: formatDuration(screenClean.durationMs),
        screenMode: screenClean.screenMode,
        windowCount: screenClean.windows?.length ?? 0,
        expiresAt: screenClean.expiresAt
      })
      return
    }

    if (session.targetId === QUICK_OPS_STOP_CLEAN_SCREEN_FLOW_TARGET_ID) {
      const stopped = quickOpsRuntime.stopScreenClean()
      this.acknowledgeFlow(session, {
        kind: 'quickops.stopCleanScreen',
        stopped,
        state: stopped ? 'stopped' : 'not-running'
      })
      return
    }

    if (session.targetId === QUICK_OPS_START_STOPWATCH_FLOW_TARGET_ID) {
      const stopwatch = quickOpsRuntime.startStopwatch()
      this.acknowledgeFlow(session, {
        kind: 'quickops.startStopwatch',
        state: 'started',
        ...createStopwatchFlowState(stopwatch)
      })
      return
    }

    if (session.targetId === QUICK_OPS_PAUSE_STOPWATCH_FLOW_TARGET_ID) {
      const stopwatch = quickOpsRuntime.pauseStopwatch()
      this.acknowledgeFlow(session, {
        kind: 'quickops.pauseStopwatch',
        state: stopwatch ? 'paused' : 'not-running',
        paused: Boolean(stopwatch),
        ...createStopwatchFlowState(stopwatch)
      })
      return
    }

    if (session.targetId === QUICK_OPS_RESUME_STOPWATCH_FLOW_TARGET_ID) {
      const stopwatch = quickOpsRuntime.resumeStopwatch()
      this.acknowledgeFlow(session, {
        kind: 'quickops.resumeStopwatch',
        state: stopwatch ? 'resumed' : 'not-running',
        resumed: Boolean(stopwatch),
        ...createStopwatchFlowState(stopwatch)
      })
      return
    }

    if (session.targetId === QUICK_OPS_LAP_STOPWATCH_FLOW_TARGET_ID) {
      const stopwatch = quickOpsRuntime.lapStopwatch()
      this.acknowledgeFlow(session, {
        kind: 'quickops.lapStopwatch',
        state: stopwatch ? 'recorded' : 'not-running',
        recorded: Boolean(stopwatch),
        ...createStopwatchFlowState(stopwatch)
      })
      return
    }

    if (session.targetId === QUICK_OPS_SHOW_NOTIFICATION_FLOW_TARGET_ID) {
      const request = resolveFlowNotificationRequest(session)
      const result = notificationModule.showInternalSystemNotification(request)
      this.acknowledgeFlow(session, {
        kind: 'quickops.showNotification',
        state: 'sent',
        notificationId: result.id,
        title: request.title,
        message: request.message,
        level: request.level
      })
      return
    }

    if (session.targetId === QUICK_OPS_COPY_TO_CLIPBOARD_FLOW_TARGET_ID) {
      const payload = resolveFlowClipboardPayload(session)
      if (!payload) {
        this.acknowledgeFlow(session, {
          kind: 'quickops.copyToClipboard',
          state: 'skipped',
          copied: false,
          degradedReason: 'missing-text'
        })
        return
      }

      clipboard.writeText(payload.text)
      this.acknowledgeFlow(session, {
        kind: 'quickops.copyToClipboard',
        state: 'copied',
        copied: true,
        charCount: payload.text.length,
        truncated: payload.truncated
      })
      return
    }

    if (session.targetId === QUICK_OPS_FORMAT_TEXT_FLOW_TARGET_ID) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.formatText',
        ...createQuickOpsFormatTextResponse(resolveFlowFormatTextRequest(session))
      })
      return
    }

    if (session.targetId === QUICK_OPS_OPEN_FOLDER_FLOW_TARGET_ID) {
      await this.handleOpenFolderDelivery(session)
      return
    }

    if (session.targetId === QUICK_OPS_STOP_KEEP_AWAKE_FLOW_TARGET_ID) {
      const stopped = quickOpsRuntime.stopKeepAwake()
      this.acknowledgeFlow(session, {
        kind: 'quickops.stopKeepAwake',
        stopped,
        state: stopped ? 'stopped' : 'not-running'
      })
      return
    }

    if (session.targetId === QUICK_OPS_STOP_TIMER_FLOW_TARGET_ID) {
      const stopped = quickOpsRuntime.stopTimer()
      this.acknowledgeFlow(session, {
        kind: 'quickops.stopTimer',
        stopped,
        state: stopped ? 'stopped' : 'not-running'
      })
      return
    }

    if (session.targetId === QUICK_OPS_STOP_POMODORO_FLOW_TARGET_ID) {
      const stopped = quickOpsRuntime.stopPomodoro()
      this.acknowledgeFlow(session, {
        kind: 'quickops.stopPomodoro',
        stopped,
        state: stopped ? 'stopped' : 'not-running'
      })
      return
    }

    if (session.targetId === QUICK_OPS_STOP_SYSTEM_AWAKE_FLOW_TARGET_ID) {
      const stopped = quickOpsRuntime.stopSystemAwake()
      this.acknowledgeFlow(session, {
        kind: 'quickops.stopSystemAwake',
        stopped,
        state: stopped ? 'stopped' : 'not-running'
      })
      return
    }

    if (session.targetId === QUICK_OPS_RESET_STOPWATCH_FLOW_TARGET_ID) {
      const stopped = quickOpsRuntime.resetStopwatch()
      this.acknowledgeFlow(session, {
        kind: 'quickops.resetStopwatch',
        reset: stopped,
        state: stopped ? 'reset' : 'not-running'
      })
      return
    }

    const capabilities = quickOpsRuntime.getCapabilityInfo()
    this.acknowledgeFlow(session, {
      kind: 'quickops.capabilities',
      text: formatQuickOpsCapabilityInfo(capabilities),
      capabilities
    })
  }

  private handleCommonDirectoryDelivery(session: FlowSession): void {
    this.acknowledgeFlow(session, {
      kind: 'quickops.commonDirectory',
      ...createQuickOpsCommonDirectoryResponse(resolveFlowCommonDirectoryRequest(session))
    })
  }

  private async handleOpenFolderDelivery(session: FlowSession): Promise<void> {
    const directory = resolveCommonDirectory(resolveFlowCommonDirectoryQuery(session))
    const errorMessage = await shell.openPath(directory.path)
    if (errorMessage) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.openFolder',
        state: 'failed',
        opened: false,
        directoryId: directory.id,
        path: directory.path,
        degradedReason: 'open-folder-failed',
        message: errorMessage
      })
      return
    }

    this.acknowledgeFlow(session, {
      kind: 'quickops.openFolder',
      state: 'opened',
      opened: true,
      directoryId: directory.id,
      path: directory.path
    })
  }

  private async handlePortStatusDelivery(session: FlowSession): Promise<void> {
    this.acknowledgeFlow(session, {
      kind: 'quickops.portStatus',
      ...(await createQuickOpsPortStatusResponse(resolveFlowPortRequest(session)))
    })
  }

  private async handleDnsQueryDelivery(session: FlowSession): Promise<void> {
    this.acknowledgeFlow(session, {
      kind: 'quickops.dnsQuery',
      ...(await createQuickOpsDnsQueryResponse(resolveFlowDnsQueryRequest(session)))
    })
  }

  private async handleFileHashDelivery(session: FlowSession): Promise<void> {
    this.acknowledgeFlow(session, {
      kind: 'quickops.fileHash',
      ...(await createQuickOpsFileHashResponse(resolveFlowFileHashRequest(session)))
    })
  }

  private handlePathFormatDelivery(session: FlowSession): void {
    this.acknowledgeFlow(session, {
      kind: 'quickops.pathFormat',
      ...createQuickOpsPathFormatResponse(resolveFlowPathFormatRequest(session))
    })
  }

  private async handleFileBase64Delivery(session: FlowSession): Promise<void> {
    this.acknowledgeFlow(session, {
      kind: 'quickops.fileBase64',
      ...(await createQuickOpsFileBase64Response(resolveFlowFileBase64Request(session)))
    })
  }

  private async handleTempTextFileDelivery(session: FlowSession): Promise<void> {
    const result = await createTempTextFile(resolveFlowTempTextContent(session))
    if ('degradedReason' in result) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.tempTextFile',
        state: 'degraded',
        degradedReason: result.degradedReason,
        message: result.message
      })
      return
    }

    this.acknowledgeFlow(session, {
      kind: 'quickops.tempTextFile',
      state: 'created',
      path: result.path,
      fileName: result.fileName,
      size: result.size,
      text: result.path
    })
  }

  private async handleTempDirectoryDelivery(session: FlowSession): Promise<void> {
    const result = await createTempDirectory(resolveFlowTempDirectoryName(session))
    if ('degradedReason' in result) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.tempDirectory',
        state: 'degraded',
        degradedReason: result.degradedReason,
        message: result.message
      })
      return
    }

    this.acknowledgeFlow(session, {
      kind: 'quickops.tempDirectory',
      state: 'created',
      path: result.path,
      directoryName: result.directoryName,
      text: result.path
    })
  }

  private async handleRecentDownloadDelivery(session: FlowSession): Promise<void> {
    this.acknowledgeFlow(session, {
      kind: 'quickops.recentDownload',
      ...(await createQuickOpsRecentDownloadResponse())
    })
  }

  private async handleDiskSpaceDelivery(session: FlowSession): Promise<void> {
    const response = await createQuickOpsDiskSpaceResponse()
    if (response.state === 'degraded') {
      this.acknowledgeFlow(session, {
        kind: 'quickops.diskSpace',
        ...response
      })
      return
    }

    this.acknowledgeFlow(session, {
      kind: 'quickops.diskSpace',
      ...response
    })
  }

  private async handleDirectoryUsageDelivery(session: FlowSession): Promise<void> {
    const response = await createQuickOpsDirectoryUsageResponse(
      resolveFlowDirectoryUsageOptions(session)
    )
    if (response.state === 'degraded') {
      this.acknowledgeFlow(session, {
        kind: 'quickops.directoryUsage',
        ...response
      })
      return
    }

    this.acknowledgeFlow(session, {
      kind: 'quickops.directoryUsage',
      ...response
    })
  }

  private async handleBatteryStatusDelivery(session: FlowSession): Promise<void> {
    const response = await createQuickOpsBatteryStatusResponse()
    if (response.state === 'degraded') {
      this.acknowledgeFlow(session, {
        kind: 'quickops.batteryStatus',
        ...response
      })
      return
    }

    this.acknowledgeFlow(session, {
      kind: 'quickops.batteryStatus',
      ...response
    })
  }

  private async handleSystemProxyDelivery(session: FlowSession): Promise<void> {
    this.acknowledgeFlow(session, {
      kind: 'quickops.systemProxy',
      ...(await createQuickOpsSystemProxyResponse())
    })
  }

  private async handlePublicIpDelivery(session: FlowSession): Promise<void> {
    if (!resolveFlowPublicIpOptIn(session)) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.publicIp',
        state: 'disabled',
        degradedReason: 'public-ip-disabled',
        message: 'Public IP lookup requires explicit opt-in.'
      })
      return
    }

    const result = await lookupPublicIp()
    if ('degradedReason' in result) {
      this.acknowledgeFlow(session, {
        kind: 'quickops.publicIp',
        state: 'degraded',
        degradedReason: result.degradedReason,
        message: result.message
      })
      return
    }

    this.acknowledgeFlow(session, {
      kind: 'quickops.publicIp',
      state: 'ready',
      address: result.address,
      source: result.source,
      text: `${result.address}\nSource: ${result.source}`
    })
  }

  private acknowledgeQuickOpsPolicyBlocked(
    session: FlowSession,
    degradedReason: string,
    text: string
  ): void {
    this.acknowledgeFlow(session, {
      kind: 'quickops.policyBlocked',
      state: 'blocked',
      blocked: true,
      targetId: session.targetId,
      degradedReason,
      text
    })
  }

  private acknowledgeFlow(session: FlowSession, ackPayload: Record<string, unknown>): void {
    flowBus.acknowledge(session.sessionId, ackPayload)
    this.recordFlowAudit(
      session,
      resolveQuickOpsAuditDecision(ackPayload),
      resolveQuickOpsAuditReason(ackPayload)
    )
  }

  private recordFlowAudit(
    session: FlowSession,
    decision: QuickOpsAuditEntry['decision'],
    reason?: string
  ): void {
    const now = Date.now()
    this.auditSeq += 1
    this.auditEntries.unshift({
      id: `quickops-audit-${now}-${this.auditSeq}`,
      at: now,
      source: 'flow',
      targetId: session.targetId,
      decision,
      reason,
      requiresConfirmation: isQuickOpsFlowTargetConfirmRequired(session.targetId),
      payloadKeys: getFlowPayloadKeys(session)
    })
    if (this.auditEntries.length > QUICK_OPS_AUDIT_MAX_ENTRIES) {
      this.auditEntries.length = QUICK_OPS_AUDIT_MAX_ENTRIES
    }
  }

  private createQuickOpsAuditResponse(request?: QuickOpsAuditGetRequest): QuickOpsAuditGetResponse {
    const limit = normalizeQuickOpsAuditLimit(request?.limit)
    const entries = this.auditEntries.slice(0, limit)
    return {
      state: entries.length > 0 ? 'ready' : 'empty',
      count: entries.length,
      limit,
      maxEntries: QUICK_OPS_AUDIT_MAX_ENTRIES,
      entries
    }
  }

  private disposeTransportHandlers(): void {
    while (this.transportDisposers.length > 0) {
      this.transportDisposers.pop()?.()
    }
  }

  private disposeFlowTarget(): void {
    this.flowDeliveryDisposer?.()
    this.flowDeliveryDisposer = null
    while (this.flowTargetIds.length > 0) {
      flowTargetRegistry.unregisterTarget(this.flowTargetIds.pop()!)
    }
  }
}

export const quickOpsModule = new QuickOpsModule()

async function createQuickOpsDeveloperPreviewResponse(
  request: QuickOpsDeveloperPreviewRequest
): Promise<QuickOpsDeveloperPreviewResponse> {
  const query = request.query
  if (!hasQuickOpsDeveloperCommand(query)) {
    return {
      state: 'empty',
      reason: 'not-developer-command'
    }
  }

  if (isQuickOpsDeveloperToolsDisabled()) {
    return {
      state: 'blocked',
      reason: QUICK_OPS_DEVELOPER_POLICY_REASON
    }
  }

  const ability = new QuickOpsDeveloperAbility()
  const sdkQuery = withQuickOpsDeveloperClipboardInput(query)
  const canHandle = await ability.canHandle(sdkQuery)
  if (!canHandle) {
    return {
      state: 'empty',
      reason: 'no-preview-result'
    }
  }

  const controller = new AbortController()
  const context: PreviewAbilityContext = {
    query: sdkQuery,
    signal: controller.signal
  }
  const result = await ability.execute(context)
  if (!result) {
    return {
      state: 'empty',
      reason: 'no-preview-result'
    }
  }

  return {
    state: 'ready',
    abilityId: result.abilityId,
    confidence: result.confidence,
    payload: result.payload
  }
}

async function saveQuickOpsDeveloperPreview(
  request: QuickOpsDeveloperPreviewSaveRequest
): Promise<QuickOpsDeveloperPreviewSaveResponse> {
  if (!isQrSvgPayload(request.payload)) {
    return {
      state: 'skipped',
      reason: 'not-qr-svg-payload'
    }
  }

  const svg = extractQrSvg(request.payload)
  if (!svg) {
    return {
      state: 'skipped',
      reason: 'invalid-qr-svg-payload'
    }
  }

  const data = request.format === 'png' ? renderQrSvgToPng(svg) : Buffer.from(svg, 'utf8')
  if (!data) {
    return {
      state: 'degraded',
      reason: 'qr-png-render-failed',
      message: '无法生成 QR PNG'
    }
  }

  try {
    const outputDir = path.join(app.getPath('temp'), 'tuff-quickops')
    await mkdir(outputDir, { recursive: true })
    const filePath = path.join(outputDir, `qr-code-${crypto.randomUUID()}.${request.format}`)
    await writeFile(filePath, request.format === 'svg' ? svg : data, { flag: 'wx' })
    clipboard.writeText(filePath)
    return {
      state: 'saved',
      format: request.format,
      path: filePath,
      bytes: data.length
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      state: 'degraded',
      reason:
        code === 'EACCES' || code === 'EPERM'
          ? 'developer-preview-save-permission-denied'
          : 'developer-preview-save-failed',
      message: code === 'EACCES' || code === 'EPERM' ? '没有权限写入临时文件' : '保存预览文件失败'
    }
  }
}

function isQuickOpsDeveloperToolsDisabled(): boolean {
  const appSetting = getMainConfig(StorageList.APP_SETTING) as AppSetting | undefined
  return appSetting?.quickOps?.allowDeveloperTools === false
}

function withQuickOpsDeveloperClipboardInput(
  query: QuickOpsDeveloperPreviewRequest['query']
): QuickOpsDeveloperPreviewRequest['query'] {
  if (query.inputs?.some((input) => input.content?.trim() || input.rawContent?.trim())) {
    return query
  }

  const text = clipboard.readText().trim()
  if (!text) return query

  return {
    ...query,
    inputs: [
      ...(query.inputs ?? []),
      {
        type: TuffInputType.Text,
        content: text
      }
    ]
  }
}

function isQrSvgPayload(payload: PreviewCardPayload): boolean {
  return payload.meta?.quickOps?.render?.kind === 'qr-code-svg'
}

function extractQrSvg(payload: PreviewCardPayload): string | null {
  const render = payload.meta?.quickOps?.render
  const dataUrl = typeof render?.dataUrl === 'string' ? render.dataUrl : payload.primaryValue
  const prefix = 'data:image/svg+xml;charset=utf-8,'
  if (!dataUrl.startsWith(prefix)) return null

  try {
    const svg = decodeURIComponent(dataUrl.slice(prefix.length))
    return svg.startsWith('<svg ') ? svg : null
  } catch {
    return null
  }
}

function renderQrSvgToPng(svg: string, scale = 8): Buffer | null {
  const size = extractQrSvgSize(svg)
  if (!size || scale < 1) return null

  const outputSize = size * scale
  const pixels = Buffer.alloc(outputSize * outputSize, 0xff)
  for (const module of extractQrSvgDarkModules(svg)) {
    if (module.x < 0 || module.y < 0 || module.x >= size || module.y >= size) continue

    const startX = module.x * scale
    const startY = module.y * scale
    const width = Math.max(1, module.width) * scale
    const height = Math.max(1, module.height) * scale
    for (let y = startY; y < Math.min(outputSize, startY + height); y += 1) {
      for (let x = startX; x < Math.min(outputSize, startX + width); x += 1) {
        pixels[y * outputSize + x] = 0x00
      }
    }
  }

  return encodeGrayscalePng(outputSize, outputSize, pixels)
}

function extractQrSvgSize(svg: string): number | null {
  const match = /\bviewBox="0 0 (?<width>\d+) (?<height>\d+)"/.exec(svg)
  const width = Number(match?.groups?.width)
  const height = Number(match?.groups?.height)
  if (!Number.isInteger(width) || width <= 0 || width !== height || width > 256) return null
  return width
}

function extractQrSvgDarkModules(svg: string): Array<{
  x: number
  y: number
  width: number
  height: number
}> {
  const groupMatch = /<g fill="#000">(?<body>.*?)<\/g>/.exec(svg)
  const body = groupMatch?.groups?.body
  if (!body) return []

  const rects: Array<{ x: number; y: number; width: number; height: number }> = []
  const rectPattern =
    /<rect x="(?<x>\d+)" y="(?<y>\d+)" width="(?<width>\d+)" height="(?<height>\d+)"\/>/g
  for (const match of body.matchAll(rectPattern)) {
    const x = Number(match.groups?.x)
    const y = Number(match.groups?.y)
    const width = Number(match.groups?.width)
    const height = Number(match.groups?.height)
    if (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      Number.isInteger(width) &&
      Number.isInteger(height)
    ) {
      rects.push({ x, y, width, height })
    }
  }
  return rects
}

function encodeGrayscalePng(width: number, height: number, pixels: Buffer): Buffer {
  const scanlines = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width + 1)
    scanlines[rowStart] = 0
    pixels.copy(scanlines, rowStart + 1, y * width, (y + 1) * width)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 0
  header[10] = 0
  header[11] = 0
  header[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createPngChunk('IHDR', header),
    createPngChunk('IDAT', deflateSync(scanlines)),
    createPngChunk('IEND', Buffer.alloc(0))
  ])
}

function createPngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(calculateCrc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function calculateCrc32(input: Buffer): number {
  let crc = 0xffffffff
  for (const byte of input) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createQuickOpsSystemInfoResponse(): QuickOpsSystemInfoGetResponse {
  const systemInfo = createSystemInfo()
  return {
    text: formatSystemInfo(systemInfo),
    systemInfo
  }
}

function createQuickOpsDiagnosticsResponse(): QuickOpsDiagnosticsGetResponse {
  const diagnostics = quickOpsRuntime.getDiagnosticsInfo()
  return {
    text: formatDiagnosticsInfo(diagnostics),
    diagnostics
  }
}

function isQuickOpsStatefulFlowTargetBlocked(targetId: string): boolean {
  return isQuickOpsFlowTargetBlockedByPolicy(
    targetId,
    QUICK_OPS_STATEFUL_FLOW_TARGET_IDS,
    QUICK_OPS_STATEFUL_POLICY_REASON
  )
}

function isQuickOpsNetworkFlowTargetBlocked(targetId: string): boolean {
  return isQuickOpsFlowTargetBlockedByPolicy(
    targetId,
    QUICK_OPS_NETWORK_FLOW_TARGET_IDS,
    QUICK_OPS_NETWORK_POLICY_REASON
  )
}

function isQuickOpsFileFlowTargetBlocked(targetId: string): boolean {
  return isQuickOpsFlowTargetBlockedByPolicy(
    targetId,
    QUICK_OPS_FILE_FLOW_TARGET_IDS,
    QUICK_OPS_FILE_POLICY_REASON
  )
}

function isQuickOpsSystemFlowTargetBlocked(targetId: string): boolean {
  return isQuickOpsFlowTargetBlockedByPolicy(
    targetId,
    QUICK_OPS_SYSTEM_FLOW_TARGET_IDS,
    QUICK_OPS_SYSTEM_POLICY_REASON
  )
}

function isQuickOpsDeveloperFlowTargetBlocked(targetId: string): boolean {
  return isQuickOpsFlowTargetBlockedByPolicy(
    targetId,
    QUICK_OPS_DEVELOPER_FLOW_TARGET_IDS,
    QUICK_OPS_DEVELOPER_POLICY_REASON
  )
}

function isQuickOpsFlowTargetConfirmRequired(targetId: string): boolean {
  const target = QUICK_OPS_ALL_FLOW_TARGETS.find((item) => item.id === targetId)
  return target?.requireConfirm === true
}

function isQuickOpsFlowTargetBlockedByPolicy(
  targetId: string,
  policyTargetIds: Set<string>,
  reason: string
): boolean {
  if (!policyTargetIds.has(targetId)) return false

  const capabilities = quickOpsRuntime.getCapabilityInfo()
  return capabilities.entries.some(
    (entry) => entry.status === 'disabled' && entry.reason === reason
  )
}

function normalizeQuickOpsAuditLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return QUICK_OPS_AUDIT_DEFAULT_LIMIT
  return Math.min(QUICK_OPS_AUDIT_MAX_LIMIT, Math.max(1, Math.floor(value)))
}

function resolveQuickOpsAuditDecision(
  ackPayload: Record<string, unknown>
): QuickOpsAuditEntry['decision'] {
  if (ackPayload.blocked === true || ackPayload.state === 'blocked') return 'blocked'
  if (ackPayload.degradedReason || ackPayload.state === 'degraded') return 'degraded'
  return 'delivered'
}

function resolveQuickOpsAuditReason(ackPayload: Record<string, unknown>): string | undefined {
  const reason = ackPayload.degradedReason
  return typeof reason === 'string' ? reason : undefined
}

function getFlowPayloadKeys(session: FlowSession): string[] {
  const data = session.payload?.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  return Object.keys(data).sort()
}

async function createQuickOpsDiskSpaceResponse(): Promise<QuickOpsDiskSpaceGetResponse> {
  const diskSpace = await createDiskSpaceInfo()
  if ('degradedReason' in diskSpace) {
    return {
      state: 'degraded',
      degradedReason: diskSpace.degradedReason,
      message: diskSpace.message
    }
  }

  return {
    state: 'ready',
    text: formatDiskSpaceInfo(diskSpace),
    diskSpace
  }
}

async function createQuickOpsDirectoryUsageResponse(
  request: QuickOpsDirectoryUsageGetRequest | void
): Promise<QuickOpsDirectoryUsageGetResponse> {
  const deep = request?.deep === true
  const directoryUsage = await createDirectoryUsageInfo(undefined, { deep })
  if ('degradedReason' in directoryUsage) {
    return {
      state: 'degraded',
      degradedReason: directoryUsage.degradedReason,
      message: directoryUsage.message,
      path: directoryUsage.path,
      scanDepth: deep ? 3 : 1
    }
  }

  return {
    state: 'ready',
    text: formatDirectoryUsageInfo(directoryUsage),
    directoryUsage
  }
}

function createQuickOpsNetworkStatusResponse(): QuickOpsNetworkStatusGetResponse {
  const networkStatus = createNetworkStatusInfo()
  return {
    text: formatNetworkStatusInfo(networkStatus),
    networkStatus
  }
}

function createQuickOpsQueryLocalIpResponse(): QuickOpsQueryLocalIpGetResponse {
  const addresses = getLocalIpAddresses()
  return {
    text: formatLocalIpInfo(addresses),
    addresses,
    degradedReason: addresses.length > 0 ? undefined : 'local-ip-unavailable'
  }
}

async function createQuickOpsPortStatusResponse(
  request: QuickOpsPortStatusGetRequest
): Promise<QuickOpsPortStatusGetResponse> {
  const port = resolveQuickOpsPortStatusPort(request)
  if (!port || !isValidTcpPort(port)) {
    return {
      state: 'degraded',
      available: false,
      port,
      degradedReason: 'invalid-port'
    }
  }

  const probe = await probeLocalTcpPort(port)
  return {
    state: probe.available ? 'available' : 'occupied',
    available: probe.available,
    port: probe.port,
    host: probe.host,
    process: probe.process,
    releaseCommand: probe.process ? createPortReleaseCommand(probe.process) : undefined,
    degradedReason: probe.degradedReason,
    errorCode: probe.errorCode
  }
}

async function createQuickOpsDnsQueryResponse(
  request: QuickOpsDnsQueryGetRequest
): Promise<QuickOpsDnsQueryGetResponse> {
  const query = resolveQuickOpsDnsQueryRequest(request)
  if (!query) {
    return {
      state: 'degraded',
      degradedReason: 'dns-query-invalid-hostname',
      message: '请输入有效域名'
    }
  }

  const dnsQuery = await createDnsQueryInfo(query.hostname, query.deep)
  if ('degradedReason' in dnsQuery) {
    return {
      state: 'degraded',
      hostname: query.hostname,
      deep: query.deep,
      degradedReason: dnsQuery.degradedReason,
      message: dnsQuery.message
    }
  }

  return {
    state: 'resolved',
    text: formatDnsQueryInfo(dnsQuery),
    dnsQuery
  }
}

async function createQuickOpsFileHashResponse(
  request: QuickOpsFileHashGetRequest
): Promise<QuickOpsFileHashGetResponse> {
  const filePath = resolveQuickOpsFileHashPath(request)
  if (!filePath) {
    return {
      state: 'degraded',
      degradedReason: 'file-hash-missing-file',
      message: '未找到要计算 Hash 的文件'
    }
  }

  const result = await computeFileHashes(filePath)
  if ('degradedReason' in result) {
    return {
      state: 'degraded',
      path: filePath,
      degradedReason: result.degradedReason,
      message: result.message
    }
  }

  return {
    state: 'hashed',
    path: result.path,
    fileName: result.fileName,
    size: result.size,
    hashes: {
      md5: result.md5,
      sha1: result.sha1,
      sha256: result.sha256
    },
    text: [`MD5 ${result.md5}`, `SHA1 ${result.sha1}`, `SHA256 ${result.sha256}`].join('\n'),
    fileHash: result
  }
}

async function createQuickOpsFileBase64Response(
  request: QuickOpsFileBase64GetRequest
): Promise<QuickOpsFileBase64GetResponse> {
  const filePath = resolveQuickOpsFileBase64Path(request)
  if (!filePath) {
    return {
      state: 'degraded',
      degradedReason: 'file-base64-missing-file',
      message: '未找到要编码的文件'
    }
  }

  const result = await encodeFileBase64(filePath)
  if ('degradedReason' in result) {
    return {
      state: 'degraded',
      path: filePath,
      degradedReason: result.degradedReason,
      message: result.message
    }
  }

  return {
    state: 'encoded',
    path: result.path,
    fileName: result.fileName,
    size: result.size,
    base64: result.base64,
    text: result.base64,
    fileBase64: result
  }
}

async function createQuickOpsRecentDownloadResponse(): Promise<QuickOpsRecentDownloadGetResponse> {
  const result = await findRecentDownloadFile()
  if ('degradedReason' in result) {
    return {
      state: 'degraded',
      degradedReason: result.degradedReason,
      message: result.message
    }
  }

  return {
    state: 'found',
    path: result.path,
    fileName: result.fileName,
    size: result.size,
    modifiedAt: result.modifiedAt,
    text: `${result.fileName}\n${result.path}`,
    recentDownload: result
  }
}

function createQuickOpsCommonDirectoryResponse(
  request?: QuickOpsCommonDirectoryGetRequest
): QuickOpsCommonDirectoryGetResponse {
  const directory = resolveCommonDirectory(resolveQuickOpsCommonDirectoryQuery(request))
  return {
    state: 'resolved',
    directoryId: directory.id,
    title: directory.title,
    subtitle: directory.subtitle,
    path: directory.path,
    text: `${directory.title}\n${directory.path}`,
    commonDirectory: directory
  }
}

function createQuickOpsPathFormatResponse(
  request: QuickOpsPathFormatGetRequest
): QuickOpsPathFormatGetResponse {
  const filePath = resolveQuickOpsPathFormatTarget(request)
  if (!filePath) {
    return {
      state: 'degraded',
      degradedReason: 'file-path-missing-file',
      message: '未找到要复制路径的文件'
    }
  }

  const info = createFilePathInfo(filePath)
  const text = [info.path, info.shellPath, info.fileUrl, info.windowsPath, info.wslPath].filter(
    (item): item is string => Boolean(item)
  )

  return {
    state: 'formatted',
    path: info.path,
    fileName: info.fileName,
    formats: {
      raw: info.path,
      shell: info.shellPath,
      fileUrl: info.fileUrl,
      windows: info.windowsPath,
      wsl: info.wslPath
    },
    text: text.join('\n'),
    pathFormat: info
  }
}

function createQuickOpsFormatTextResponse(
  request: QuickOpsFormatTextGetRequest
): QuickOpsFormatTextGetResponse {
  const payload = resolveQuickOpsFormatTextPayload(request)
  if (!payload) {
    return {
      state: 'skipped',
      degradedReason: 'missing-text'
    }
  }

  const output = formatQuickOpsText(payload.text, payload.mode)
  return {
    state: 'formatted',
    mode: payload.mode,
    inputCharCount: payload.text.length,
    outputCharCount: output.length,
    truncated: payload.truncated,
    text: output
  }
}

async function createQuickOpsBatteryStatusResponse(): Promise<QuickOpsBatteryStatusGetResponse> {
  const batteryStatus = await createBatteryStatusInfo()
  if ('degradedReason' in batteryStatus) {
    return {
      state: 'degraded',
      degradedReason: batteryStatus.degradedReason,
      message: batteryStatus.message
    }
  }

  return {
    state: 'ready',
    text: formatBatteryStatusInfo(batteryStatus),
    batteryStatus
  }
}

async function createQuickOpsSystemProxyResponse(): Promise<QuickOpsSystemProxyGetResponse> {
  const systemProxy = await createSystemProxyInfo()
  return {
    state: systemProxy.status === 'degraded' ? 'degraded' : 'ready',
    text: formatSystemProxyInfo(systemProxy),
    systemProxy,
    degradedReason: systemProxy.degradedReason,
    message: systemProxy.degradedMessage
  }
}

function createQuickOpsSessionsResponse(): QuickOpsSessionsGetResponse {
  const sessions = quickOpsRuntime.listSessions().map(createQuickOpsSessionSnapshot)
  return {
    state: sessions.length > 0 ? 'running' : 'idle',
    count: sessions.length,
    sessions,
    text: formatQuickOpsSessionSnapshots(sessions)
  }
}

function createQuickOpsSessionSnapshot(session: QuickOpsSession): QuickOpsSessionSnapshot {
  const displayDurationMs = getSessionDisplayDurationMs(session)
  const laps = session.laps ?? []
  const lastLapMs = laps[laps.length - 1]

  return {
    id: session.id,
    kind: session.kind,
    title: session.title,
    state: session.pausedAt ? 'paused' : 'running',
    startedAt: session.startedAt,
    durationMs: session.durationMs,
    displayDurationMs,
    displayDurationText: formatDuration(displayDurationMs),
    expiresAt: session.expiresAt,
    pausedAt: session.pausedAt,
    screenMode: session.screenMode,
    windowCount: session.windows?.length,
    lapCount: session.kind === 'stopwatch' ? laps.length : undefined,
    lastLapMs,
    lastLapText: typeof lastLapMs === 'number' ? formatDuration(lastLapMs) : undefined,
    pomodoro: session.pomodoro
  }
}

function formatQuickOpsSessionSnapshots(sessions: QuickOpsSessionSnapshot[]): string {
  if (sessions.length === 0) return 'QuickOps sessions: idle'

  return sessions
    .map((session) => {
      const status = session.state === 'paused' ? 'paused' : 'running'
      return `${session.title} (${session.kind}) ${status}: ${session.displayDurationText}`
    })
    .join('\n')
}

function resolveFlowDurationMs(session: FlowSession): number | undefined {
  const data = session.payload.data
  if (typeof data === 'object' && data) {
    const payload = data as Record<string, unknown>
    const durationMs = readPositiveNumber(payload.durationMs)
    if (durationMs) return durationMs

    const durationSeconds = readPositiveNumber(payload.durationSeconds)
    if (durationSeconds) return durationSeconds * 1000

    const durationMinutes = readPositiveNumber(payload.durationMinutes)
    if (durationMinutes) return durationMinutes * 60 * 1000

    if (typeof payload.text === 'string') {
      return parseDurationMs(payload.text) ?? undefined
    }
  }

  if (typeof data === 'string') {
    return parseDurationMs(data) ?? undefined
  }

  return undefined
}

function resolveFlowPortRequest(session: FlowSession): QuickOpsPortStatusGetRequest {
  const data = session.payload.data
  if (typeof data === 'number') return { port: data }
  if (typeof data === 'string') return { text: data }
  if (typeof data !== 'object' || !data) return {}

  const payload = data as Record<string, unknown>
  return {
    port:
      typeof payload.port === 'number' || typeof payload.port === 'string'
        ? payload.port
        : undefined,
    text: typeof payload.text === 'string' ? payload.text : undefined
  }
}

function resolveQuickOpsPortStatusPort(request: QuickOpsPortStatusGetRequest): number | null {
  if (typeof request.port === 'number') return request.port
  if (typeof request.port === 'string') {
    const port = Number(request.port.trim())
    return Number.isInteger(port) ? port : parsePortQuery(request.port)
  }
  return typeof request.text === 'string' ? parsePortQuery(request.text) : null
}

function resolveFlowDnsQueryRequest(session: FlowSession): QuickOpsDnsQueryGetRequest {
  const data = session.payload.data
  if (typeof data === 'string') return { text: data }
  if (typeof data !== 'object' || !data) return {}

  const payload = data as Record<string, unknown>
  return {
    hostname: typeof payload.hostname === 'string' ? payload.hostname : undefined,
    text: typeof payload.text === 'string' ? payload.text : undefined,
    deep: typeof payload.deep === 'boolean' ? payload.deep : undefined
  }
}

function resolveQuickOpsDnsQueryRequest(
  request: QuickOpsDnsQueryGetRequest
): { hostname: string; deep: boolean } | null {
  if (typeof request.text === 'string') return parseDnsQuery(request.text)
  if (typeof request.hostname === 'string') {
    const command = `${request.deep === true ? 'deep ' : ''}dns ${request.hostname}`
    return parseDnsQuery(command)
  }
  return null
}

function resolveFlowFileHashRequest(session: FlowSession): QuickOpsFileHashGetRequest {
  const data = session.payload.data
  if (typeof data === 'string') return { text: data }
  if (typeof data !== 'object' || !data) return {}

  const payload = data as Record<string, unknown>
  return {
    path: typeof payload.path === 'string' ? payload.path : undefined,
    filePath: typeof payload.filePath === 'string' ? payload.filePath : undefined,
    text: typeof payload.text === 'string' ? payload.text : undefined
  }
}

function resolveQuickOpsFileHashPath(request: QuickOpsFileHashGetRequest): string | null {
  const candidate = typeof request.path === 'string' ? request.path : request.filePath
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  if (typeof request.text === 'string') {
    return resolveFileHashPath(request.text, { text: request.text, inputs: [] })
  }
  return null
}

function resolveFlowFileBase64Request(session: FlowSession): QuickOpsFileBase64GetRequest {
  const data = session.payload.data
  if (typeof data === 'string') return { text: data }
  if (typeof data !== 'object' || !data) return {}

  const payload = data as Record<string, unknown>
  return {
    path: typeof payload.path === 'string' ? payload.path : undefined,
    filePath: typeof payload.filePath === 'string' ? payload.filePath : undefined,
    text: typeof payload.text === 'string' ? payload.text : undefined
  }
}

function resolveQuickOpsFileBase64Path(request: QuickOpsFileBase64GetRequest): string | null {
  const candidate = typeof request.path === 'string' ? request.path : request.filePath
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  if (typeof request.text === 'string') {
    return resolveFileBase64Path(request.text, { text: request.text, inputs: [] })
  }
  return null
}

function resolveFlowCommonDirectoryRequest(
  session: FlowSession
): QuickOpsCommonDirectoryGetRequest {
  const data = session.payload.data
  if (typeof data === 'string') return { text: data }
  if (typeof data !== 'object' || !data) return {}

  const payload = data as Record<string, unknown>
  return {
    folder: typeof payload.folder === 'string' ? payload.folder : undefined,
    directory: typeof payload.directory === 'string' ? payload.directory : undefined,
    query: typeof payload.query === 'string' ? payload.query : undefined,
    id: typeof payload.id === 'string' ? payload.id : undefined,
    text: typeof payload.text === 'string' ? payload.text : undefined
  }
}

function resolveQuickOpsCommonDirectoryQuery(request?: QuickOpsCommonDirectoryGetRequest): string {
  if (!request) return ''
  return request.folder ?? request.directory ?? request.query ?? request.id ?? request.text ?? ''
}

function resolveFlowPathFormatRequest(session: FlowSession): QuickOpsPathFormatGetRequest {
  const data = session.payload.data
  if (typeof data === 'string') return { text: data }
  if (typeof data !== 'object' || !data) return {}

  const payload = data as Record<string, unknown>
  return {
    path: typeof payload.path === 'string' ? payload.path : undefined,
    filePath: typeof payload.filePath === 'string' ? payload.filePath : undefined,
    text: typeof payload.text === 'string' ? payload.text : undefined
  }
}

function resolveQuickOpsPathFormatTarget(request: QuickOpsPathFormatGetRequest): string | null {
  const candidate = typeof request.path === 'string' ? request.path : request.filePath
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  if (typeof request.text === 'string') {
    return resolveFilePathTarget(request.text, { text: request.text, inputs: [] })
  }
  return null
}

function readPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

interface FlowPomodoroOptions {
  durationMs?: number
  breakDurationMs?: number
  cycles?: number
  longBreakDurationMs?: number
  longBreakEveryCycles?: number
  mode: 'focus-only' | 'cycle'
}

function resolveFlowPomodoroOptions(session: FlowSession): FlowPomodoroOptions {
  const data = session.payload.data
  if (typeof data !== 'object' || !data) {
    return {
      durationMs: typeof data === 'string' ? (parseDurationMs(data) ?? undefined) : undefined,
      mode: 'focus-only'
    }
  }

  const payload = data as Record<string, unknown>
  const durationMs =
    readPositiveNumber(payload.focusDurationMs) ??
    readPositiveNumber(payload.durationMs) ??
    readDurationVariant(payload, 'focusDuration') ??
    readDurationVariant(payload, 'duration') ??
    (typeof payload.text === 'string' ? (parseDurationMs(payload.text) ?? undefined) : undefined)
  const breakDurationMs =
    readPositiveNumber(payload.breakDurationMs) ?? readDurationVariant(payload, 'breakDuration')
  const cycles =
    readBoundedInteger(payload.cycles, 1, 12) ??
    readBoundedInteger(payload.pomodoroCycles, 1, 12) ??
    readBoundedInteger(payload.totalCycles, 1, 12)
  const longBreakDurationMs =
    readPositiveNumber(payload.longBreakDurationMs) ??
    readDurationVariant(payload, 'longBreakDuration')
  const longBreakEveryCycles = readBoundedInteger(payload.longBreakEveryCycles, 1, 12)
  const explicitMode =
    payload.mode === 'cycle' || payload.mode === 'focus-only' ? payload.mode : null
  const mode =
    explicitMode ??
    (breakDurationMs || cycles || longBreakDurationMs || longBreakEveryCycles
      ? 'cycle'
      : 'focus-only')

  return {
    durationMs,
    breakDurationMs,
    cycles,
    longBreakDurationMs,
    longBreakEveryCycles,
    mode
  }
}

function readDurationVariant(
  payload: Record<string, unknown>,
  fieldPrefix: string
): number | undefined {
  const seconds = readPositiveNumber(payload[`${fieldPrefix}Seconds`])
  if (seconds) return seconds * 1000

  const minutes = readPositiveNumber(payload[`${fieldPrefix}Minutes`])
  if (minutes) return minutes * 60 * 1000

  return undefined
}

function readBoundedInteger(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  if (value < min || value > max) return undefined
  return value
}

interface FlowScreenCleanOptions {
  durationMs?: number
  screenMode?: QuickOpsScreenCleanMode
}

function resolveFlowScreenCleanOptions(session: FlowSession): FlowScreenCleanOptions {
  const data = session.payload.data
  if (typeof data !== 'object' || !data) {
    return {
      durationMs: typeof data === 'string' ? (parseDurationMs(data) ?? undefined) : undefined,
      screenMode: typeof data === 'string' ? readScreenCleanMode(data) : undefined
    }
  }

  const payload = data as Record<string, unknown>
  const durationMs =
    readPositiveNumber(payload.durationMs) ??
    readDurationVariant(payload, 'duration') ??
    (typeof payload.text === 'string' ? (parseDurationMs(payload.text) ?? undefined) : undefined)
  const screenMode =
    readScreenCleanMode(payload.screenMode) ??
    readScreenCleanMode(payload.mode) ??
    readScreenCleanMode(payload.color) ??
    (typeof payload.text === 'string' ? readScreenCleanMode(payload.text) : undefined)

  return {
    durationMs,
    screenMode
  }
}

function readScreenCleanMode(value: unknown): QuickOpsScreenCleanMode | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim().toLowerCase()
  if (text === 'black' || text.includes('黑色') || text.includes('黑底')) return 'black'
  if (text === 'white' || text.includes('白色') || text.includes('白底')) return 'white'
  if (text === 'red' || text.includes('红色') || text.includes('红屏')) return 'red'
  if (text === 'green' || text.includes('绿色') || text.includes('绿屏')) return 'green'
  if (text === 'blue' || text.includes('蓝色') || text.includes('蓝屏')) return 'blue'
  return undefined
}

function createStopwatchFlowState(session: QuickOpsSession | null): Record<string, unknown> {
  if (!session) return {}

  const elapsedMs = getSessionDisplayDurationMs(session)
  const lastLapMs = session.laps?.at(-1)
  return {
    elapsedMs,
    elapsedText: formatDuration(elapsedMs),
    paused: Boolean(session.pausedAt),
    lapCount: session.laps?.length ?? 0,
    lastLapMs,
    lastLapText: typeof lastLapMs === 'number' ? formatDuration(lastLapMs) : undefined
  }
}

function resolveFlowDirectoryUsageOptions(session: FlowSession): { deep: boolean } {
  const data = session.payload?.data
  if (typeof data === 'string') {
    return { deep: readDirectoryUsageDeep(data) }
  }
  if (typeof data !== 'object' || !data) {
    return { deep: false }
  }

  const payload = data as Record<string, unknown>
  return {
    deep:
      payload.deep === true ||
      payload.recursive === true ||
      readDirectoryUsageDeep(payload.mode) ||
      readDirectoryUsageDeep(payload.text)
  }
}

function readDirectoryUsageDeep(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const text = value.trim().toLowerCase()
  return text === 'deep' || text === 'recursive' || text.includes('深度')
}

type FlowNotificationLevel = 'info' | 'success' | 'warning' | 'error'

interface FlowNotificationRequest {
  title?: string
  message: string
  level?: FlowNotificationLevel
  system?: {
    silent?: boolean
  }
}

function resolveFlowNotificationRequest(session: FlowSession): FlowNotificationRequest {
  const data = session.payload.data
  if (typeof data !== 'object' || !data) {
    return {
      title: 'QuickOps',
      message: readBoundedText(data, 1000) ?? 'QuickOps notification',
      level: 'info'
    }
  }

  const payload = data as Record<string, unknown>
  return {
    title: readBoundedText(payload.title, 120) ?? 'QuickOps',
    message:
      readBoundedText(payload.message, 1000) ??
      readBoundedText(payload.text, 1000) ??
      'QuickOps notification',
    level: readNotificationLevel(payload.level) ?? 'info',
    system: typeof payload.silent === 'boolean' ? { silent: payload.silent } : undefined
  }
}

function readNotificationLevel(value: unknown): FlowNotificationLevel | undefined {
  if (value === 'info' || value === 'success' || value === 'warning' || value === 'error') {
    return value
  }
  return undefined
}

function readBoundedText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

interface FlowClipboardPayload {
  text: string
  truncated: boolean
}

function resolveFlowClipboardPayload(session: FlowSession): FlowClipboardPayload | null {
  const data = session.payload.data
  if (typeof data !== 'object' || !data) {
    return readBoundedClipboardText(data)
  }

  const payload = data as Record<string, unknown>
  return (
    readBoundedClipboardText(payload.text) ??
    readBoundedClipboardText(payload.value) ??
    readBoundedClipboardText(payload.content)
  )
}

function readBoundedClipboardText(value: unknown): FlowClipboardPayload | null {
  if (typeof value !== 'string') return null
  if (value.length === 0) return null

  const maxLength = 16 * 1024
  return {
    text: value.length > maxLength ? value.slice(0, maxLength) : value,
    truncated: value.length > maxLength
  }
}

interface FlowFormatTextPayload {
  text: string
  mode: QuickOpsFormatTextMode
  truncated: boolean
}

function resolveFlowFormatTextRequest(session: FlowSession): QuickOpsFormatTextGetRequest {
  const data = session.payload.data
  if (typeof data === 'string') return { text: data }
  if (typeof data !== 'object' || !data) return {}

  const payload = data as Record<string, unknown>
  return {
    text: typeof payload.text === 'string' ? payload.text : undefined,
    value: typeof payload.value === 'string' ? payload.value : undefined,
    content: typeof payload.content === 'string' ? payload.content : undefined,
    mode: typeof payload.mode === 'string' ? payload.mode : undefined,
    format: typeof payload.format === 'string' ? payload.format : undefined
  }
}

function resolveQuickOpsFormatTextPayload(
  request: QuickOpsFormatTextGetRequest
): FlowFormatTextPayload | null {
  const text =
    readBoundedFormatText(request.text) ??
    readBoundedFormatText(request.value) ??
    readBoundedFormatText(request.content)
  if (!text) return null

  return {
    ...text,
    mode: readFormatTextMode(request.mode) ?? readFormatTextMode(request.format) ?? 'snake'
  }
}

function readFormatTextMode(value: unknown): QuickOpsFormatTextMode | null {
  if (typeof value !== 'string') return null
  const mode = value.trim().toLowerCase()
  if (mode === 'upper' || mode === 'uppercase' || mode === '大写') return 'upper'
  if (mode === 'lower' || mode === 'lowercase' || mode === '小写') return 'lower'
  if (mode === 'camel' || mode === 'camelcase' || mode === '驼峰') return 'camel'
  if (mode === 'kebab' || mode === 'kebab-case' || mode === '短横线') return 'kebab'
  if (mode === 'snake' || mode === 'snake_case' || mode === '蛇形') return 'snake'
  return null
}

function readBoundedFormatText(value: unknown): Omit<FlowFormatTextPayload, 'mode'> | null {
  if (typeof value !== 'string') return null
  if (value.length === 0) return null

  const maxLength = 16 * 1024
  return {
    text: value.length > maxLength ? value.slice(0, maxLength) : value,
    truncated: value.length > maxLength
  }
}

function formatQuickOpsText(text: string, mode: QuickOpsFormatTextMode): string {
  if (mode === 'upper') return text.toLocaleUpperCase()
  if (mode === 'lower') return text.toLocaleLowerCase()

  const tokens = tokenizeFormatText(text)
  if (mode === 'camel') {
    return tokens
      .map((token, index) =>
        index === 0 ? token : `${token.charAt(0).toLocaleUpperCase()}${token.slice(1)}`
      )
      .join('')
  }

  return tokens.join(mode === 'snake' ? '_' : '-')
}

function tokenizeFormatText(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim().toLocaleLowerCase())
    .filter(Boolean)
}

function resolveFlowCommonDirectoryQuery(session: FlowSession): string {
  const data = session.payload.data
  if (typeof data === 'string') return data
  if (typeof data !== 'object' || !data) return ''

  const payload = data as Record<string, unknown>
  return (
    readString(payload.folder) ??
    readString(payload.directory) ??
    readString(payload.query) ??
    readString(payload.id) ??
    readString(payload.text) ??
    ''
  )
}

function resolveFlowTempTextContent(session: FlowSession): string {
  const data = session.payload.data
  if (typeof data === 'string') return data
  if (typeof data !== 'object' || !data) return ''

  const payload = data as Record<string, unknown>
  return readString(payload.content) ?? readString(payload.text) ?? readString(payload.value) ?? ''
}

function resolveFlowTempDirectoryName(session: FlowSession): string {
  const data = session.payload.data
  if (typeof data === 'string') return data
  if (typeof data !== 'object' || !data) return ''

  const payload = data as Record<string, unknown>
  return (
    readString(payload.directoryName) ?? readString(payload.name) ?? readString(payload.text) ?? ''
  )
}

function resolveFlowPublicIpOptIn(session: FlowSession): boolean {
  const data = session.payload.data
  if (typeof data !== 'object' || !data) return false

  const payload = data as Record<string, unknown>
  return (
    payload.allowLookup === true ||
    payload.allowPublicIpLookup === true ||
    payload.optIn === true ||
    payload.confirmed === true
  )
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
