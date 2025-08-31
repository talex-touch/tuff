import { ITouchClientChannel } from '@talex-touch/utils/channel'

type DataCallback = (data: string) => void
type ExitCallback = (exitCode: number | null) => void

export class Terminal {
  private id: string | null = null
  private onDataCallback: DataCallback | null = null
  private onExitCallback: ExitCallback | null = null
  private channel: ITouchClientChannel

  constructor(channel: ITouchClientChannel) {
    this.channel = channel
  }

  /**
   * Executes a command and returns the process ID.
   * The command output will be sent via the 'terminal:data' event.
   * The command exit code will be sent via the 'terminal:exit' event.
   * @param command The command to execute.
   * @param args The arguments for the command.
   * @returns A promise that resolves with the process ID.
   */
  public async exec(command: string, args: string[] = []): Promise<string> {
    // If there's an existing process, it should ideally be killed first.
    // However, for simplicity in this refactor, we'll assume exec is called for a new, independent command.
    // A more robust implementation might track multiple concurrent processes.
    
    const { id } = await this.channel.send('terminal:create', { command, args })
    this.id = id
    
    // Re-register listeners for the new process ID
    this.channel.regChannel('terminal:data', (channelData) => {
      if (this.id === channelData.data.id && this.onDataCallback) {
        this.onDataCallback(channelData.data.data)
      }
    })

    this.channel.regChannel('terminal:exit', (channelData) => {
      if (this.id === channelData.data.id && this.onExitCallback) {
        this.onExitCallback(channelData.data.exitCode)
        this.id = null
      }
    })
    
    return id
  }

  /**
   * Writes data to the process stdin (if applicable).
   * Note: This is less common with child_process for non-interactive commands.
   * @param data The data to write.
   */
  public write(data: string): void {
    if (this.id) {
      this.channel.send('terminal:write', { id: this.id, data })
    }
  }

  /**
   * Kills the running process.
   */
  public kill(): void {
    if (this.id) {
      this.channel.send('terminal:kill', { id: this.id })
      this.id = null
    }
  }

  /**
   * Sets the callback for receiving data from the process.
   * @param callback The callback function.
   */
  public onData(callback: DataCallback): void {
    this.onDataCallback = callback
  }

  /**
   * Sets the callback for receiving the exit code from the process.
   * @param callback The callback function.
   */
  public onExit(callback: ExitCallback): void {
    this.onExitCallback = callback
  }
}