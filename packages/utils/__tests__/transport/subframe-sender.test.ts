import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'
import { isSubframeSender } from '../../transport/sdk/main-transport'

/**
 * A nested frame must not reach a privileged invoke handler (#692).
 *
 * Every transport event opens a global `ipcMain.handle` channel, and the handler puts `event.sender`
 * into context without ever asking where the invoke came from. The channel-core path resolves
 * identity through `resolvePluginRegistrationByWebContents`; the invoke path had no equivalent, so
 * any frame that could name an event reached main directly.
 *
 * This closes the narrow half: a frame nested inside another document is refused. It does not
 * establish *which* window a top-level frame belongs to — that needs a trusted-sender registry and
 * is still open on the issue.
 */

const frame = (parent: unknown): Pick<IpcMainInvokeEvent, 'senderFrame'> =>
  ({ senderFrame: { parent } } as unknown as Pick<IpcMainInvokeEvent, 'senderFrame'>)

describe('isSubframeSender', () => {
  it('refuses a frame that has a parent', () => {
    expect(isSubframeSender(frame({}))).toBe(true)
  })

  it('accepts a top-level frame', () => {
    // Positive control: a guard that refused everything would satisfy the case above and break the
    // entire transport, which is the failure mode worth catching here.
    expect(isSubframeSender(frame(null))).toBe(false)
  })

  it('accepts a frame that has already been destroyed', () => {
    // senderFrame is null after the frame goes away — a race on window close, not an attack. The
    // handler sees a dead sender anyway, so refusing here would only turn a benign race into a
    // silently dropped call.
    expect(isSubframeSender({ senderFrame: null } as never)).toBe(false)
    expect(isSubframeSender({} as never)).toBe(false)
  })
})

describe('the invoke path applies it', () => {
  it('guards before dispatching to handlers', async () => {
    // Asserted against the source rather than by booting Electron: the order matters, since a check
    // placed after the handler lookup would still run the handler.
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const source = readFileSync(
      path.resolve(__dirname, '../../transport/sdk/main-transport.ts'),
      'utf8'
    )

    const guard = source.indexOf('if (isSubframeSender(event))')
    const lookup = source.indexOf('const active = invokeHandlers.get(eventName)')

    expect(guard).toBeGreaterThan(-1)
    expect(lookup).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(lookup)
  })
})
