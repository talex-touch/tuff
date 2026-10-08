import type { ITuffTransport } from '../../transport/index'
import type { TerminalSessionHandle } from '../../transport/sdk/domains/terminal'
import { createTerminalSdk } from '../../transport/sdk/domains/terminal'

export class EnvDetector {
  private static transport: ITuffTransport

  public static init(transport: ITuffTransport): void {
    this.transport = transport
  }

  private static run(command: string, args: string[]): Promise<string | null> {
    if (!this.transport) {
      throw new Error('EnvDetector not initialized. Call EnvDetector.init(transport) first.')
    }
    const sdk = createTerminalSdk(this.transport)
    let resolve!: (value: string | null | PromiseLike<string | null>) => void
    const promise = new Promise<string | null>((res) => {
      resolve = res
    })
    const controller = new AbortController()
    let output = ''
    let finished = false
    let creation: Promise<TerminalSessionHandle> | undefined
    const finish = (value: string | null): void => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      // Also covers a creation reply arriving after the detection timeout.
      controller.abort()
      const disposed = creation?.then(session => session.close(), () => {}) ?? Promise.resolve()
      void disposed.then(() => resolve(value), () => resolve(null))
    }
    const timeout = setTimeout(() => finish(null), 2000)
    creation = sdk.create({ command, args }, {
      signal: controller.signal,
      onData: data => { output += data },
      onExit: exit => finish(exit.exitCode === 0 ? output : null),
    })
    void creation.catch(() => finish(null))
    return promise
  }

  private static async checkCommand(command: string): Promise<string | false> {
    const output = await this.run(command, ['--version'])
    return output?.match(/(\d+\.\d+\.\d+)/)?.[1] ?? false
  }

  static async getNode(): Promise<string | false> {
    return this.checkCommand('node')
  }

  static async getNpm(): Promise<string | false> {
    return this.checkCommand('npm')
  }

  static async getGit(): Promise<string | false> {
    return this.checkCommand('git')
  }

  static async getDegit(): Promise<boolean> {
    const output = await this.run('degit', ['--help'])
    return output !== null && output.trim().length > 0
  }
}
