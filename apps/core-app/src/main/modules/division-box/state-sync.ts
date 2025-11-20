/**
 * State Synchronization with Retry Logic
 * 
 * Provides robust state synchronization between main and renderer processes
 * with exponential backoff retry mechanism.
 */

import { BrowserWindow } from 'electron'
import { DivisionBoxErrorCode, type StateChangeEvent } from '@talex-touch/utils'
import { errorLogger } from './error-logger'

/**
 * Retry configuration
 */
interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number
  
  /** Initial delay in milliseconds */
  initialDelay: number
  
  /** Backoff multiplier (exponential) */
  backoffMultiplier: number
  
  /** Maximum delay cap in milliseconds */
  maxDelay: number
}

/**
 * Default retry configuration
 * Delays: 1s, 2s, 4s (exponential backoff)
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,      // 1 second
  backoffMultiplier: 2,    // Double each time
  maxDelay: 4000           // Cap at 4 seconds
}

/**
 * State sync operation result
 */
interface SyncResult {
  success: boolean
  attempts: number
  error?: Error
}

/**
 * StateSyncManager - Handles state synchronization with retry logic
 * 
 * Implements exponential backoff retry for failed state synchronization
 * operations between main and renderer processes.
 */
export class StateSyncManager {
  private config: RetryConfig

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config }
  }

  /**
   * Broadcasts a state change event to all renderer processes with retry
   * 
   * @param event - State change event to broadcast
   * @param windows - Array of BrowserWindows to send to (if empty, sends to all)
   * @returns Promise resolving to sync result
   */
  async broadcastStateChange(
    event: StateChangeEvent,
    windows?: BrowserWindow[]
  ): Promise<SyncResult> {
    const targetWindows = windows || BrowserWindow.getAllWindows()
    
    if (targetWindows.length === 0) {
      errorLogger.logWarning('No windows available for state broadcast', {
        sessionId: event.sessionId
      })
      return { success: true, attempts: 0 }
    }

    return this.executeWithRetry(
      async () => {
        // Send to all target windows
        for (const window of targetWindows) {
          if (!window.isDestroyed()) {
            window.webContents.send('division-box:state-changed', event)
          }
        }
      },
      {
        operationName: 'broadcastStateChange',
        sessionId: event.sessionId,
        meta: {
          oldState: event.oldState,
          newState: event.newState,
          windowCount: targetWindows.length
        }
      }
    )
  }

  /**
   * Sends a session destroyed event to all renderer processes with retry
   * 
   * @param sessionId - ID of the destroyed session
   * @param windows - Array of BrowserWindows to send to (if empty, sends to all)
   * @returns Promise resolving to sync result
   */
  async broadcastSessionDestroyed(
    sessionId: string,
    windows?: BrowserWindow[]
  ): Promise<SyncResult> {
    const targetWindows = windows || BrowserWindow.getAllWindows()
    
    if (targetWindows.length === 0) {
      errorLogger.logWarning('No windows available for session destroyed broadcast', {
        sessionId
      })
      return { success: true, attempts: 0 }
    }

    return this.executeWithRetry(
      async () => {
        // Send to all target windows
        for (const window of targetWindows) {
          if (!window.isDestroyed()) {
            window.webContents.send('division-box:session-destroyed', sessionId)
          }
        }
      },
      {
        operationName: 'broadcastSessionDestroyed',
        sessionId,
        meta: {
          windowCount: targetWindows.length
        }
      }
    )
  }

  /**
   * Executes an operation with exponential backoff retry
   * 
   * @param operation - Async operation to execute
   * @param context - Context information for logging
   * @returns Promise resolving to sync result
   */
  private async executeWithRetry(
    operation: () => Promise<void>,
    context: {
      operationName: string
      sessionId?: string
      meta?: Record<string, any>
    }
  ): Promise<SyncResult> {
    let lastError: Error | undefined
    let attempts = 0

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      attempts++

      try {
        // Execute the operation
        await operation()
        
        // Success!
        if (attempt > 0) {
          // Log successful retry
          errorLogger.logInfo(
            `${context.operationName} succeeded after ${attempt} retries`,
            {
              sessionId: context.sessionId || 'N/A',
              attempts: attempt + 1,
              ...context.meta
            }
          )
        }
        
        return { success: true, attempts }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // Log the failure
        errorLogger.logGenericError(
          DivisionBoxErrorCode.IPC_ERROR,
          `${context.operationName} failed (attempt ${attempt + 1}/${this.config.maxRetries + 1})`,
          context.sessionId,
          lastError,
          {
            attempt: attempt + 1,
            maxRetries: this.config.maxRetries + 1,
            ...context.meta
          }
        )

        // If this was the last attempt, don't wait
        if (attempt === this.config.maxRetries) {
          break
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt),
          this.config.maxDelay
        )

        errorLogger.logDebug(
          `Retrying ${context.operationName} in ${delay}ms`,
          {
            sessionId: context.sessionId || 'N/A',
            delay,
            nextAttempt: attempt + 2
          }
        )

        // Wait before retrying
        await this.delay(delay)
      }
    }

    // All retries exhausted
    errorLogger.logGenericError(
      DivisionBoxErrorCode.IPC_ERROR,
      `${context.operationName} failed after ${this.config.maxRetries + 1} attempts`,
      context.sessionId,
      lastError,
      {
        totalAttempts: attempts,
        ...context.meta
      }
    )

    return {
      success: false,
      attempts,
      error: lastError
    }
  }

  /**
   * Delays execution for the specified duration
   * 
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Updates the retry configuration
   * 
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config }
    errorLogger.logInfo('StateSyncManager configuration updated', {
      maxRetries: this.config.maxRetries,
      initialDelay: this.config.initialDelay,
      backoffMultiplier: this.config.backoffMultiplier,
      maxDelay: this.config.maxDelay
    })
  }

  /**
   * Gets the current retry configuration
   * 
   * @returns Current retry configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config }
  }
}

/**
 * Singleton instance of StateSyncManager
 */
export const stateSyncManager = new StateSyncManager()
