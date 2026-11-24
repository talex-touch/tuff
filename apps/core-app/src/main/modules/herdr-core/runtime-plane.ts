import type {
  HerdrDocGetResult,
  HerdrDocSetResult,
  HerdrEnsureStartedRequest,
  HerdrExecRequest,
  HerdrExecResult,
  HerdrFileEditRequest,
  HerdrFileReadRequest,
  HerdrFileReadResult,
  HerdrFileWriteRequest,
  HerdrFileWriteResult,
  HerdrMachineView,
  HerdrRuntimeSnapshot,
  HerdrSendResult,
  HerdrSessionUpsertPayload,
  HerdrSessionView,
  HerdrStreamAttachRequest,
  HerdrTerminalControlRequest,
  HerdrTerminalControlResult,
  HerdrTerminalKeysRequest,
  HerdrTerminalKeysResult,
  HerdrTerminalPutRequest,
  HerdrTerminalPutResult,
  HerdrTerminalReadRequest,
  HerdrTerminalReadResult,
  HerdrTerminalRunRequest,
  HerdrTerminalSendRequest
} from '@talex-touch/utils/transport/events/herdr'
import type { Buffer } from 'node:buffer'
import type { HerdrResizePayload } from './frame-codec'
import type { HerdrFramedClient } from './framed-client'
import type { HerdrDocEvent, HerdrRuntimeStore, HerdrSessionRestartedEvent } from './runtime-store'
import { HerdrClientError } from './framed-client'
import { normalizeWireMachine, normalizeWireTerminal } from './runtime-store'

export interface HerdrTerminalWaitRequest {
  terminal?: string
  children?: 'any' | 'all'
  output?: string
  timeout?: number
}

export interface HerdrAttachedStreamCallbacks {
  onData: (chunk: Buffer) => void
  onResize?: (size: HerdrResizePayload) => void
  onFacts?: (facts: Record<string, unknown>) => void
  onClose?: (reason?: string) => void
}

export interface HerdrAttachedStream {
  readonly channel: number
  readonly terminal: HerdrSessionView
  readonly automaticInput: boolean
  readonly resizeNotifications: boolean
  write: (data: Buffer | Uint8Array | string) => void
  sendAutoInput: (data: Buffer | Uint8Array | string) => void
  resize: (cols: number, rows: number) => void
  focus: (focused: boolean) => void
  ack: (bytes: number) => void
  sendFacts: (facts: unknown) => void
  /** Sends a `CLOSE` frame ONLY — detaches the viewer without killing the terminal. */
  detach: () => void
}

export interface HerdrTerminalsApi {
  list: (options?: {
    all?: boolean
    labels?: Record<string, string>
  }) => Promise<HerdrSessionView[]>
  get: (terminal: string) => Promise<HerdrSessionView>
  run: (request: HerdrTerminalRunRequest) => Promise<HerdrSessionView>
  send: (request: HerdrTerminalSendRequest) => Promise<HerdrSendResult>
  keys: (request: HerdrTerminalKeysRequest) => Promise<HerdrTerminalKeysResult>
  control: (request: HerdrTerminalControlRequest) => Promise<HerdrTerminalControlResult>
  interrupt: (terminal: string, timeout?: number) => Promise<HerdrTerminalControlResult>
  kill: (terminal: string) => Promise<HerdrTerminalControlResult>
  rm: (terminal: string) => Promise<HerdrTerminalControlResult>
  keep: (terminal: string, enabled: boolean) => Promise<HerdrTerminalControlResult>
  label: (terminal: string, labels: Record<string, string>) => Promise<HerdrSessionView>
  read: (request: HerdrTerminalReadRequest) => Promise<HerdrTerminalReadResult>
  put: (request: HerdrTerminalPutRequest) => Promise<HerdrTerminalPutResult>
  wait: (request: HerdrTerminalWaitRequest) => Promise<Record<string, unknown>>
  attach: (
    request: HerdrStreamAttachRequest,
    callbacks: HerdrAttachedStreamCallbacks
  ) => Promise<HerdrAttachedStream>
}

export interface HerdrFilesApi {
  read: (request: HerdrFileReadRequest) => Promise<HerdrFileReadResult>
  write: (request: HerdrFileWriteRequest) => Promise<HerdrFileWriteResult>
  edit: (request: HerdrFileEditRequest) => Promise<HerdrFileWriteResult>
}

export type HerdrExecApi = ((request: HerdrExecRequest) => Promise<HerdrExecResult>) & {
  run: (request: HerdrExecRequest) => Promise<HerdrExecResult>
}

