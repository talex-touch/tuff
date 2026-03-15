import { randomUUID } from 'node:crypto'
import os from 'node:os'
import process from 'node:process'
import { readCliConfig, writeCliConfig } from './runtime-config'

export interface CliDeviceInfo {
  deviceId: string
  deviceName: string
  devicePlatform: string
}

export async function ensureCliDeviceInfo(): Promise<CliDeviceInfo> {
  const config = await readCliConfig()
  const deviceId = config.deviceId || randomUUID()
  const deviceName = config.deviceName || os.hostname()
  const devicePlatform = `${process.platform}-${process.arch}`

  if (config.deviceId !== deviceId || config.deviceName !== deviceName) {
    await writeCliConfig({ deviceId, deviceName })
  }

  return { deviceId, deviceName, devicePlatform }
}
