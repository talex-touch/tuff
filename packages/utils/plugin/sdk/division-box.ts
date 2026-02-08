/**
 * DivisionBox SDK for Plugin Development
 *
 * Provides a simple API for plugins to create and manage DivisionBox instances.
 * DivisionBox is a lightweight floating window container for plugin UIs and tools.
 */

import type {
  CloseOptions,
  DivisionBoxConfig,
  DivisionBoxState,
  SessionInfo,
  StateChangeEvent,
} from '../../types/division-box'
import { createPluginTuffTransport } from '../../transport'
import { createDisposableBag } from '../../transport/sdk'
import { DivisionBoxEvents } from '../../transport/events'
import { ensureRendererChannel } from './channel'
import { tryGetPluginSdkApi } from './plugin-info'

function resolveSdkApi(): number | undefined {
  return tryGetPluginSdkApi()
}

/**
 * State change event handler
 */
export type StateChangeHandler = (data: {
  sessionId: string
  state: DivisionBoxState
}) => void

export type LifecycleChangeHandler = (event: StateChangeEvent) => void

/**
 * DivisionBox SDK interface for plugins
 *
 * @example
 * ```typescript
 * // Open a DivisionBox
 * const { sessionId } = await plugin.divisionBox.open({
 *   url: 'https://example.com/tool',
 *   title: 'My Tool',
 *   size: 'medium',
 *   keepAlive: true
 * })
 *
 * // Listen for state changes
 * plugin.divisionBox.onStateChange((data) => {
 *   console.log(`Session ${data.sessionId} is now ${data.state}`)
 * })
 *
 * // Close the DivisionBox
 * await plugin.divisionBox.close(sessionId)
 * ```
 */
export interface DivisionBoxSDK {
  /**
   * Opens a new DivisionBox instance
   *
   * @param config - Configuration for the DivisionBox
   * @returns Promise resolving to session information
   *
   * @example
   * ```typescript
   * const { sessionId } = await plugin.divisionBox.open({
   *   url: 'https://example.com',
   *   title: 'Web Tool',
   *   icon: 'ri:tools-line',
   *   size: 'medium',
   *   keepAlive: true,
   *   header: {
   *     show: true,
   *     title: 'Custom Title',
   *     actions: [
   *       { label: 'Refresh', icon: 'ri:refresh-line', onClick: () => {} }
   *     ]
   *   }
   * })
   * ```
   */
  open: (config: DivisionBoxConfig) => Promise<SessionInfo>

  /**
   * Closes a DivisionBox instance
   *
   * @param sessionId - The session ID to close
   * @param options - Optional close options
   * @returns Promise that resolves when closed
   *
   * @example
   * ```typescript
   * // Simple close
   * await plugin.divisionBox.close(sessionId)
   *
   * // Close with delay and animation
   * await plugin.divisionBox.close(sessionId, {
   *   delay: 1000,
   *   animation: true
   * })
   *
   * // Force close (ignore keepAlive)
   * await plugin.divisionBox.close(sessionId, {
   *   force: true
   * })
   * ```
   */
  close: (sessionId: string, options?: CloseOptions) => Promise<void>

  /**
   * Registers a state change listener
   *
   * @param handler - Callback function for state changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = plugin.divisionBox.onStateChange((data) => {
   *   console.log(`Session ${data.sessionId} changed to ${data.state}`)
   * })
   *
   * // Later, unsubscribe
   * unsubscribe()
   * ```
   */
  onStateChange: (handler: StateChangeHandler) => () => void

  onLifecycleChange: (handler: LifecycleChangeHandler) => () => void

  /**
   * Updates session state data
   *
   * @param sessionId - The session ID
   * @param key - State key
   * @param value - State value
   * @returns Promise that resolves when updated
   *
   * @example
   * ```typescript
   * // Save scroll position
   * await plugin.divisionBox.updateState(sessionId, 'scrollY', 150)
   *
   * // Save draft content
   * await plugin.divisionBox.updateState(sessionId, 'draft', {
   *   text: 'Hello world',
   *   timestamp: Date.now()
   * })
   * ```
   */
  updateState: (sessionId: string, key: string, value: any) => Promise<void>

  /**
   * Gets session state data
   *
   * @param sessionId - The session ID
   * @param key - State key
   * @returns Promise resolving to the state value
   *
   * @example
   * ```typescript
   * const scrollY = await plugin.divisionBox.getState(sessionId, 'scrollY')
   * const draft = await plugin.divisionBox.getState(sessionId, 'draft')
   * ```
   */
  getState: (sessionId: string, key: string) => Promise<any>

  /**
   * 释放 SDK 内部注册的监听器
   */
  dispose: () => void
}

