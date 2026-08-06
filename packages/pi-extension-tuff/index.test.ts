import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'index.ts'), 'utf8')

/**
 * A live `pi 0.83` run proved the executor is called as
 * `(toolCallId, params, …)`. Reading that as `(args)` handed the call id to the
 * tool as its parameters and every call failed argument validation — a bug no
 * unit test caught because nothing here owns pi's signature. These assertions
 * pin the shape so a refactor cannot quietly go back to the wrong one.
 */
describe('pi extension executor contract', () => {
  it('takes the tool call id first and the model arguments second', () => {
    expect(source).toContain('execute: (toolCallId, params) =>')
    expect(source).not.toMatch(/execute:\s*args\s*=>/)
  })

  it('forwards both the call id and the arguments to the gateway', () => {
    expect(source).toContain('JSON.stringify({ tool, callId, args })')
  })

  it('registers nothing without the gateway environment', () => {
    // A plain `pi` run outside Tuff must not advertise tools it cannot reach.
    expect(source).toMatch(/if \(!GATEWAY_URL \|\| !GATEWAY_TOKEN\)\s*\n\s*return/)
  })
})
