import type { ITouchPlugin } from '..'
import type { LogItem } from '../log/types'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { structuredStrictStringify } from '@talex-touch/utils'
import { PollingService } from '../../common/utils/polling'

/**
 * PluginLoggerManager is responsible for managing and writing logs for a specific plugin.
 */
export class PluginLoggerManager {
  private readonly pluginInfo: ITouchPlugin
  private readonly pluginLogDir: string
  private readonly sessionLogPath: string
  private readonly pluginInfoPath: string
  private readonly sessionStart: string
  private buffer: LogItem[] = []
  private readonly pollingService = PollingService.getInstance()
  private readonly flushTaskId: string
  private onLogAppend?: (log: LogItem) => void
  private flushInFlight: Promise<void> | null = null
  private pendingFlush = false

  /**
   * Initializes a new PluginLoggerManager instance.
   * @param baseDir - Base directory to store logs.
   * @param pluginInfo - Plugin information for logging context.
   * @param onLogAppend - Optional callback to be invoked when a log is appended.
   */
  constructor(baseDir: string, pluginInfo: ITouchPlugin, onLogAppend?: (log: LogItem) => void) {
    this.pluginInfo = pluginInfo
    this.onLogAppend = onLogAppend
    this.sessionStart = new Date().toISOString()
    const timestamp = this.sessionStart.replace(/[:.]/g, '-')
    const sessionFolder = `${timestamp}_${pluginInfo.name.replace(/[^\w-]/g, '_')}`

    this.pluginLogDir = path.resolve(baseDir, 'logs', sessionFolder)
    this.sessionLogPath = path.resolve(this.pluginLogDir, 'session.log')
    this.pluginInfoPath = path.resolve(this.pluginLogDir, 'touch-plugin.info')
    this.flushTaskId = `plugin-logger.flush.${pluginInfo.name}.${Date.now()}`

    void this.ensureLogEnvironment(true).catch(() => {})
    this.pollingService.register(
      this.flushTaskId,
      () =>
        this.flush().catch(() => {
          // swallow flush failures in polling loop
        }),
      {
        interval: 5,
        unit: 'seconds',
        lane: 'io',
        backpressure: 'latest_wins',
        dedupeKey: this.flushTaskId,
        maxInFlight: 1,
        timeoutMs: 5000,
        jitterMs: 250
      }
    )
    this.pollingService.start()
  }

  /**
   * Appends a new log item to the buffer.
   * @param log - The log entry to append.
   */
  append(log: LogItem): void {
    this.buffer.push(log)
    this.onLogAppend?.(log)
  }

  /**
   * Flushes all buffered log items to the current session log file.
   */
  async flush(): Promise<void> {
    if (this.flushInFlight) {
      this.pendingFlush = true
      return this.flushInFlight
    }

    this.flushInFlight = this.flushLoop().finally(() => {
      this.flushInFlight = null
    })

    return this.flushInFlight
  }

  /**
   * Returns the path to the current session log file.
   * @returns The path to the session log.
   */
  public getSessionLogPath(): string {
    return this.sessionLogPath
  }

  /**
   * Returns the current log buffer.
   * @returns An array of log items.
   */
  public getBuffer(): LogItem[] {
    return this.buffer
  }

  /**
   * Stops the flush interval and ensures remaining logs are written.
   */
  destroy(): void {
    this.pollingService.unregister(this.flushTaskId)
    void this.flush().catch(() => {})
  }

  /**
   * Creates the touch-plugin.info file with plugin information.
   */
  private async writePluginInfoFile(): Promise<void> {
    const pluginInfo = {
      name: this.pluginInfo.name,
      version: this.pluginInfo.version,
      description: this.pluginInfo.desc,
      sessionStart: this.sessionStart,
      icon: this.pluginInfo.icon,
      platforms: this.pluginInfo.platforms,
      status: this.pluginInfo.status,
      features: this.pluginInfo.features.map(feature => ({
        id: feature.id,
        name: feature.name,
        desc: feature.desc,
      })),
    }

    await fs.writeFile(this.pluginInfoPath, JSON.stringify(pluginInfo, null, 2))
  }

  /**
   * Ensures the log directory and related files exist.
   */
  private async ensureLogEnvironment(forceInfo = false): Promise<void> {
    await fs.mkdir(this.pluginLogDir, { recursive: true })
    await fs.appendFile(this.sessionLogPath, '')

    if (forceInfo || !existsSync(this.pluginInfoPath)) {
      await this.writePluginInfoFile()
    }
  }

  private async flushLoop(): Promise<void> {
    do {
      this.pendingFlush = false
      if (this.buffer.length === 0) {
        return
      }

      const batch = this.buffer
      this.buffer = []
      const lines = `${batch.map(item => structuredStrictStringify(item)).join('\n')}\n`

      try {
        await this.ensureLogEnvironment()
        await fs.appendFile(this.sessionLogPath, lines)
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
          await this.ensureLogEnvironment(true)
          await fs.appendFile(this.sessionLogPath, lines)
        } else {
          this.buffer = batch.concat(this.buffer)
          throw error
        }
      }
    } while (this.pendingFlush || this.buffer.length > 0)
  }
}
