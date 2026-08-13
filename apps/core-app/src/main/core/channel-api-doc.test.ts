import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The channel API block in CLAUDE.md must match the class it describes (#612).
 *
 * Six methods were listed as one surface. They come from two classes: every main-process call takes
 * a ChannelType the doc omitted, no renderer call takes one, and four of the six do not exist in
 * the renderer at all. The `sendTo(window, eventName, arg)` form it showed matched neither side.
 *
 * Copying either half cost something different — `send('evt', payload)` is rejected by the compiler
 * in main, while `regChannel(ChannelType.MAIN, 'evt', cb)` in the renderer type-checks and
 * registers the handler under the ChannelType as its event name, so it simply never fires.
 *
 * Each documented signature is checked against the declaration it claims to describe, and the
 * renderer's absences are asserted as absences.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..')
const MAIN = readFileSync(path.join(__dirname, 'channel-core.ts'), 'utf8')
const RENDERER = readFileSync(
  path.join(REPO_ROOT, 'apps/core-app/src/renderer/src/modules/channel/channel-core.ts'),
  'utf8'
)
const CLAUDE_MD = readFileSync(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8')

/**
 * Collapses a multi-line signature to one line so it can be compared with the documented form.
 *
 * The padding inside the parentheses has to go too: the source wraps its longer signatures, which
 * flattens to `sendTo( win: …`, while the doc writes them on a single line.
 */
function flatten(source: string): string {
  return source.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
}

const flatMain = flatten(MAIN)
const flatRenderer = flatten(RENDERER)

describe('documented main-process signatures', () => {
  const signatures = [
    'regChannel(type: ChannelType, eventName: string, callback: ChannelCallback): () => void',
    'send(type: ChannelType, eventName: string, arg: unknown): Promise<unknown>',
    'sendTo(win: Electron.BrowserWindow, type: ChannelType, eventName: string, arg: unknown): Promise<unknown>',
    'sendPlugin(pluginName: string, eventName: string, arg?: unknown): Promise<unknown>',
    'revokeKey(key: string): boolean'
  ]

  it('exist in channel-core.ts', () => {
    // Positive control on the source side: a path typo would make every absence check below pass.
    expect(flatMain).toContain('class TouchChannel')
    for (const signature of signatures) expect(flatMain).toContain(signature)
  })

  it('are what CLAUDE.md shows', () => {
    const documented = flatten(CLAUDE_MD)
    for (const signature of signatures) {
      expect(documented).toContain(flatten(signature))
    }
  })

  it('never appear in CLAUDE.md without their ChannelType', () => {
    // The specific defect: `send(eventName: string, arg?: any)` attributed to the main process.
    expect(CLAUDE_MD).not.toContain('sendTo(window: BrowserWindow, eventName: string')
    expect(CLAUDE_MD).not.toMatch(/^send\(eventName: string/m)
  })
})

describe('documented renderer signatures', () => {
  it('match the renderer class', () => {
    for (const signature of [
      'regChannel<TRequest = unknown>(eventName: string, callback: (data: TRequest) => Promise<unknown> | unknown): () => void',
      'send<TRequest = unknown, TResponse = unknown>(eventName: string, arg?: TRequest): Promise<TResponse>'
    ]) {
      expect(flatRenderer).toContain(signature)
      expect(flatten(CLAUDE_MD)).toContain(flatten(signature))
    }
  })

  it('omit the four methods the renderer does not have', () => {
    // Asserted against the class body, not against the doc, so the doc cannot define its own truth.
    for (const absent of ['sendTo', 'sendPlugin', 'requestKey', 'revokeKey']) {
      expect(flatRenderer).not.toContain(`${absent}(`)
    }
    expect(CLAUDE_MD).toContain('there is no `sendTo`, `sendPlugin`, `requestKey` or `revokeKey`')
  })

  it('proves the absence check can fail', () => {
    // Control for the block above: the same query finds these methods where they do exist.
    for (const present of ['sendTo', 'sendPlugin', 'requestKey', 'revokeKey']) {
      expect(flatMain).toContain(`${present}(`)
    }
  })
})
