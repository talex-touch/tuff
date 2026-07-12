import type {
  QuickOpsDnsQueryInfo,
  QuickOpsDnsRecord,
  QuickOpsDnsRecordType,
  QuickOpsLocalIpInfo,
  QuickOpsNetworkStatusInfo,
  QuickOpsPortProbeInfo,
  QuickOpsPortProcessInfo,
  QuickOpsProxyInfo,
  QuickOpsSystemProxyEntry,
  QuickOpsSystemProxyInfo
} from '@talex-touch/utils/transport/events/types'
import { execFile } from 'node:child_process'
import { getServers } from 'node:dns'
import {
  resolve4,
  resolve6,
  resolveCname,
  resolveMx,
  resolveNs,
  resolveSoa,
  resolveTxt
} from 'node:dns/promises'
import { createServer, isIP } from 'node:net'
import { networkInterfaces } from 'node:os'
import { promisify } from 'node:util'
import type { QuickOpsDegradedResult, QuickOpsPublicIpInfo } from './quick-ops-runtime-types'

const execFileAsync = promisify(execFile)
const PUBLIC_IP_LOOKUP_URL = 'https://api.ipify.org?format=json'
const PUBLIC_IP_LOOKUP_TIMEOUT_MS = 5_000
const PORT_QUERY_PATTERN = /(?:^|\s)(?:port|端口)\s*[:#-]?\s*(\d{1,5})(?:\s|$)/
const DNS_QUERY_COMMANDS = [
  'dns query',
  'dns lookup',
  'dns 查询',
  'dns查询',
  'dns',
  '域名解析',
  '解析域名'
]
const DEEP_DNS_QUERY_COMMANDS = [
  'deep dns query',
  'deep dns lookup',
  'deep dns',
  'dns deep',
  'dns full',
  'dns all',
  '深度 dns 查询',
  '深度dns查询',
  '深度 dns',
  '深度dns',
  '完整 dns 查询',
  '完整dns查询'
]
const BASIC_DNS_RECORD_TYPES: QuickOpsDnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX']
const DEEP_DNS_RECORD_TYPES: QuickOpsDnsRecordType[] = [
  ...BASIC_DNS_RECORD_TYPES,
  'NS',
  'TXT',
  'SOA'
]
const PROXY_ENV_NAMES = [
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'https_proxy',
  'http_proxy',
  'all_proxy',
  'no_proxy'
]

export function getLocalIpAddresses(): QuickOpsLocalIpInfo[] {
  return Object.entries(networkInterfaces())
    .flatMap(([name, values]) =>
      (values ?? []).map((value) => ({
        name,
        family: value.family,
        address: value.address,
        internal: value.internal
      }))
    )
    .filter((value) => !value.internal && value.address)
    .sort((left, right) => {
      if (left.family !== right.family) return left.family === 'IPv4' ? -1 : 1
      return left.name.localeCompare(right.name)
    })
    .map(({ name, family, address }) => ({ name, family, address }))
}

export function formatLocalIpInfo(addresses: QuickOpsLocalIpInfo[]): string {
  return addresses.length > 0
    ? addresses.map((item) => `${item.name} ${item.family} ${item.address}`).join('\n')
    : 'No non-internal local address'
}

export async function lookupPublicIp(
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<QuickOpsPublicIpInfo | QuickOpsDegradedResult> {
  if (typeof fetchImpl !== 'function') {
    return {
      degradedReason: 'public-ip-fetch-unavailable',
      message: '当前运行时不支持 fetch'
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PUBLIC_IP_LOOKUP_TIMEOUT_MS)

  try {
    const response = await fetchImpl(PUBLIC_IP_LOOKUP_URL, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      },
      signal: controller.signal
    })
    if (!response.ok) {
      return {
        degradedReason: 'public-ip-request-failed',
        message: `外部服务返回 HTTP ${response.status}`
      }
    }

    const payload = (await response.json()) as { ip?: unknown }
    const address = typeof payload.ip === 'string' ? payload.ip.trim() : ''
    if (!isValidIpAddress(address)) {
      return {
        degradedReason: 'public-ip-invalid-response',
        message: '外部服务返回了不可识别的 IP 地址'
      }
    }

    return {
      address,
      source: PUBLIC_IP_LOOKUP_URL
    }
  } catch {
    return {
      degradedReason: 'public-ip-request-failed',
      message: '无法连接公网 IP 查询服务'
    }
  } finally {
    clearTimeout(timeout)
  }
}

function isValidIpAddress(address: string): boolean {
  if (!address || address.length > 45) return false
  return isIP(address) !== 0
}

export function createNetworkStatusInfo(): QuickOpsNetworkStatusInfo {
  const proxies = getProxyEnvironmentInfo()
  return {
    addresses: getLocalIpAddresses(),
    dnsServers: getServers(),
    proxyStatus: proxies.length > 0 ? 'detected' : 'not-detected',
    proxies
  }
}

export function formatNetworkStatusInfo(info: QuickOpsNetworkStatusInfo): string {
  const addresses =
    info.addresses.length > 0
      ? info.addresses.map((item) => `${item.name} ${item.family} ${item.address}`).join('\n')
      : 'No non-internal local address'
  const dnsServers = info.dnsServers.length > 0 ? info.dnsServers.join('\n') : 'No DNS server'
  const proxyInfo =
    info.proxies.length > 0
      ? info.proxies.map((item) => `${item.source}: ${item.value}`).join('\n')
      : 'No proxy environment variable detected'

  return [
    'Local Addresses:',
    addresses,
    '',
    'DNS Servers:',
    dnsServers,
    '',
    'Proxy:',
    proxyInfo
  ].join('\n')
}

export function parseDnsQuery(text: string): { hostname: string; deep: boolean } | null {
  const normalized = text.trim()
  if (!normalized) return null

  for (const command of DEEP_DNS_QUERY_COMMANDS) {
    const pattern = new RegExp(`^${escapeRegExp(command)}\\s+(.+)$`, 'i')
    const match = normalized.match(pattern)
    const hostname = match?.[1]?.trim()
    const normalizedHostname = hostname ? normalizeDnsHostname(hostname) : null
    if (normalizedHostname) return { hostname: normalizedHostname, deep: true }
  }

  for (const command of DNS_QUERY_COMMANDS) {
    const pattern = new RegExp(`^${escapeRegExp(command)}\\s+(.+)$`, 'i')
    const match = normalized.match(pattern)
    const hostname = match?.[1]?.trim()
    const normalizedHostname = hostname ? normalizeDnsHostname(hostname) : null
    if (normalizedHostname) return { hostname: normalizedHostname, deep: false }
  }

  return null
}

export function normalizeDnsHostname(value: string): string | null {
  const withoutProtocol = value.replace(/^[a-z][a-z\d+.-]*:\/\//i, '')
  const hostname = withoutProtocol.split(/[/?#]/)[0]?.replace(/\.$/, '').trim().toLowerCase()
  if (!hostname || hostname.length > 253) return null
  if (hostname.includes('..')) return null
  if (/[^a-z0-9.-]/.test(hostname)) return null
  if (!hostname.includes('.')) return null

  const labels = hostname.split('.')
  if (
    labels.some(
      (label) =>
        label.length === 0 || label.length > 63 || label.startsWith('-') || label.endsWith('-')
    )
  ) {
    return null
  }

  return hostname
}

export async function createDnsQueryInfo(
  hostname: string,
  deep = false
): Promise<
  | QuickOpsDnsQueryInfo
  | {
      degradedReason: string
      message: string
    }
> {
  const normalizedHostname = normalizeDnsHostname(hostname)
  if (!normalizedHostname) {
    return {
      degradedReason: 'dns-query-invalid-hostname',
      message: '请输入有效域名'
    }
  }

  const results = await Promise.allSettled([
    resolve4(normalizedHostname),
    resolve6(normalizedHostname),
    resolveCname(normalizedHostname),
    resolveMx(normalizedHostname),
    ...(deep
      ? [
          resolveNs(normalizedHostname),
          resolveTxt(normalizedHostname),
          resolveSoa(normalizedHostname)
        ]
      : [])
  ])
  const records: QuickOpsDnsRecord[] = []
  const failedTypes: QuickOpsDnsRecordType[] = []

  appendDnsRecordResults(records, failedTypes, 'A', results[0])
  appendDnsRecordResults(records, failedTypes, 'AAAA', results[1])
  appendDnsRecordResults(records, failedTypes, 'CNAME', results[2])
  appendDnsRecordResults(records, failedTypes, 'MX', results[3])
  if (deep) {
    appendDnsRecordResults(records, failedTypes, 'NS', results[4])
    appendDnsRecordResults(records, failedTypes, 'TXT', results[5])
    appendDnsRecordResults(records, failedTypes, 'SOA', results[6])
  }

  if (records.length === 0) {
    return {
      degradedReason: 'dns-query-no-records',
      message: `未解析到 ${getDnsRecordTypes(deep).join(' / ')} 记录`
    }
  }

  return {
    hostname: normalizedHostname,
    records,
    failedTypes,
    deep
  }
}

export function formatDnsQueryInfo(info: QuickOpsDnsQueryInfo): string {
  const grouped = new Map<QuickOpsDnsRecordType, QuickOpsDnsRecord[]>()
  info.records.forEach((record) => {
    const records = grouped.get(record.type) ?? []
    records.push(record)
    grouped.set(record.type, records)
  })

  const sections = [`Host: ${info.hostname}`]
  getDnsRecordTypes(info.deep).forEach((type) => {
    const records = grouped.get(type)
    if (!records?.length) return
    sections.push(
      `${type}:`,
      ...records.map((record) =>
        record.type === 'MX' && record.priority !== undefined
          ? `${record.priority} ${record.value}`
          : record.value
      )
    )
  })

  if (info.failedTypes.length > 0) {
    sections.push(`Unavailable: ${info.failedTypes.join(', ')}`)
  }

  return sections.join('\n')
}

export function getProxyEnvironmentInfo(env: NodeJS.ProcessEnv = process.env): QuickOpsProxyInfo[] {
  return PROXY_ENV_NAMES.flatMap((name) => {
    const value = env[name]?.trim()
    return value ? [{ source: name, value: redactProxyValue(value) }] : []
  })
}

export async function createSystemProxyInfo(): Promise<QuickOpsSystemProxyInfo> {
  const environment = getProxyEnvironmentInfo()
  try {
    const system = await getSystemProxyEntries()
    return {
      platform: process.platform,
      status: environment.length + system.length > 0 ? 'detected' : 'not-detected',
      environment,
      system
    }
  } catch (error) {
    return {
      platform: process.platform,
      status: 'degraded',
      environment,
      system: [],
      degradedReason: 'system-proxy-probe-failed',
      degradedMessage: error instanceof Error ? error.message : 'Unable to read system proxy'
    }
  }
}

export function formatSystemProxyInfo(info: QuickOpsSystemProxyInfo): string {
  const envText =
    info.environment.length > 0
      ? info.environment.map((item) => `${item.source}: ${item.value}`).join('\n')
      : 'No proxy environment variable detected'
  const systemText =
    info.system.length > 0
      ? info.system.map((item) => `${item.name}: ${item.value}`).join('\n')
      : 'No enabled system proxy detected'
  const statusText =
    info.status === 'degraded' && info.degradedMessage
      ? `${info.status} (${info.degradedMessage})`
      : info.status

  return [
    `Platform: ${info.platform}`,
    `Status: ${statusText}`,
    '',
    'Environment Proxy:',
    envText,
    '',
    'System Proxy:',
    systemText,
    '',
    'Safety: read-only local proxy settings; credentials redacted; no external connectivity check'
  ].join('\n')
}

async function getSystemProxyEntries(): Promise<QuickOpsSystemProxyEntry[]> {
  if (process.platform === 'darwin') return getMacSystemProxyEntries()
  if (process.platform === 'win32') return getWindowsSystemProxyEntries()
  if (process.platform === 'linux') return getLinuxSystemProxyEntries()
  return []
}

async function getMacSystemProxyEntries(): Promise<QuickOpsSystemProxyEntry[]> {
  const { stdout } = await execFileAsync('scutil', ['--proxy'], { timeout: 3000 })
  return parseMacSystemProxyEntries(stdout)
}

async function getWindowsSystemProxyEntries(): Promise<QuickOpsSystemProxyEntry[]> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      [
        "$settings = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
        '[PSCustomObject]@{',
        'ProxyEnable=$settings.ProxyEnable;',
        'ProxyServer=$settings.ProxyServer;',
        'AutoConfigURL=$settings.AutoConfigURL;',
        'ProxyOverride=$settings.ProxyOverride',
        '} | ConvertTo-Json -Compress'
      ].join(' ')
    ],
    { timeout: 5000 }
  )
  return parseWindowsSystemProxyEntries(stdout)
}

async function getLinuxSystemProxyEntries(): Promise<QuickOpsSystemProxyEntry[]> {
  const { stdout } = await execFileAsync('gsettings', ['get', 'org.gnome.system.proxy', 'mode'], {
    timeout: 3000
  })
  return parseLinuxSystemProxyEntries(stdout)
}

export function parseMacSystemProxyEntries(stdout: string): QuickOpsSystemProxyEntry[] {
  const values = new Map<string, string>()
  stdout.split(/\r?\n/).forEach((line) => {
    const match = /^\s*([A-Za-z][A-Za-z0-9]+)\s*:\s*(.+?)\s*$/.exec(line)
    if (!match?.[1] || !match[2]) return
    values.set(match[1], match[2])
  })

  const entries: QuickOpsSystemProxyEntry[] = []
  appendMacProxyEntry(entries, values, 'HTTP', 'HTTPEnable', 'HTTPProxy', 'HTTPPort')
  appendMacProxyEntry(entries, values, 'HTTPS', 'HTTPSEnable', 'HTTPSProxy', 'HTTPSPort')
  appendMacProxyEntry(entries, values, 'SOCKS', 'SOCKSEnable', 'SOCKSProxy', 'SOCKSPort')

  if (values.get('ProxyAutoConfigEnable') === '1') {
    const pacUrl = values.get('ProxyAutoConfigURLString')
    entries.push({
      source: 'macos-system',
      name: 'PAC',
      value: pacUrl ? redactProxyValue(pacUrl) : 'enabled'
    })
  }

  if (values.get('ProxyAutoDiscoveryEnable') === '1') {
    entries.push({
      source: 'macos-system',
      name: 'Auto Discovery',
      value: 'enabled'
    })
  }

  return entries
}

export function parseWindowsSystemProxyEntries(stdout: string): QuickOpsSystemProxyEntry[] {
  const trimmed = stdout.trim()
  if (!trimmed) return []

  const payload = JSON.parse(trimmed) as
    | {
        ProxyEnable?: number | boolean | string
        ProxyServer?: string
        AutoConfigURL?: string
        ProxyOverride?: string
      }
    | Array<{
        ProxyEnable?: number | boolean | string
        ProxyServer?: string
        AutoConfigURL?: string
        ProxyOverride?: string
      }>
  const settings = Array.isArray(payload) ? payload[0] : payload
  if (!settings) return []

  const entries: QuickOpsSystemProxyEntry[] = []
  if (isTruthyProxyFlag(settings.ProxyEnable) && settings.ProxyServer) {
    entries.push({
      source: 'windows-system',
      name: 'ProxyServer',
      value: redactProxyValue(settings.ProxyServer)
    })
  }
  if (settings.AutoConfigURL) {
    entries.push({
      source: 'windows-system',
      name: 'AutoConfigURL',
      value: redactProxyValue(settings.AutoConfigURL)
    })
  }
  if (settings.ProxyOverride) {
    entries.push({
      source: 'windows-system',
      name: 'ProxyOverride',
      value: settings.ProxyOverride
    })
  }

  return entries
}

export function parseLinuxSystemProxyEntries(stdout: string): QuickOpsSystemProxyEntry[] {
  const mode = stdout.trim().replace(/^['"]|['"]$/g, '')
  if (!mode || mode === 'none') return []

  return [
    {
      source: 'linux-gsettings',
      name: 'GNOME Proxy Mode',
      value: mode
    }
  ]
}

export function parsePortQuery(text: string): number | null {
  const match = text.match(PORT_QUERY_PATTERN)
  if (!match?.[1]) return null

  const port = Number(match[1])
  return Number.isInteger(port) ? port : null
}

export function isValidTcpPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535
}

export function createPortReleaseCommand(processInfo: QuickOpsPortProcessInfo): string {
  if (processInfo.source === 'windows-nettcpconnection') {
    return `Stop-Process -Id ${processInfo.pid}`
  }

  return `kill ${processInfo.pid}`
}

export function probeLocalTcpPort(
  port: number,
  host = '127.0.0.1'
): Promise<QuickOpsPortProbeInfo> {
  return new Promise((resolve) => {
    const server = createServer()
    let settled = false

    const settle = (result: QuickOpsPortProbeInfo): void => {
      if (settled) return
      settled = true
      server.removeAllListeners()
      if (server.listening) {
        server.close(() => resolve(result))
        return
      }
      resolve(result)
    }

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EADDRINUSE') {
        settle({
          port,
          host,
          available: false,
          degradedReason: 'port-probe-failed',
          errorCode: error.code
        })
        return
      }

      void getPortProcessInfo(port)
        .catch(() => null)
        .then((processInfo) =>
          settle({
            port,
            host,
            available: false,
            process: processInfo ?? undefined,
            degradedReason: 'port-occupied',
            errorCode: error.code
          })
        )
    })
    server.listen({ port, host, exclusive: true }, () => {
      settle({ port, host, available: true })
    })
  })
}