export interface HerdrMachinesApi {
  list: () => Promise<HerdrMachineView[]>
  connect: (machine: string) => Promise<HerdrMachineView>
}

export interface HerdrDocsApi {
  get: (name: string, options?: { on?: string | null }) => Promise<HerdrDocGetResult>
  set: (
    name: string,
    value: unknown,
    version: number,
    options?: { on?: string | null }
  ) => Promise<HerdrDocSetResult>
}

/**
 * P3 pre-reserved slot: bridges ACP / agent runtime file, exec, and terminal
 * capability calls onto `HerdrRuntimePlane` (local or remote machine).
 */
export interface HerdrAcpCapabilityBridge {
  readonly id: string
  readTextFile: (request: HerdrFileReadRequest) => Promise<HerdrFileReadResult>
  writeTextFile: (request: HerdrFileWriteRequest) => Promise<HerdrFileWriteResult>
  editTextFile: (request: HerdrFileEditRequest) => Promise<HerdrFileWriteResult>
  exec: (request: HerdrExecRequest) => Promise<HerdrExecResult>
  createTerminal: (request: HerdrTerminalRunRequest) => Promise<HerdrSessionView>
  readTerminalOutput: (request: HerdrTerminalReadRequest) => Promise<HerdrTerminalReadResult>
  sendTerminalInput: (request: HerdrTerminalSendRequest) => Promise<HerdrSendResult>
  killTerminal: (terminal: string) => Promise<HerdrTerminalControlResult>
  resolveMachineTarget?: (addressOrMachine: string) => string | null
}

/**
 * P3 pre-reserved slot: projects runtime snapshots, session deltas, and opaque
 * `doc` updates into secondary Tuff surfaces (Search, Canvas, Flow, etc.).
 */
export interface HerdrContentProjector {
  readonly id: string
  projectSnapshot?: (snapshot: HerdrRuntimeSnapshot) => void | Promise<void>
  projectSession?: (payload: HerdrSessionUpsertPayload) => void | Promise<void>
  projectDoc?: (event: HerdrDocEvent) => void | Promise<void>
  dispose?: () => void
}

function stripUndefined(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      out[key] = value
    }
  }
  return out
}

function computeTimeoutMs(seconds: number | null | undefined, defaultSeconds: number): number {
  const effectiveSeconds =
    typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
      ? seconds
      : defaultSeconds
  return Math.ceil(effectiveSeconds * 1000) + 10_000
}

/**
 * Universal main-process service for `herdr-core`.
 * Exposes 5 sibling APIs (`terminals`, `files`, `exec`, `machines`, `docs`)
 * plus P3 pre-reserved slots (`HerdrAcpCapabilityBridge`, `HerdrContentProjector`).
 */
export class HerdrRuntimePlane {
  readonly terminals: HerdrTerminalsApi
  readonly files: HerdrFilesApi
  readonly exec: HerdrExecApi
  readonly machines: HerdrMachinesApi
  readonly docs: HerdrDocsApi

  private acpBridge: HerdrAcpCapabilityBridge | null = null
  private readonly projectors = new Map<string, HerdrContentProjector>()
  private readonly storeDisposers: Array<() => void> = []

