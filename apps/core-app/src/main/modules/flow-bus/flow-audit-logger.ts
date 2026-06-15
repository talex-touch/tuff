/**
 * Flow Audit Logger
 *
 * Structured audit logging for Flow Transfer operations.
 * Records all flow dispatches for security auditing, debugging, and usage analytics.
 */

import type { FlowErrorCode, FlowPayloadType, FlowSession } from '@talex-touch/utils/types/flow'
import { getLogger } from '@talex-touch/utils/common/logger'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { flowAuditLogs } from '../../db/schema'
import { databaseModule } from '../database'

const flowAuditLog = getLogger('flow-audit')

/**
 * Flow audit log entry
 */
export interface FlowAuditEntry {
  sessionId: string
  timestamp: number

  // Sender info
  senderId: string
  senderType: 'plugin' | 'corebox' | 'system'

  // Target info
  targetId?: string
  targetPluginId?: string
  targetType: 'plugin' | 'native'

  // Payload info
  payloadType: FlowPayloadType
  payloadSize?: number

  // Result info
  state: 'DELIVERED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT'
  errorCode?: FlowErrorCode
  errorMessage?: string

  // Performance
  latency?: number

  // Metadata
  metadata?: Record<string, unknown>
}

/**
 * FlowAuditLogger
 *
 * Singleton logger for Flow Transfer audit events.
 */
export class FlowAuditLogger {
  private static instance: FlowAuditLogger | null = null

  private constructor() {}

  static getInstance(): FlowAuditLogger {
    if (!FlowAuditLogger.instance) {
      FlowAuditLogger.instance = new FlowAuditLogger()
    }
    return FlowAuditLogger.instance
  }

  /**
   * Logs a flow audit event
   */
  async log(entry: FlowAuditEntry): Promise<void> {
    try {
      await dbWriteScheduler.schedule('flow-audit', async () => {
        const db = databaseModule.getDb()
        await db.insert(flowAuditLogs).values({
          sessionId: entry.sessionId,
          timestamp: entry.timestamp,
          senderId: entry.senderId,
          senderType: entry.senderType,
          targetId: entry.targetId,
          targetPluginId: entry.targetPluginId,
          targetType: entry.targetType,
          payloadType: entry.payloadType,
          payloadSize: entry.payloadSize,
          state: entry.state,
          errorCode: entry.errorCode,
          errorMessage: entry.errorMessage,
          latency: entry.latency,
          metadata: entry.metadata ? JSON.stringify(entry.metadata) : null
        })
      })

      flowAuditLog.debug('Flow audit logged', {
        meta: {
          sessionId: entry.sessionId,
          sender: entry.senderId,
          target: entry.targetPluginId,
          state: entry.state
        }
      })
    } catch (error) {
      flowAuditLog.error('Failed to log flow audit entry', {
        meta: { sessionId: entry.sessionId },
        error
      })
    }
  }

  /**
   * Logs a flow session completion
   */
  async logSessionComplete(session: FlowSession): Promise<void> {
    const senderType = session.senderId === 'corebox' ? 'corebox' : 'plugin'
    const targetType =
      session.targetPluginId === 'native' || session.fullTargetId?.startsWith('native.')
        ? 'native'
        : 'plugin'

    let state: FlowAuditEntry['state']
    if (session.state === 'DELIVERED' || session.state === 'ACKED') {
      state = 'DELIVERED'
    } else if (session.state === 'CANCELLED') {
      state = 'CANCELLED'
    } else if (session.state === 'FAILED') {
      // Check if it's a timeout
      if (session.error?.code === 'TIMEOUT') {
        state = 'TIMEOUT'
      } else {
        state = 'FAILED'
      }
    } else {
      state = 'FAILED'
    }

    await this.log({
      sessionId: session.sessionId,
      timestamp: session.createdAt,
      senderId: session.senderId,
      senderType: senderType as 'plugin' | 'corebox',
      targetId: session.fullTargetId,
      targetPluginId: session.targetPluginId,
      targetType: targetType as 'plugin' | 'native',
      payloadType: session.payload.type,
      payloadSize: this.estimatePayloadSize(session.payload),
      state,
      errorCode: session.error?.code as FlowErrorCode | undefined,
      errorMessage: session.error?.message,
      latency: session.updatedAt ? session.updatedAt - session.createdAt : undefined,
      metadata: {
        payloadData: session.payload.data ? '[redacted]' : undefined
      }
    })
  }

  /**
   * Estimates payload size in bytes
   */
  private estimatePayloadSize(payload: { type: string; data: unknown }): number {
    try {
      return JSON.stringify(payload.data).length * 2 // UTF-16
    } catch {
      return 0
    }
  }

  /**
   * Gets audit logs for a specific session
   */
  async getSessionLogs(sessionId: string): Promise<FlowAuditEntry[]> {
    const { eq } = await import('drizzle-orm')
    const db = databaseModule.getDb()

    const rows = await db.select().from(flowAuditLogs).where(eq(flowAuditLogs.sessionId, sessionId))

    return rows.map((row) => ({
      sessionId: row.sessionId,
      timestamp: row.timestamp,
      senderId: row.senderId,
      senderType: row.senderType as 'plugin' | 'corebox' | 'system',
      targetId: row.targetId ?? undefined,
      targetPluginId: row.targetPluginId ?? undefined,
      targetType: row.targetType as 'plugin' | 'native',
      payloadType: row.payloadType as FlowPayloadType,
      payloadSize: row.payloadSize ?? undefined,
      state: row.state as 'DELIVERED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT',
      errorCode: row.errorCode as FlowErrorCode | undefined,
      errorMessage: row.errorMessage ?? undefined,
      latency: row.latency ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }))
  }

  /**
   * Gets recent audit logs
   */
  async getRecentLogs(limit: number = 100): Promise<FlowAuditEntry[]> {
    const { desc } = await import('drizzle-orm')
    const db = databaseModule.getDb()

    const rows = await db
      .select()
      .from(flowAuditLogs)
      .orderBy(desc(flowAuditLogs.timestamp))
      .limit(limit)

    return rows.map((row) => ({
      sessionId: row.sessionId,
      timestamp: row.timestamp,
      senderId: row.senderId,
      senderType: row.senderType as 'plugin' | 'corebox' | 'system',
      targetId: row.targetId ?? undefined,
      targetPluginId: row.targetPluginId ?? undefined,
      targetType: row.targetType as 'plugin' | 'native',
      payloadType: row.payloadType as FlowPayloadType,
      payloadSize: row.payloadSize ?? undefined,
      state: row.state as 'DELIVERED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT',
      errorCode: row.errorCode as FlowErrorCode | undefined,
      errorMessage: row.errorMessage ?? undefined,
      latency: row.latency ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }))
  }
}

export const flowAuditLogger = FlowAuditLogger.getInstance()