export async function getPortProcessInfo(port: number): Promise<QuickOpsPortProcessInfo | null> {
  if (!isValidTcpPort(port)) return null

  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        [
          `$connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
          '$connections | Select-Object -First 1 -ExpandProperty OwningProcess | ForEach-Object {',
          '$p = Get-Process -Id $_ -ErrorAction SilentlyContinue',
          '[PSCustomObject]@{ Pid = $_; Name = $p.ProcessName; Path = $p.Path } | ConvertTo-Json -Compress',
          '}'
        ].join('; ')
      ],
      { timeout: 1200, windowsHide: true }
    )
    return parseWindowsPortProcessInfo(stdout)
  }

  if (process.platform === 'darwin' || process.platform === 'linux') {
    const { stdout } = await execFileAsync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'pc'],
      { timeout: 1200 }
    )
    return parseLsofPortProcessInfo(stdout)
  }

  return null
}

export function parseLsofPortProcessInfo(output: string): QuickOpsPortProcessInfo | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  let pid: number | null = null
  let command: string | undefined

  for (const line of lines) {
    const prefix = line[0]
    const value = line.slice(1).trim()
    if (prefix === 'p') {
      const parsedPid = Number(value)
      if (Number.isInteger(parsedPid) && parsedPid > 0) pid = parsedPid
      continue
    }
    if (prefix === 'c' && value) command = value
  }

  if (pid === null) return null
  return {
    pid,
    name: command,
    command,
    source: 'lsof'
  }
}

export function parseWindowsPortProcessInfo(output: string): QuickOpsPortProcessInfo | null {
  const trimmed = output.trim()
  if (!trimmed) return null

  const data = JSON.parse(trimmed) as
    | {
        Pid?: number | string
        Name?: string
        Path?: string
      }
    | Array<{
        Pid?: number | string
        Name?: string
        Path?: string
      }>
  const processInfo = Array.isArray(data) ? data[0] : data
  if (!processInfo?.Pid) return null

  const pid = Number(processInfo.Pid)
  if (!Number.isInteger(pid) || pid <= 0) return null

  return {
    pid,
    name: processInfo.Name || undefined,
    command: processInfo.Path || processInfo.Name || undefined,
    source: 'windows-nettcpconnection'
  }
}
function redactProxyValue(value: string): string {
  try {
    const parsed = new URL(value)
    if (parsed.host || parsed.username || parsed.password) {
      if (parsed.username) parsed.username = '***'
      if (parsed.password) parsed.password = '***'
      return parsed.toString()
    }
  } catch {
    // Fall through to non-URL proxy formats such as host lists and Windows ProxyServer values.
  }

  const redactedInlineCredentials = value.replace(/([=;]|^)([^=;@\s]+):([^=;@\s]+)@/g, '$1***:***@')
  if (redactedInlineCredentials !== value) return redactedInlineCredentials

  return value.replace(/^([^@\s]+)@/, '***@')
}

function appendMacProxyEntry(
  entries: QuickOpsSystemProxyEntry[],
  values: Map<string, string>,
  name: string,
  enabledKey: string,
  hostKey: string,
  portKey: string
): void {
  if (values.get(enabledKey) !== '1') return

  const host = values.get(hostKey)
  const port = values.get(portKey)
  entries.push({
    source: 'macos-system',
    name,
    value: redactProxyHostPort(host, port)
  })
}

function redactProxyHostPort(host: string | undefined, port: string | undefined): string {
  if (!host) return 'enabled'
  const redactedHost = redactProxyValue(host)
  return port ? `${redactedHost}:${port}` : redactedHost
}

function isTruthyProxyFlag(value: number | boolean | string | undefined): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') return ['1', 'true'].includes(value.trim().toLowerCase())
  return false
}
function appendDnsRecordResults(
  records: QuickOpsDnsRecord[],
  failedTypes: QuickOpsDnsRecordType[],
  type: QuickOpsDnsRecordType,
  result:
    | PromiseSettledResult<
        string[] | string[][] | Array<{ exchange: string; priority: number }> | { nsname: string }
      >
    | undefined
): void {
  if (!result || result.status === 'rejected') {
    failedTypes.push(type)
    return
  }

  if (type === 'SOA') {
    const value = (result.value as { nsname?: string }).nsname
    if (!value) {
      failedTypes.push(type)
      return
    }
    records.push({ type, value })
    return
  }

  if ((result.value as unknown[]).length === 0) {
    failedTypes.push(type)
    return
  }

  if (type === 'MX') {
    ;(result.value as Array<{ exchange: string; priority: number }>).forEach((record) => {
      records.push({
        type,
        value: record.exchange,
        priority: record.priority
      })
    })
    return
  }

  if (type === 'TXT') {
    ;(result.value as string[][]).forEach((record) => {
      records.push({ type, value: record.join('') })
    })
    return
  }

  ;(result.value as string[]).forEach((value) => {
    records.push({ type, value })
  })
}

function getDnsRecordTypes(deep: boolean): QuickOpsDnsRecordType[] {
  return deep ? DEEP_DNS_RECORD_TYPES : BASIC_DNS_RECORD_TYPES
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