  constructor(private readonly store: HerdrRuntimeStore) {
    this.storeDisposers.push(
      this.store.onSnapshotChanged((snapshot) => {
        for (const projector of this.projectors.values()) {
          void Promise.resolve(projector.projectSnapshot?.(snapshot)).catch(() => undefined)
        }
      }),
      this.store.onSessionUpsert((payload) => {
        for (const projector of this.projectors.values()) {
          void Promise.resolve(projector.projectSession?.(payload)).catch(() => undefined)
        }
      }),
      this.store.onDocChanged((event) => {
        for (const projector of this.projectors.values()) {
          void Promise.resolve(projector.projectDoc?.(event)).catch(() => undefined)
        }
      })
    )

    const runExec = async (request: HerdrExecRequest): Promise<HerdrExecResult> => {
      const client = this.requireClient()
      const params = stripUndefined({
        argv: request.argv,
        line: request.line,
        cwd: request.cwd,
        env: request.env,
        on: request.on,
        input: request.input,
        timeout: request.timeout
      })
      const raw = await client.request<{
        code?: number | null
        signal?: number | null
        stdout: string
        stderr: string
        truncated: boolean
        timed_out: boolean
        ms: number
      }>('machine.exec', params, {
        timeoutMs: computeTimeoutMs(request.timeout, 60)
      })
      return {
        code: raw.code ?? null,
        signal: raw.signal ?? null,
        stdout: raw.stdout ?? '',
        stderr: raw.stderr ?? '',
        truncated: raw.truncated === true,
        timedOut: raw.timed_out === true,
        ms: typeof raw.ms === 'number' ? raw.ms : 0
      }
    }

    this.exec = Object.assign(runExec, { run: runExec })

    this.files = {
      read: async (request: HerdrFileReadRequest): Promise<HerdrFileReadResult> => {
        const client = this.requireClient()
        const params = stripUndefined({
          path: request.path,
          cwd: request.cwd,
          on: request.on,
          offset: request.offset,
          limit: request.limit
        })
        const raw = await client.request<HerdrFileReadResult>('file.read', params)
        return {
          text: raw.text ?? '',
          first: raw.first ?? 0,
          last: raw.last ?? 0,
          lines: raw.lines ?? 0
        }
      },

      write: async (request: HerdrFileWriteRequest): Promise<HerdrFileWriteResult> => {
        const client = this.requireClient()
        const params = stripUndefined({
          path: request.path,
          data: request.data,
          cwd: request.cwd,
          on: request.on
        })
        const raw = await client.request<HerdrFileWriteResult>('file.write', params)
        return {
          path: raw.path,
          bytes: raw.bytes
        }
      },

      edit: async (request: HerdrFileEditRequest): Promise<HerdrFileWriteResult> => {
        const client = this.requireClient()
        const params = stripUndefined({
          path: request.path,
          edits: request.edits,
          cwd: request.cwd,
          on: request.on
        })
        const raw = await client.request<HerdrFileWriteResult>('file.edit', params)
        return {
          path: raw.path,
          bytes: raw.bytes
        }
      }
    }

    this.machines = {
      list: async (): Promise<HerdrMachineView[]> => {
        const client = this.requireClient()
        const raw = await client.request<{ machines?: Record<string, unknown>[] }>(
          'machine.list',
          {}
        )
        return Array.isArray(raw?.machines) ? raw.machines.map(normalizeWireMachine) : []
      },

      connect: async (machine: string): Promise<HerdrMachineView> => {
        const client = this.requireClient()
        const raw = await client.request<Record<string, unknown>>('machine.connect', { machine })
        const normalized = normalizeWireMachine(raw)
        void this.store.refreshMetadata().catch(() => undefined)
        return normalized
      }
    }

    this.docs = {
      get: async (name: string, options?: { on?: string | null }): Promise<HerdrDocGetResult> => {
        const client = this.requireClient()
        const params = stripUndefined({ name, on: options?.on })
        const raw = await client.request<HerdrDocGetResult>('doc.get', params)
        return {
          value: raw.value,
          version: raw.version
        }
      },

      set: async (
        name: string,
        value: unknown,
        version: number,
        options?: { on?: string | null }
      ): Promise<HerdrDocSetResult> => {
        const client = this.requireClient()
        const params = stripUndefined({ name, value, version, on: options?.on })
        const raw = await client.request<HerdrDocSetResult>('doc.set', params)
        return {
          version: raw.version
        }
      }
    }

    const control = async (
      request: HerdrTerminalControlRequest
    ): Promise<HerdrTerminalControlResult> => {
      const client = this.requireClient()
      switch (request.action) {
        case 'interrupt': {
          const raw = await client.request<{ outcome: string; key: string }>(
            'terminal.interrupt',
            stripUndefined({ terminal: request.terminal, timeout: request.timeout }),
            { timeoutMs: computeTimeoutMs(request.timeout, 10) }
          )
          return {
            terminal: request.terminal,
            action: 'interrupt',
            outcome: raw.outcome,
            key: raw.key
          }
        }
        case 'kill': {
          const raw = await client.request<Record<string, unknown>>('terminal.kill', {
            terminal: request.terminal
          })
          const session = normalizeWireTerminal(raw)
          this.store.recordSessionLocally(session)
          return {
            terminal: request.terminal,
            action: 'kill',
            session
          }
        }
        case 'rm': {
          const raw = await client.request<{ removed: string }>('terminal.rm', {
            terminal: request.terminal
          })
          return {
            terminal: request.terminal,
            action: 'rm',
            removed: raw.removed
          }
        }
        case 'keep-on':
        case 'keep-off': {
          const raw = await client.request<Record<string, unknown>>('terminal.keep', {
            terminal: request.terminal,
            keep: request.action === 'keep-on'
          })
          const session = normalizeWireTerminal(raw)
          this.store.recordSessionLocally(session)
          return {
            terminal: request.terminal,
            action: request.action,
            session
          }
        }
        default:
          throw new Error(`Unsupported herdr terminal control action: ${String(request.action)}`)
      }
    }

    this.terminals = {
      list: async (options) => {
        const client = this.requireClient()
        const raw = await client.request<{ terminals?: Record<string, unknown>[] }>(
          'terminal.list',
          stripUndefined({
            all: options?.all,
            labels: options?.labels
          })
        )
        return Array.isArray(raw?.terminals) ? raw.terminals.map(normalizeWireTerminal) : []
      },

      get: async (terminal) => {
        const client = this.requireClient()
        const raw = await client.request<Record<string, unknown>>('terminal.get', { terminal })
        return normalizeWireTerminal(raw)
      },

      run: async (request) => {
        const client = this.requireClient()
        const size =
          typeof request.cols === 'number' &&
          typeof request.rows === 'number' &&
          request.cols >= 1 &&
          request.rows >= 1
            ? { cols: Math.floor(request.cols), rows: Math.floor(request.rows) }
            : undefined

        const params = stripUndefined({
          argv: request.argv,
          line: request.line,
          cwd: request.cwd,
          env: request.env,
          name: request.name,
          on: request.on,
          labels: request.labels,
          keep: request.keep,
          rm: request.rm,
          size,
          parent: request.parent,
          no_parent: request.noParent,
          no_notify: request.noNotify,
          die_with_parent: request.dieWithParent,
          outlive_parent: request.outliveParent,
          wait: request.wait,
          timeout: request.timeout,
          display: request.display
        })

        const timeoutMs = request.wait
          ? computeTimeoutMs(request.timeout, 180)
          : computeTimeoutMs(request.timeout, 65)

        const raw = await client.request<Record<string, unknown>>('terminal.run', params, {
          timeoutMs
        })
        const session = normalizeWireTerminal(raw)
        this.store.recordSessionLocally(session)
        return session
      },

      send: async (request) => {
        const client = this.requireClient()
        const params = stripUndefined({
          terminal: request.terminal,
          text: request.text,
          force: request.force,
          if: request.ifState,
          wait: request.wait,
          timeout: request.timeout
        })
        const timeoutMs = request.wait
          ? computeTimeoutMs(request.timeout, 180)
          : computeTimeoutMs(request.timeout, 70)
        const raw = await client.request<{
          turn: number
          status?: string | null
          started?: boolean | null
        }>('terminal.send', params, { timeoutMs })
        return {
          turn: raw.turn ?? 0,
          status: raw.status ?? null,
          started: raw.started ?? null
        }
      },

      keys: async (request) => {
        const client = this.requireClient()
        const raw = await client.request<{ turn: number; status?: string | null }>(
          'terminal.keys',
          {
            terminal: request.terminal,
            keys: request.keys
          }
        )
        return {
          turn: raw.turn ?? 0,
          status: raw.status ?? null
        }
      },

      control,

      interrupt: (terminal, timeout) =>
        control({
          terminal,
          action: 'interrupt',
          ...(timeout !== undefined ? { timeout } : {})
        }),

      kill: (terminal) => control({ terminal, action: 'kill' }),

      rm: (terminal) => control({ terminal, action: 'rm' }),

      keep: (terminal, enabled) => control({ terminal, action: enabled ? 'keep-on' : 'keep-off' }),

      label: async (terminal, labels) => {
        const client = this.requireClient()
        const raw = await client.request<Record<string, unknown>>('terminal.label', {
          terminal,
          labels
        })
        const session = normalizeWireTerminal(raw)
        this.store.recordSessionLocally(session)
        return session
      },

      read: async (request) => {
        const client = this.requireClient()
        const raw = await client.request<{
          text: string
          complete: boolean
          how: string
          why?: string | null
        }>(
          'terminal.read',
          stripUndefined({
            terminal: request.terminal,
            lines: request.lines
          })
        )
        return {
          text: raw.text ?? '',
          complete: raw.complete === true,
          how: raw.how ?? 'screen',
          why: raw.why ?? null
        }
      },

      put: async (request) => {
        const client = this.requireClient()
        const raw = await client.request<HerdrTerminalPutResult>('terminal.put', {
          terminal: request.terminal,
          name: request.name,
          data: request.data
        })
        return {
          path: raw.path,
          bytes: raw.bytes
        }
      },

      wait: async (request) => {
        const client = this.requireClient()
        return await client.request<Record<string, unknown>>(
          'terminal.wait',
          stripUndefined({
            terminal: request.terminal,
            children: request.children,
            output: request.output,
            timeout: request.timeout
          }),
          { timeoutMs: computeTimeoutMs(request.timeout, 180) }
        )
      },

      attach: async (request, callbacks) => {
        const client = this.requireClient()
        const raw = await client.request<{
          channel: number
          terminal: Record<string, unknown>
          automatic_input?: boolean
          resize_notifications?: boolean
        }>(
          'terminal.attach',
          stripUndefined({
            terminal: request.terminal,
            cols: request.cols,
            rows: request.rows,
            history: request.history,
            observe: request.observe,
            resumed: request.resumed,
            resize_notifications: request.resizeNotifications,
            display: request.display
          })
        )

        const channel = raw.channel
        const terminal = normalizeWireTerminal(raw.terminal)
        const automaticInput = raw.automatic_input === true
        const resizeNotifications = raw.resize_notifications === true

        let detached = false
        client.registerPtyChannel(channel, {
          onData: (chunk) => callbacks.onData(chunk),
          onResize: (size) => callbacks.onResize?.(size),
          onFacts: (facts) => callbacks.onFacts?.(facts),
          onClose: (reason) => {
            detached = true
            callbacks.onClose?.(reason)
          }
        })

        return {
          channel,
          terminal,
          automaticInput,
          resizeNotifications,
          write: (data) => {
            if (detached) throw new Error('HERDR_STREAM_CLOSED')
            client.sendData(channel, data)
          },
          sendAutoInput: (data) => {
            if (detached) throw new Error('HERDR_STREAM_CLOSED')
            if (automaticInput) {
              client.sendAutomaticInput(channel, data)
            } else {
              client.sendData(channel, data)
            }
          },
          resize: (cols, rows) => {
            if (detached) throw new Error('HERDR_STREAM_CLOSED')
            client.sendResize(channel, cols, rows)
          },
          focus: (focused) => {
            if (detached) throw new Error('HERDR_STREAM_CLOSED')
            client.sendFocus(channel, focused)
          },
          ack: (bytes) => {
            if (detached || bytes <= 0) return
            client.sendCredit(channel, bytes)
          },
          sendFacts: (facts) => {
            if (detached) throw new Error('HERDR_STREAM_CLOSED')
            client.sendFacts(channel, facts)
          },
          detach: () => {
            if (detached) return
            detached = true
            client.detachChannel(channel)
          }
        }
      }
    }
  }

