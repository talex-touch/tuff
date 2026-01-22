import os from 'node:os'
import process from 'node:process'
import { PollingService } from '@talex-touch/utils/common/utils/polling'

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
  private static instanceCounter = 0
  private readonly pollingService = PollingService.getInstance()
  private readonly taskId = `system-sampler.${SystemSampler.instanceCounter++}`
  private isRunning = false

  constructor(
    private handler: SampleHandler,
    private intervalMs = 5_000,
    private now: () => number = () => Date.now()
  ) {}

  start(): void {
    if (this.isRunning) return
    this.isRunning = true
    this.collect()
    this.pollingService.register(this.taskId, () => this.collect(), {
      interval: this.intervalMs,
      unit: 'milliseconds'
    })
    this.pollingService.start()
  }

  stop(): void {
    if (!this.isRunning) return
    this.pollingService.unregister(this.taskId)
    this.isRunning = false
  }

  private collect(): void {
    const memoryUsage = process.memoryUsage()
    const processMetrics = process as NodeJS.Process & {
      getSystemMemoryInfo?: () => { total: number; free?: number; available?: number }
      getCPUUsage?: () => { percentCPUUsage: number }
    }
    const systemMemory =
      typeof processMetrics.getSystemMemoryInfo === 'function'
        ? processMetrics.getSystemMemoryInfo()
        : null

    const totalMemoryBytes = systemMemory ? systemMemory.total * 1024 : os.totalmem()
    const availableMemory =
      systemMemory && 'available' in systemMemory
        ? (systemMemory as { available?: number }).available
        : undefined
    const freeMemoryBytes = systemMemory
      ? (systemMemory.free ?? availableMemory ?? 0) * 1024
      : os.freemem()

    const cpuUsage =
      typeof processMetrics.getCPUUsage === 'function'
        ? processMetrics.getCPUUsage().percentCPUUsage
        : 0

    const sample: SystemSample = {
      cpuUsage: Number.isFinite(cpuUsage) ? cpuUsage : 0,
      memoryUsed: totalMemoryBytes - freeMemoryBytes,
      memoryTotal: totalMemoryBytes,
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      timestamp: this.now()
    }

    this.handler(sample)
  }
}