/**
 * Creates a DivisionBox SDK instance for plugin use
 *
 * @param channel - The plugin channel bridge for IPC communication
 * @returns Configured DivisionBox SDK instance
 *
 * @internal
 */
export function createDivisionBoxSDK(channel: any): DivisionBoxSDK {
  const stateChangeHandlers: Set<StateChangeHandler> = new Set()
  const lifecycleChangeHandlers: Set<LifecycleChangeHandler> = new Set()
  const transport = createPluginTuffTransport(channel)
  const disposables = createDisposableBag()
  let disposed = false

  const emitStateChange = (payload: StateChangeEvent) => {
    for (const handler of lifecycleChangeHandlers) {
      try {
        handler(payload)
      }
      catch (error) {
        console.error('[DivisionBox SDK] onLifecycleChange handler error:', error)
      }
    }

    for (const handler of stateChangeHandlers) {
      try {
        handler({ sessionId: payload.sessionId, state: payload.newState })
      }
      catch (error) {
        console.error('[DivisionBox SDK] onStateChange handler error:', error)
      }
    }
  }

  const dispose = () => {
    if (disposed) {
      return
    }

    disposed = true
    stateChangeHandlers.clear()
    lifecycleChangeHandlers.clear()
    disposables.dispose()
    transport.destroy()
  }

  const ensureActive = (method: string) => {
    if (disposed) {
      throw new Error(`[DivisionBox SDK] Cannot call ${method} after dispose`)
    }
  }

  try {
    disposables.add(
      transport.on(DivisionBoxEvents.stateChanged, (payload: StateChangeEvent) => {
        emitStateChange(payload)
      }),
    )
  }
  catch {
    const registerFallback =
      typeof channel?.onMain === 'function'
        ? channel.onMain.bind(channel)
        : typeof channel?.on === 'function'
          ? channel.on.bind(channel)
          : null

    if (registerFallback) {
      const fallbackDispose = registerFallback('division-box:state-changed', (raw: any) => {
        const payload = (raw?.data || raw) as StateChangeEvent
        if (payload?.sessionId) {
          emitStateChange(payload)
        }
      })
      if (typeof fallbackDispose === 'function') {
        disposables.add(fallbackDispose)
      }
    }
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onBeforeUnload = () => dispose()
    window.addEventListener('beforeunload', onBeforeUnload, { once: true })
    disposables.add(() => window.removeEventListener('beforeunload', onBeforeUnload))
  }

  return {
    async open(config: DivisionBoxConfig): Promise<SessionInfo> {
      ensureActive('open')
      const result = await transport.send(DivisionBoxEvents.open, {
        ...(config as any),
        _sdkapi: resolveSdkApi(),
      })

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to open DivisionBox')
      }

      if (!result.data) {
        throw new Error('Failed to open DivisionBox')
      }

      return result.data
    },

    async close(sessionId: string, options?: CloseOptions): Promise<void> {
      ensureActive('close')
      const result = await transport.send(DivisionBoxEvents.close, {
        sessionId,
        options,
        _sdkapi: resolveSdkApi(),
      })

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to close DivisionBox')
      }
    },

    onStateChange(handler: StateChangeHandler): () => void {
      ensureActive('onStateChange')
      stateChangeHandlers.add(handler)

      return () => {
        stateChangeHandlers.delete(handler)
      }
    },

    onLifecycleChange(handler: LifecycleChangeHandler): () => void {
      ensureActive('onLifecycleChange')
      lifecycleChangeHandlers.add(handler)

      return () => {
        lifecycleChangeHandlers.delete(handler)
      }
    },

    async updateState(sessionId: string, key: string, value: any): Promise<void> {
      ensureActive('updateState')
      const result = await transport.send(DivisionBoxEvents.updateState, {
        sessionId,
        key,
        value,
        _sdkapi: resolveSdkApi(),
      })

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to update state')
      }
    },

    async getState(sessionId: string, key: string): Promise<any> {
      ensureActive('getState')
      const result = await transport.send(DivisionBoxEvents.getState, {
        sessionId,
        key,
        _sdkapi: resolveSdkApi(),
      })

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to get state')
      }

      return result.data
    },

    dispose,
  }
}

/**
 * Hook for using DivisionBox SDK in plugin context
 *
 * @returns DivisionBox SDK instance
 *
 * @example
 * ```typescript
 * const divisionBox = useDivisionBox()
 *
 * const { sessionId } = await divisionBox.open({
 *   url: 'https://example.com',
 *   title: 'My Tool'
 * })
 * ```
 */
export function useDivisionBox(): DivisionBoxSDK {
  const channel = ensureRendererChannel('[DivisionBox SDK] Channel not available. Make sure this is called in a plugin context.')
  return createDivisionBoxSDK(channel)
}
