import type { ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { PluginKeyManager, TuffEvent } from '@talex-touch/utils/transport'
import type {
  TerminalCloseRequest,
  TerminalCreateRequest,
  TerminalResizeRequest,
  TerminalWriteRequest
} from '@talex-touch/utils/transport/events/terminal'
import type { HandlerContext, ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { WebContents } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { PtyCreationReservation, PtySessionCore, PtySessionOwner } from './pty-session-core'
import { TerminalEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { withPermission } from '../permission/channel-guard'
import { ptySessionCore, watchPtyOwner } from './pty-session-core'

const terminalLog = createLogger('Terminal')
const SCOPE = 'terminal'

function resolveOwner(context: HandlerContext, keyManager?: PluginKeyManager): PtySessionOwner {
  const sender = context?.sender as WebContents | undefined
  if (
    !sender ||
    typeof sender.id !== 'number' ||
    typeof sender.isDestroyed !== 'function' ||
    sender.isDestroyed()
  )
    throw new Error('TERMINAL_CALLER_INVALID')
  const plugin = context.plugin
  if (plugin) {
    if (!isAuthoritativePluginContext(plugin)) throw new Error('TERMINAL_CALLER_INVALID')
    const activation = keyManager?.resolveIdentity?.(plugin.uniqueKey)
    const current = keyManager?.resolveCurrentIdentity?.(plugin.name)
    const recipient = keyManager?.resolveSenderIdentity?.(sender)
    if (
      !activation ||
      !current ||
      activation.key !== current.key ||
      activation.name !== plugin.name ||
      activation.pluginInstanceId !== plugin.identity.pluginInstanceId ||
      activation.activationGeneration !== plugin.identity.activationGeneration ||
      (recipient &&
        (recipient.key !== activation.key ||
          recipient.pluginInstanceId !== activation.pluginInstanceId ||
          recipient.activationGeneration !== activation.activationGeneration)) ||
      (!recipient &&
        (plugin.identity.authority === 'web-contents' ||
          plugin.identity.authority === 'message-port'))
    ) {
      throw new Error('TERMINAL_CALLER_INVALID')
    }
  }
  return { scope: SCOPE, sender, ...(plugin ? { pluginKey: plugin.uniqueKey } : {}) }
}

export class TerminalModule extends BaseModule {
  static key = Symbol.for('terminal')
  name: ModuleKey = TerminalModule.key
  private transport: ITuffTransportMain | null = null
  private readonly disposers: (() => void)[] = []
  private lifecycle = new AbortController()

  constructor(private readonly core: PtySessionCore = ptySessionCore) {
    super(TerminalModule.key, { create: false })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): void {
    const runtime = resolveMainRuntime(ctx, 'TerminalModule.onInit')
    const channel = runtime.app.channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const transport = getTuffTransportMain(channel, keyManager)
    this.transport = transport
    this.lifecycle = new AbortController()
    const releaseInvalidation = transport.keyManager.watchIdentityInvalidated?.((identity) => {
      void this.core.closePlugin(SCOPE, identity.key).catch(() => {
        terminalLog.warn('PTY close failed after activation invalidation')
      })
    })
    if (releaseInvalidation) this.disposers.push(releaseInvalidation)
    const permission = {
      permissionId: 'system.shell',
      failClosedForPlugin: true,
      errorMessage: 'Permission system.shell required'
    }
    const register = <TReq, TRes>(
      event: TuffEvent<TReq, TRes>,
      handler: (
        payload: TReq,
        context: HandlerContext,
        signal: AbortSignal,
        creation?: PtyCreationReservation
      ) => TRes | Promise<TRes>,
      getCreationToken?: (payload: TReq) => string | undefined
    ): void => {
      this.disposers.push(
        transport.on(event, async (payload, context) => {
          const owner = resolveOwner(context, transport.keyManager)
          const token = getCreationToken?.(payload)
          const creation =
            token === undefined
              ? undefined
              : this.core.reserveCreate(owner, token, this.lifecycle.signal)
          // Permission lookup can await; navigation during that lookup must cancel creation too.
          const watcher = watchPtyOwner(owner.sender, creation?.signal ?? this.lifecycle.signal)
          try {
            return await withPermission(permission, (request: TReq, caller) => {
              resolveOwner(caller, transport.keyManager)
              if (watcher.signal.aborted) throw new Error('TERMINAL_CREATE_CANCELLED')
              return handler(request, caller, watcher.signal, creation)
            })(payload, context)
          } finally {
            watcher.dispose()
            if (creation) this.core.discardCreate(creation)
          }
        })
      )
    }
    register(
      TerminalEvents.session.create,
      (payload, context, signal, creation) => this.create(payload, context, signal, creation),
      (payload) => payload?.creationToken
    )
    register(TerminalEvents.session.write, (payload, context) => this.write(payload, context))
    register(TerminalEvents.session.resize, (payload, context) => this.resize(payload, context))
    register(TerminalEvents.session.close, (payload, context) => this.close(payload, context))
  }

  private send<T>(context: HandlerContext, event: TuffEvent<T, void>, payload: T): void {
    try {
      this.transport?.notifyTo(context.sender, event, payload, context.plugin)
    } catch {
      terminalLog.debug('Terminal delivery failed', { meta: { eventName: event.toEventName() } })
    }
  }

  private async create(
    payload: TerminalCreateRequest,
    context: HandlerContext,
    signal: AbortSignal = this.lifecycle.signal,
    creation?: PtyCreationReservation
  ): Promise<{ id: string }> {
    const owner = resolveOwner(context, this.transport?.keyManager)
    if (!payload || typeof payload !== 'object') throw new Error('TERMINAL_COMMAND_INVALID')
    const recipient = { ...context, ...(context.plugin ? { plugin: { ...context.plugin } } : {}) }
    return await this.core.create({
      owner,
      command: payload.command,
      args: payload.args,
      cwd: payload.cwd,
      cols: payload.cols,
      rows: payload.rows,
      signal,
      creation,
      creationToken: creation ? undefined : payload.creationToken,
      validateOwner: () => {
        resolveOwner(recipient, this.transport?.keyManager)
      },
      onData: (id, data) => this.send(recipient, TerminalEvents.session.data, { id, data }),
      onExit: (id, exit) => this.send(recipient, TerminalEvents.session.exit, { id, ...exit })
    })
  }

  private write(payload: TerminalWriteRequest, context: HandlerContext): Promise<void> {
    return this.control(payload?.id, 'write', () =>
      this.core.write(payload?.id, resolveOwner(context, this.transport?.keyManager), payload?.data)
    )
  }

  private resize(payload: TerminalResizeRequest, context: HandlerContext): Promise<void> {
    return this.control(payload?.id, 'resize', () =>
      this.core.resize(
        payload?.id,
        resolveOwner(context, this.transport?.keyManager),
        payload?.cols,
        payload?.rows
      )
    )
  }

  private close(payload: TerminalCloseRequest, context: HandlerContext): Promise<void> {
    const target = payload?.id ?? payload?.creationToken
    if (typeof target !== 'string') return Promise.reject(new Error('TERMINAL_CLOSE_INVALID'))
    return this.control(target, 'close', async () => {
      const owner = resolveOwner(context, this.transport?.keyManager)
      const closed =
        payload.id !== undefined
          ? await this.core.close(payload.id, owner)
          : await this.core.cancelCreation(payload.creationToken, owner)
      if (!closed) throw new Error('TERMINAL_SESSION_NOT_FOUND')
    })
  }

  private async control(
    id: string,
    action: string,
    run: () => void | Promise<void>
  ): Promise<void> {
    try {
      await run()
    } catch (error) {
      if (error instanceof Error && error.message === 'TERMINAL_SESSION_NOT_FOUND') {
        // #911: missing and foreign sessions have identical rejection semantics and diagnostics.
        terminalLog.warn('Rejected terminal request for a session the caller does not own', {
          meta: { id, action }
        })
      }
      throw error
    }
  }

  async onDestroy(): Promise<void> {
    this.lifecycle.abort()
    for (const dispose of this.disposers.splice(0)) dispose()
    await this.core.closeScope(SCOPE)
    this.transport = null
  }
}

export const terminalModule = new TerminalModule()
