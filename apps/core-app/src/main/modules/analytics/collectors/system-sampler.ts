import os from 'node:os'
import process from 'node:process'

export interface SystemSample {
  cpuUsage: number
  memoryUsed: number
  memoryTotal: number
  heapUsed: number
  heapTotal: number
  timestamp: number
}

type SampleHandler = (sample: SystemSample) => void

/**
 * Lightweight system sampler that periodically emits CPU and memory usage.
 */
export class SystemSampler {
  private timer?: NodeJS.Timeout

  constructor(
    private handler: SampleHandler,
    private intervalMs = 5_000,
    private now: () => number = () => Date.now(),
  ) {}

  start(): void {
    if (this.timer)
      return
    this.collect()
    this.timer = setInterval(() => this.collect(), this.intervalMs)
  }

  stop(): void {
    if (!this.timer)
      return
    clearInterval(this.timer)
    this.timer = undefined
  }

  private collect(): void {
    const memoryUsage = process.memoryUsage()
    const systemMemory = typeof (process as any).getSystemMemoryInfo === 'function'
      ? (process as any).getSystemMemoryInfo()
      : null

    const totalMemoryBytes = systemMemory
      ? systemMemory.total * 1024
      : os.totalmem()
    const freeMemoryBytes = systemMemory
      ? (systemMemory.free ?? systemMemory.available ?? 0) * 1024
      : os.freemem()

    const cpuUsage = typeof (process as any).getCPUUsage === 'function'
      ? (process as any).getCPUUsage().percentCPUUsage
      : 0

    const sample: SystemSample = {
      cpuUsage: Number.isFinite(cpuUsage) ? cpuUsage : 0,
      memoryUsed: totalMemoryBytes - freeMemoryBytes,
      memoryTotal: totalMemoryBytes,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      timestamp: this.now(),
    }

    this.handler(sample)
  }
}
