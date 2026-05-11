import { statfs } from 'node:fs/promises'
import os from 'node:os'
import process from 'node:process'

type ServeStatStatus = 'available' | 'degraded' | 'unavailable'

interface CoreLoadStat {
  rawLoad: number
  rawLoadIdle: number
}

export interface PilotServeStat {
  status: ServeStatStatus
  reason?: string
  runtime: {
    npmVersion: string
    nodeVersion: string
    os: string
    arch: string
  }
  cpu: {
    manufacturer: string
    brand: string
    physicalCores: number
    model: string
    speed: number
    rawCurrentLoad: number
    rawCurrentLoadIdle: number
    coresLoad: CoreLoadStat[]
  }
  disk: {
    size: number
    used: number
    available: number
  }
  memory: {
    total: number
    available: number
  }
}

function sumCpuTimes(times: os.CpuInfo['times']): number {
  return times.user + times.nice + times.sys + times.idle + times.irq
}

function inferCpuManufacturer(model: string): string {
  const normalizedModel = model.toLowerCase()
  if (normalizedModel.includes('apple')) {
    return 'Apple'
  }
  if (normalizedModel.includes('intel')) {
    return 'Intel'
  }
  if (normalizedModel.includes('amd')) {
    return 'AMD'
  }
  return 'unknown'
}

function resolveNpmVersion(): string {
  const userAgent = process.env.npm_config_user_agent || ''
  const match = userAgent.match(/\bnpm\/([^ ]+)/)
  return match?.[1] || 'unknown'
}

async function collectDiskStat(): Promise<{ status: ServeStatStatus, reason?: string, disk: PilotServeStat['disk'] }> {
  try {
    const fsStat = await statfs(process.cwd())
    const blockSize = Number(fsStat.bsize || 0)
    const size = Number(fsStat.blocks || 0) * blockSize
    const available = Number(fsStat.bavail || 0) * blockSize
    return {
      status: 'available',
      disk: {
        size,
        available,
        used: Math.max(0, size - available),
      },
    }
  }
  catch (error) {
    return {
      status: 'degraded',
      reason: error instanceof Error ? error.message : 'disk metrics unavailable',
      disk: {
        size: 0,
        used: 0,
        available: 0,
      },
    }
  }
}

export async function buildPilotServeStat(): Promise<PilotServeStat> {
  const cpus = os.cpus()
  const coresLoad = cpus.map((cpu) => {
    const total = sumCpuTimes(cpu.times)
    return {
      rawLoad: Math.max(0, total - cpu.times.idle),
      rawLoadIdle: cpu.times.idle,
    }
  })
  const rawCurrentLoad = coresLoad.reduce((sum, item) => sum + item.rawLoad, 0)
  const rawCurrentLoadIdle = coresLoad.reduce((sum, item) => sum + item.rawLoadIdle, 0)
  const firstCpu = cpus[0]
  const diskStat = await collectDiskStat()

  if (!firstCpu) {
    return {
      status: 'unavailable',
      reason: 'cpu metrics unavailable',
      runtime: {
        npmVersion: resolveNpmVersion(),
        nodeVersion: process.version,
        os: process.platform,
        arch: process.arch,
      },
      cpu: {
        manufacturer: 'unknown',
        brand: 'unknown',
        physicalCores: 0,
        model: process.arch,
        speed: 0,
        rawCurrentLoad: 0,
        rawCurrentLoadIdle: 0,
        coresLoad: [],
      },
      disk: diskStat.disk,
      memory: {
        total: os.totalmem(),
        available: os.freemem(),
      },
    }
  }

  return {
    status: diskStat.status,
    reason: diskStat.reason,
    runtime: {
      npmVersion: resolveNpmVersion(),
      nodeVersion: process.version,
      os: process.platform,
      arch: process.arch,
    },
    cpu: {
      manufacturer: inferCpuManufacturer(firstCpu.model),
      brand: firstCpu.model || 'unknown',
      physicalCores: cpus.length,
      model: process.arch,
      speed: Math.round(cpus.reduce((sum, cpu) => sum + cpu.speed, 0) / cpus.length),
      rawCurrentLoad,
      rawCurrentLoadIdle,
      coresLoad,
    },
    disk: diskStat.disk,
    memory: {
      total: os.totalmem(),
      available: os.freemem(),
    },
  }
}
