export class InternalPluginLogger {
  constructor(private readonly name: string) {}

  private prefix(level: string): string {
    return `[Internal Plugin:${this.name}][${level}]`
  }

  info(...args: unknown[]): void {
    console.info(this.prefix('INFO'), ...args)
  }

  warn(...args: unknown[]): void {
    console.warn(this.prefix('WARN'), ...args)
  }

  error(...args: unknown[]): void {
    console.error(this.prefix('ERROR'), ...args)
  }

  debug(...args: unknown[]): void {
    console.debug(this.prefix('DEBUG'), ...args)
  }

  getManager(): { destroy: () => void } {
    return {
      destroy() {},
    }
  }
}

