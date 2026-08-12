import { describe, expect, it } from 'vitest'
import {
  createMcpFailure,
  isMcpServerUnavailable,
  MCP_FAILURE_REASON_KEY,
  MCP_FAILURE_REASONS,
  readMcpFailureReason
} from './intelligence-mcp-failure'

/**
 * The distinction #971 asks for: "server went away" versus "the tool itself failed".
 *
 * `intelligence-mcp-registry` already knew it — a per-session `closed` flag, refused at three
 * separate points — and threw a plain `Error` at every one of them. The only thing separating a
 * dead transport from a tool error was the message text, so the confirmation card and the result
 * card had nothing to branch on.
 */
describe('mcp failure reason', () => {
  it('carries the reason as a readable own property', () => {
    const error = createMcpFailure('server-unavailable', 'MCP profile x is disconnected')

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('MCP profile x is disconnected')
    expect(readMcpFailureReason(error)).toBe('server-unavailable')
  })

  /**
   * The error crosses to the renderer, where it arrives copied field by field rather than as an
   * Error. So the reason has to be readable off a plain object.
   *
   * This does not distinguish `Object.assign` from a subclass -- a plant that switched to a
   * subclass kept all five cases green, because an own field on a subclass instance spreads the
   * same way. That is recorded rather than papered over: the test pins the property being own and
   * enumerable, which is what callers depend on, not the construction.
   */
  it('survives being flattened the way a transport hop flattens it', () => {
    const error = createMcpFailure('tool-failed', 'search returned an error')
    const copied = { ...error, message: error.message }

    expect(readMcpFailureReason(copied)).toBe('tool-failed')
    expect(Object.hasOwn(error, MCP_FAILURE_REASON_KEY)).toBe(true)
  })

  it('separates the two reasons rather than collapsing them', () => {
    expect(isMcpServerUnavailable(createMcpFailure('server-unavailable', 'gone'))).toBe(true)
    expect(isMcpServerUnavailable(createMcpFailure('tool-failed', 'bad input'))).toBe(false)
  })

  /**
   * `undefined` rather than a default. "We do not know" and "the tool failed" lead to different
   * UI — a retry prompt versus the tool's own error — so an unmarked error must not read as one
   * of the two.
   */
  it('reports nothing for an error that was never marked', () => {
    const unmarked = [new Error('plain'), null, undefined, 'string', {}, { mcpFailureReason: 'x' }]
    for (const value of unmarked) expect(readMcpFailureReason(value), String(value)).toBeUndefined()

    expect(isMcpServerUnavailable(new Error('plain'))).toBe(false)
  })

  it('has exactly the two reasons the callers branch on', () => {
    expect([...MCP_FAILURE_REASONS]).toEqual(['server-unavailable', 'tool-failed'])
  })
})
