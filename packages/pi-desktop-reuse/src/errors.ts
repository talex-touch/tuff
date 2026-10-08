// SPDX-License-Identifier: LGPL-3.0-only
// Attribution: PI-Desktop contributors; original notices retained where provided.
// Source signature: packages/agent-host/src/errors.ts (racpError).
// Tuff adapter for the error port used by PI-Desktop turn-queue.ts @
// 3b036cc7810e18b3ef7689a2b93385125a8d0a3f. No RACP server is embedded.

export interface QueueCapacityDetails {
  queueFull?: boolean
  maxQueuedTurnsPerSession?: number
}

export class WorkspaceQueueError extends Error {
  readonly code: string
  constructor(code: string, readonly details?: QueueCapacityDetails) {
    super(code)
    this.code = code
  }
}

export function racpError(code: string, _message: string, options?: { details?: QueueCapacityDetails }): WorkspaceQueueError {
  return new WorkspaceQueueError(code === 'AGENT_BUSY' ? 'WORKSPACE_QUEUE_FULL' : code, options?.details)
}
