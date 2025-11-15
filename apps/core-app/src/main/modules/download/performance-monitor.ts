/**
 * Performance monitoring for download center
 */

export interface PerformanceMetrics {
  operationName: string
  duration: number
  timestamp: number
  metadata?: Record<string, any>
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = []
  private maxMetrics = 1000 // Keep last 1000 metrics

  /**
   * Measure the execution time of an operation
   */
  async measure<T>(
    operationName: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const startTime = performance.now()
    
    try {
      const result = await operation()
      const duration = performance.now() - startTime
      
      this.recordMetric({
        operationName,
        duration,
        timestamp: Date.now(),
        metadata
      })
      
      return result
    } catch (error) {
      const duration = performance.now() - startTime
      
      this.recordMetric({
        operationName: `${operationName}_error`,
        duration,
        timestamp: Date.now(),
        metadata: { ...metadata, error: String(error) }
      })
      
      throw error
    }
  }

  /**
   * Measure synchronous operation
   */
  measureSync<T>(
    operationName: string,
    operation: () => T,
    metadata?: Record<string, any>
  ): T {
    const startTime = performance.now()
    
    try {
      const result = operation()
      const duration = performance.now() - startTime
      
      this.recordMetric({
        operationName,
        duration,
        timestamp: Date.now(),
        metadata
      })
      
      return result
    } catch (error) {
      const duration = performance.now() - startTime
      
      this.recordMetric({
        operationName: `${operationName}_error`,
        duration,
        timestamp: Date.now(),
        metadata: { ...metadata, error: String(error) }
      })
      
      throw error
    }
  }

  /**
   * Record a metric
   */
  private recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric)
    
    // Keep only the last N metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift()
    }

    // Log slow operations (> 100ms)
    if (metric.duration > 100) {
      console.warn(
        `[Performance] Slow operation detected: ${metric.operationName} took ${metric.duration.toFixed(2)}ms`,
        metric.metadata
      )
    }
  }

  /**
   * Get metrics for a specific operation
   */
  getMetrics(operationName: string): PerformanceMetrics[] {
    return this.metrics.filter(m => m.operationName === operationName)
  }

  /**
   * Get average duration for an operation
   */
  getAverageDuration(operationName: string): number {
    const metrics = this.getMetrics(operationName)
    if (metrics.length === 0) return 0
    
    const total = metrics.reduce((sum, m) => sum + m.duration, 0)
    return total / metrics.length
  }

  /**
   * Get statistics for an operation
   */
  getStatistics(operationName: string): {
    count: number
    average: number
    min: number
    max: number
    p50: number
    p95: number
    p99: number
  } {
    const metrics = this.getMetrics(operationName)
    
    if (metrics.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0
      }
    }

    const durations = metrics.map(m => m.duration).sort((a, b) => a - b)
    const total = durations.reduce((sum, d) => sum + d, 0)

    return {
      count: metrics.length,
      average: total / metrics.length,
      min: durations[0],
      max: durations[durations.length - 1],
      p50: this.percentile(durations, 0.5),
      p95: this.percentile(durations, 0.95),
      p99: this.percentile(durations, 0.99)
    }
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0
    
    const index = Math.ceil(sortedArray.length * p) - 1
    return sortedArray[Math.max(0, index)]
  }

  /**
   * Get all operation names
   */
  getOperationNames(): string[] {
    const names = new Set(this.metrics.map(m => m.operationName))
    return Array.from(names)
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = []
  }

  /**
   * Get summary of all operations
   */
  getSummary(): Record<string, ReturnType<typeof this.getStatistics>> {
    const summary: Record<string, ReturnType<typeof this.getStatistics>> = {}
    
    for (const operationName of this.getOperationNames()) {
      summary[operationName] = this.getStatistics(operationName)
    }
    
    return summary
  }

  /**
   * Log performance summary
   */
  logSummary(): void {
    const summary = this.getSummary()
    
    console.log('[Performance] Summary:')
    for (const [operation, stats] of Object.entries(summary)) {
      console.log(
        `  ${operation}: count=${stats.count}, avg=${stats.average.toFixed(2)}ms, ` +
        `p50=${stats.p50.toFixed(2)}ms, p95=${stats.p95.toFixed(2)}ms, p99=${stats.p99.toFixed(2)}ms`
      )
    }
  }
}
