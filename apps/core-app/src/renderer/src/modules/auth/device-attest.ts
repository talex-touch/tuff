import { appSetting } from '~/modules/channel/storage'
import { getAppDeviceId, getAuthBaseUrl, isLocalAuthMode } from './auth-env'

const MACHINE_CODE_VERSION = 'mc_v1'
const MACHINE_SEED_SECURE_KEY = 'sync.machine-seed.v1'

type GenericRecord = Record<string, unknown>

function ensureSecuritySettings() {
  if (!appSetting.security) {
    appSetting.security = {
      machineSeed: '',
      machineCodeHash: '',
      machineCodeAttestedAt: '',
      machineSeedMigratedAt: '',
      allowLegacyMachineSeedFallback: false
    }
  }
}

function allowLegacyMachineSeedFallback(): boolean {
  ensureSecuritySettings()
  return appSetting.security.allowLegacyMachineSeedFallback === true
}

function clearLegacyMachineSeed(reason: string): void {
  ensureSecuritySettings()
  const legacySeed =
    typeof appSetting.security.machineSeed === 'string'
      ? appSetting.security.machineSeed.trim()
      : ''
  if (!legacySeed) {
    return
  }

  appSetting.security.machineSeed = ''
  appSetting.security.machineSeedMigratedAt = new Date().toISOString()
  console.warn('[device-attest] Cleared legacy plaintext machine seed:', reason)
}

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes)
  crypto.getRandomValues(data)
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function getOrInitMachineSeed(deps: {
  getSecureValue: (key: string) => Promise<string | null>
  setSecureValue: (key: string, value: string | null) => Promise<void>
}): Promise<string> {
  ensureSecuritySettings()
  const legacySeed =
    typeof appSetting.security.machineSeed === 'string'
      ? appSetting.security.machineSeed.trim()
      : ''

  try {
    const secureSeed = (await deps.getSecureValue(MACHINE_SEED_SECURE_KEY))?.trim() ?? ''
    if (secureSeed) {
      clearLegacyMachineSeed('secure-seed-found')
      return secureSeed
    }

    const nextSeed = legacySeed || randomHex(32)
    await deps.setSecureValue(MACHINE_SEED_SECURE_KEY, nextSeed)
    clearLegacyMachineSeed('migrated-to-secure-store')
    return nextSeed
  } catch (error) {
    if (allowLegacyMachineSeedFallback() && legacySeed) {
      console.warn('[device-attest] Using legacy plaintext machine seed fallback', error)
      return legacySeed
    }

    if (allowLegacyMachineSeedFallback()) {
      const nextSeed = randomHex(32)
      appSetting.security.machineSeed = nextSeed
      return nextSeed
    }

    throw new Error('Secure machine seed unavailable')
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asRecord(value: unknown): GenericRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  return value as GenericRecord
}

function extractFingerprint(osInfo: unknown): string {
  const info = asRecord(osInfo)
  const platform = asString(info?.platform) ?? 'unknown'
  const arch = asString(info?.arch) ?? 'unknown'

  const cpus = Array.isArray(info?.cpus) ? info.cpus : []
  const cpuModels = cpus
    .map((cpu) => {
      const cpuInfo = asRecord(cpu)
      return asString(cpuInfo?.model)?.trim() ?? ''
    })
    .filter(Boolean)
  const cpuModelUniq = Array.from(new Set(cpuModels)).sort()

  const macs: string[] = []
  const nics = asRecord(info?.networkInterfaces)
  if (nics) {
    for (const entries of Object.values(nics)) {
      if (!Array.isArray(entries)) continue
      for (const item of entries) {
        const nicItem = asRecord(item)
        const mac = asString(nicItem?.mac)?.toLowerCase() ?? ''
        const isInternal = Boolean(nicItem?.internal)
        if (!mac || mac === '00:00:00:00:00:00' || isInternal) continue
        macs.push(mac)
      }
    }
  }
  const uniqMacs = Array.from(new Set(macs)).sort()

  return [
    `p:${platform}`,
    `a:${arch}`,
    `c:${cpuModelUniq.join(',')}`,
    `m:${uniqMacs.join(',')}`
  ].join('|')
}

async function sha256Hex(input: string): Promise<string> {
  if (!crypto?.subtle?.digest) {
    throw new Error('WebCrypto subtle.digest not available')
  }
  const encoded = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeBearerToken(token: string): string {
  const trimmed = token.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('Bearer ') ? trimmed : `Bearer ${trimmed}`
}

export async function attestCurrentDevice(
  token: string,
  deps: {
    getOS: () => Promise<unknown>
    getSecureValue: (key: string) => Promise<string | null>
    setSecureValue: (key: string, value: string | null) => Promise<void>
  }
): Promise<void> {
  if (isLocalAuthMode()) return

  const deviceId = getAppDeviceId()
  if (!deviceId) return

  const seed = await getOrInitMachineSeed(deps)
  const osInfo = await deps.getOS()
  const fingerprint = extractFingerprint(osInfo)
  const machineCodeHash = await sha256Hex(`${MACHINE_CODE_VERSION}|${seed}|${fingerprint}`)

  ensureSecuritySettings()
  const lastHash =
    typeof appSetting.security.machineCodeHash === 'string'
      ? appSetting.security.machineCodeHash.trim()
      : ''
  if (lastHash === machineCodeHash) return

  const url = new URL('/api/v1/devices/attest', getAuthBaseUrl()).toString()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: normalizeBearerToken(token),
      'content-type': 'application/json',
      'x-device-id': deviceId
    },
    body: JSON.stringify({ machine_code_hash: machineCodeHash })
  })
  if (!response.ok) {
    throw new Error(`Attest failed: ${response.status} ${response.statusText}`)
  }

  appSetting.security.machineCodeHash = machineCodeHash
  appSetting.security.machineCodeAttestedAt = new Date().toISOString()
}
