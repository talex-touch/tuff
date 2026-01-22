import type { CoreMetrics } from '@talex-touch/utils/analytics'

/**
 * Simple IPC tracer that aggregates latency and error counts.
 */
export class IpcTracer {
  private latencies: number[] = []
  private errorCount = 0
  private requestCount = 0
  private slowRequests = 0

  constructor(private slowThresholdMs = 100) {}

  track(durationMs: number, success = true): void {
    this.requestCount += 1
    this.latencies.push(durationMs)

    if (durationMs > this.slowThresholdMs) {
      this.slowRequests += 1
    }

    if (!success) {
      this.errorCount += 1
    }
  }

  snapshot(): CoreMetrics['ipc'] {
    if (!this.latencies.length) {
      return {
        requestCount: this.requestCount,
        avgLatency: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        errorCount: this.errorCount,
        slowRequests: this.slowRequests
      }
    }

    const sorted = [...this.latencies].sort((a, b) => a - b)
    const percentile = (p: number) => {
      const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
      return sorted[idx]
    }

    const avgLatency = this.latencies.reduce((acc, cur) => acc + cur, 0) / this.latencies.length

    return {
      requestCount: this.requestCount,
      avgLatency,
      p50Latency: percentile(50),
      p95Latency: percentile(95),
      p99Latency: percentile(99),
      errorCount: this.errorCount,
      slowRequests: this.slowRequests
    }
  }

  reset(): void {
    this.latencies = []
    this.errorCount = 0
    this.requestCount = 0
    this.slowRequests = 0
  }
}
