// SPDX-License-Identifier: LGPL-3.0-only
// Attribution: PI-Desktop contributors; original notices retained where provided.
// Derived from vastsa/PI-Desktop @ 3b036cc7810e18b3ef7689a2b93385125a8d0a3f
// packages/agent-host/src/ports.ts: QueuedTurnRecord and QueueStore.
// Tuff keeps queue ordering fields, drops remote RACP principals/permission grants,
// and carries the Main-validated immutable input in an opaque storage payload.

export interface QueuedTurnRecord {
  id: string
  sessionId: string
  content: string
  inputHash: string
  priority?: number
  createdAt: number
  payload: unknown
}

export type QueueReorderDirection = 'up' | 'down'

export interface QueueStore {
  listAll: () => Promise<QueuedTurnRecord[]>
  push: (record: QueuedTurnRecord) => Promise<void>
  remove: (id: string) => Promise<boolean>
  prioritize?: (id: string) => Promise<void>
  reorder?: (id: string, direction: QueueReorderDirection) => Promise<boolean>
}
