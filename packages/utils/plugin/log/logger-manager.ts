import fs from 'fs'
import path from 'path'
import { LogItem } from './types'

/**
 * LoggerManager is responsible for managing and writing logs for all plugins.
 */
export class LoggerManager {
  private readonly logDir: string
  private readonly sessionLogPath: string
  private buffer: LogItem[] = []
  private flushInterval: NodeJS.Timeout

  /**
   * Initializes a new LoggerManager instance.
   * @param baseDir - Base directory to store logs.
   */
  constructor(baseDir: string) {
    this.logDir = path.resolve(baseDir, 'logs')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    this.sessionLogPath = path.resolve(this.logDir, `${timestamp}.log`)
    this.ensureDirectory()
    this.flushInterval = setInterval(() => this.flush(), 5000)
  }

  /**
   * Appends a new log item to the buffer.
   * @param log - The log entry to append.
   */
  append(log: LogItem): void {
    this.buffer.push(log)
  }

  /**
   * Flushes all buffered log items to the current session log file.
   */
  flush(): void {
    if (this.buffer.length === 0) return
    const lines = this.buffer.map((item) => JSON.stringify(item)).join('\n') + '\n'
    fs.appendFileSync(this.sessionLogPath, lines)
    this.buffer = []
  }

  /**
   * Stops the flush interval and ensures remaining logs are written.
   */
  destroy(): void {
    clearInterval(this.flushInterval)
    this.flush()
  }

  /**
   * Ensures the log directory exists.
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }
}
