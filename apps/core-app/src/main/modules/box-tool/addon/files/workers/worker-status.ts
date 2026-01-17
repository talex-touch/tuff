export interface WorkerMetricsPayload {
  timestamp: number
  memory: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
    arrayBuffers: number
  }
  cpuUsage: {
    user: number
    system: number
  }
  eventLoop: {
    active: number
    idle: number
    utilization: number
  } | null
}

export interface WorkerMetricsRequest {
  type: 'metrics'
  requestId: string
}

export interface WorkerMetricsResponse {
  type: 'metrics'
  requestId: string
  metrics: WorkerMetricsPayload
}

export interface WorkerTaskSnapshot {
  id: string
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  error: string | null
}

export interface WorkerStatusSnapshot {
  name: string
  threadId: number | null
  state: 'offline' | 'idle' | 'busy'
  pending: number
  lastTask: WorkerTaskSnapshot | null
  lastError: string | null
  uptimeMs: number | null
  metrics: {
    capturedAt: number
    memory: WorkerMetricsPayload['memory']
    cpu: {
      user: number
      system: number
      percent: number | null
    }
    eventLoop: WorkerMetricsPayload['eventLoop']
  } | null
}
