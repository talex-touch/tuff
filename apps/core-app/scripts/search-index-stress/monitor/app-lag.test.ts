import { describe, expect, it } from 'vitest'
import { parseAppLagLine } from './app-lag'

const READ_AT = new Date(2026, 9, 30, 12, 0, 0).getTime()

describe('parseAppLagLine', () => {
  it('reads the structured fields of the app perf monitor line', () => {
    const line =
      '[2026-10-30T11:58:12.345] [WARN] [Perf:EventLoop] Event loop lag 2.8s (2825ms) lagMs=2825 ' +
      'contexts=[{"label":"Intelligence.invoke","ageMs":120},{"label":"files.reconcile"}] ' +
      'primaryContext=Intelligence.invoke pollingActive=false suspectedCause=native_or_system_stall'
    const lag = parseAppLagLine(line, READ_AT)
    expect(lag).toEqual({
      at: new Date(2026, 9, 30, 11, 58, 12, 345).getTime(),
      lagMs: 2825,
      suspect: 'native_or_system_stall',
      contexts: ['Intelligence.invoke', 'files.reconcile']
    })
  })

  it('strips ANSI colour before matching', () => {
    const line =
      '\u001b[33m[2026-10-30T11:58:12.000] [WARN] [Perf:EventLoop] Event loop lag 450ms\u001b[0m'
    expect(parseAppLagLine(line, READ_AT)).toMatchObject({ lagMs: 450 })
  })

  it('parses lines copied from the dev log, colour codes included', () => {
    const ESC = '\u001b'
    const idle =
      `[2026-10-30T17:04:35.270] [WARN] default - [17:04:35.270] [WARN] [Perf:EventLoop] Event loop lag ${ESC}[93m910ms${ESC}[39m ` +
      `(recent=plugin-logger.flush.touch-hosts.1793366180239 ${ESC}[90m1ms${ESC}[39m) lagMs=910 contexts=[] recentContexts=[] ` +
      'pollingActive=[] pollingRecent=[{"id":"plugin-logger.flush.touch-hosts.1793366180239","lane":"io"}] ' +
      'primaryPollingRecent=plugin-logger.flush.touch-hosts.1793366180239 pollingDroppedCount=0 suspectedCause=null'
    expect(parseAppLagLine(idle, READ_AT)).toEqual({
      at: new Date(2026, 9, 30, 17, 4, 35, 270).getTime(),
      lagMs: 910
    })

    const startup =
      `[2026-10-30T06:16:18.863] [ERROR] error - [06:16:18.862] [ERROR] [Perf:EventLoop] Event loop lag ${ESC}[41m${ESC}[37m3.2s${ESC}[39m${ESC}[49m ` +
      `(context=StartupModule:Symbol(Database) ${ESC}[41m${ESC}[37m3.3s${ESC}[39m${ESC}[49m | recent=flow-bus.cleanup) lagMs=3189 ` +
      'contexts=[{"label":"StartupModule:Symbol(Database)","durationMs":3276,"mode":"blocking"}] ' +
      'primaryContext=StartupModule:Symbol(Database) recentContexts=[] pollingActive=[] suspectedCause=null'
    expect(parseAppLagLine(startup, READ_AT)).toEqual({
      at: new Date(2026, 9, 30, 6, 16, 18, 863).getTime(),
      lagMs: 3189,
      contexts: ['StartupModule:Symbol(Database)']
    })
  })

  it('derives lagMs from the head when no explicit field is present', () => {
    expect(parseAppLagLine('[Perf:EventLoop] Event loop lag 2.5s extra', READ_AT)?.lagMs).toBe(2500)
    expect(parseAppLagLine('[Perf:EventLoop] Event loop lag 240ms extra', READ_AT)?.lagMs).toBe(240)
  })

  it('falls back to the read time when the line has no timestamp', () => {
    expect(parseAppLagLine('[Perf:EventLoop] Event loop lag 300ms lagMs=300', READ_AT)?.at).toBe(
      READ_AT
    )
  })

  it('reads a bare clock time as today, or yesterday when that would be in the future', () => {
    const lag = parseAppLagLine(
      '[11:58:12.345] [Perf:EventLoop] Event loop lag 300ms lagMs=300',
      READ_AT
    )
    expect(lag?.at).toBe(new Date(2026, 9, 30, 11, 58, 12, 345).getTime())
    const future = parseAppLagLine(
      '[23:59:59.000] [Perf:EventLoop] Event loop lag 300ms lagMs=300',
      READ_AT
    )
    expect(future?.at).toBe(new Date(2026, 9, 29, 23, 59, 59, 0).getTime())
  })

  it('treats a null cause as no cause and tolerates unparsable contexts', () => {
    const lag = parseAppLagLine(
      '[Perf:EventLoop] Event loop lag 300ms lagMs=300 suspectedCause=null contexts=[{"label":"a" primaryContext=x',
      READ_AT
    )
    expect(lag).toEqual({ at: READ_AT, lagMs: 300 })
  })

  it('skips the diagnostics line that follows a lag line and unrelated lines', () => {
    expect(
      parseAppLagLine('[Perf:EventLoop] Event loop lag diagnostics lagMs=300', READ_AT)
    ).toBeNull()
    expect(parseAppLagLine('[Perf:IPC] slow handler 300ms', READ_AT)).toBeNull()
    expect(parseAppLagLine('', READ_AT)).toBeNull()
  })
})
