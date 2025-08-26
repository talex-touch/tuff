import { Terminal } from './terminal'
import { ITouchClientChannel } from '@talex-touch/utils/channel'

export class EnvDetector {
  private static channel: ITouchClientChannel;

  public static init(channel: ITouchClientChannel) {
    this.channel = channel;
  }

  private static async checkCommand(
    command: string,
    versionArgs: string = '--version',
    versionRegex: RegExp = /(\d+\.\d+\.\d+)/
  ): Promise<string | false> {
    if (!this.channel) {
      throw new Error("EnvDetector not initialized. Call EnvDetector.init(channel) first.");
    }
    return new Promise((resolve) => {
      const terminal = new Terminal(this.channel)
      let output = ''
      let resolved = false;

      const resolveOnce = (value: string | false) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
          // For child_process, there's no explicit disconnect/kill needed after it exits.
          // The process lifecycle is managed by the OS once it's started and exits.
        }
      }

      terminal.onData((data) => {
        output += data
        const match = output.match(versionRegex)
        if (match && match[1]) {
          resolveOnce(match[1])
        }
      })

      terminal.onExit(() => {
        const match = output.match(versionRegex)
        resolveOnce(match && match[1] ? match[1] : false)
      })

      // Execute the command with arguments
      terminal.exec(command, [versionArgs]).catch(() => {
        resolveOnce(false)
      })

      // Timeout in case the command hangs or never returns
      setTimeout(() => {
        resolveOnce(false)
      }, 2000);
    })
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
    if (!this.channel) {
      throw new Error("EnvDetector not initialized. Call EnvDetector.init(channel) first.");
    }
    return new Promise((resolve) => {
       const terminal = new Terminal(this.channel)
       let receivedOutput = false;
       let resolved = false;

       const resolveOnce = (value: boolean) => {
         if (!resolved) {
           resolved = true;
           resolve(value);
           // For child_process, there's no explicit disconnect/kill needed after it exits.
         }
       }

       terminal.onData(() => {
         receivedOutput = true;
         resolveOnce(true); // As soon as we get any output, we know it's there.
       })

       terminal.onExit(() => {
         resolveOnce(receivedOutput)
       })

       // Execute degit with --help
       terminal.exec('degit', ['--help']).catch(() => {
         resolveOnce(false)
       })

       setTimeout(() => {
        resolveOnce(receivedOutput);
       }, 2000)
    });
  }
}