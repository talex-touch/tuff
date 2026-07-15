/**
 * Cross-process protocol between the main process and the plugin host
 * utilityProcess (C1-B). One control MessagePort carries every message type.
 *
 * Scope of the experimental core (flag-gated, off by default):
 *  - load / lifecycle: run the Prelude in the child, call its lifecycle over MP1
 *  - sdk-call / sdk-result: forward invoke-style SDK calls to the main process
 * Event-style callback registration (channelBridge.onMain) is NOT covered here
 * and is left to the focused iteration.
 */
export interface HostInit {
  type: 'init'
}
export interface HostReady {
  type: 'ready'
}
export interface HostPing {
  type: 'ping'
  id: number
}
export interface HostPong {
  type: 'pong'
  id: number
}

export interface HostLoad {
  type: 'load'
  requestId: number
  pluginName: string
  pluginPath: string
  scriptContent: string
  contextKeys: string[]
}
export interface HostLoadResult {
  type: 'load-result'
  requestId: number
  ok: boolean
  methods?: string[]
  error?: string
}
export interface HostLifecycle {
  type: 'lifecycle'
  requestId: number
  pluginName: string
  method: string
  args: unknown[]
}
export interface HostLifecycleResult {
  type: 'lifecycle-result'
  requestId: number
  ok: boolean
  result?: unknown
  error?: string
}
export interface HostSdkCall {
  type: 'sdk-call'
  requestId: number
  pluginName: string
  chain: string[]
  args: unknown[]
}
export interface HostSdkResult {
  type: 'sdk-result'
  requestId: number
  ok: boolean
  result?: unknown
  error?: string
}

export type HostMessage =
  | HostInit
  | HostReady
  | HostPing
  | HostPong
  | HostLoad
  | HostLoadResult
  | HostLifecycle
  | HostLifecycleResult
  | HostSdkCall
  | HostSdkResult
