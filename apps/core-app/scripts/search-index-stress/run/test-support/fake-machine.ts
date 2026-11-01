import type { ShutdownDeps } from '../app-shutdown'
import type { ProcessInfo } from '../process-info'

interface FakeProcess {
  ppid: number
  command: string
  alive: boolean
}

/** A process table and a clock that only moves when the code under test sleeps. */
export class Machine {
  now = 1_000
  readonly procs = new Map<number, FakeProcess>()
  readonly signals: Array<[number, string]> = []
  markers: string[] = []
  private readonly events: Array<{ at: number; run: () => void }> = []

  add(pid: number, ppid: number, command: string): void {
    this.procs.set(pid, { ppid, command, alive: true })
  }

  after(ms: number, run: () => void): void {
    this.events.push({ at: this.now + ms, run })
  }

  exit(pid: number): void {
    const proc = this.procs.get(pid)
    if (proc) proc.alive = false
  }

  deps(): ShutdownDeps {
    return {
      listProcesses: async () =>
        [...this.procs.entries()]
          .filter(([, proc]) => proc.alive)
          .map(([pid, proc]): ProcessInfo => ({ pid, ppid: proc.ppid, command: proc.command })),
      isPidAlive: (pid) => this.procs.get(pid)?.alive === true,
      signal: (pid, signal) => {
        this.signals.push([pid, signal])
        this.onSignal(pid, signal)
      },
      sleep: async (ms) => {
        this.now += ms
        for (const event of this.events.filter((entry) => entry.at <= this.now)) {
          this.events.splice(this.events.indexOf(event), 1)
          event.run()
        }
      },
      now: () => this.now,
      findMarkers: async () => this.markers,
      log: () => undefined
    }
  }

  onSignal: (pid: number, signal: string) => void = () => undefined
}