  getSnapshot(): HerdrRuntimeSnapshot {
    return this.store.getSnapshot()
  }

  ensureStarted(request?: HerdrEnsureStartedRequest): Promise<HerdrRuntimeSnapshot> {
    return this.store.ensureStarted(request)
  }

  reconnect(): Promise<HerdrRuntimeSnapshot> {
    return this.store.reconnect()
  }

  onSnapshotChanged(listener: (snapshot: HerdrRuntimeSnapshot) => void): () => void {
    return this.store.onSnapshotChanged(listener)
  }

  onSessionUpsert(listener: (payload: HerdrSessionUpsertPayload) => void): () => void {
    return this.store.onSessionUpsert(listener)
  }

  onSessionRestarted(listener: (event: HerdrSessionRestartedEvent) => void): () => void {
    return this.store.onSessionRestarted(listener)
  }

  onDocChanged(listener: (event: HerdrDocEvent) => void): () => void {
    return this.store.onDocChanged(listener)
  }

  setAcpCapabilityBridge(bridge: HerdrAcpCapabilityBridge | null): void {
    this.acpBridge = bridge
  }

  getAcpCapabilityBridge(): HerdrAcpCapabilityBridge | null {
    return this.acpBridge
  }

  registerContentProjector(projector: HerdrContentProjector): () => void {
    this.projectors.set(projector.id, projector)
    return () => {
      const current = this.projectors.get(projector.id)
      if (current === projector) {
        this.projectors.delete(projector.id)
        projector.dispose?.()
      }
    }
  }

  getContentProjectors(): readonly HerdrContentProjector[] {
    return [...this.projectors.values()]
  }

  dispose(): void {
    for (const dispose of this.storeDisposers.splice(0)) dispose()
    for (const projector of this.projectors.values()) {
      projector.dispose?.()
    }
    this.projectors.clear()
    this.acpBridge = null
  }

  private requireClient(): HerdrFramedClient {
    const client = this.store.getClient()
    if (!client) {
      throw new HerdrClientError(
        'CLIENT_DISCONNECTED',
        `herdr-core is not connected (state=${this.store.getConnectionState()})`
      )
    }
    return client
  }
}

let registeredHerdrRuntimePlane: HerdrRuntimePlane | null = null

export function registerHerdrRuntimePlane(plane: HerdrRuntimePlane | null): void {
  registeredHerdrRuntimePlane = plane
}

export function getRegisteredHerdrRuntimePlane(): HerdrRuntimePlane | null {
  return registeredHerdrRuntimePlane
}
