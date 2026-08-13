import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Handlers a plugin must not be able to call (#807).
 *
 * Every transport handler is registered on the plugin channel as well as the main one, and
 * inspecting context.plugin is voluntary per handler. window.close ends the application;
 * hide and minimize deny service to the user; getCwd/getPath/getPackage hand over the
 * filesystem layout that makes a path traversal or a shell sink easy to aim.
 *
 * A separate file from common.test.ts on purpose: that one mocks node:fs with a readFileSync
 * returning '', so these assertions would have read an empty string there — and a
 * `not.toContain` written the same way would have passed while verifying nothing.
 */

const source = readFileSync(fileURLToPath(new URL('./common.ts', import.meta.url)), 'utf8')

function guardBody(): string {
  const start = source.indexOf('private assertHostOnly(')
  expect(start, 'assertHostOnly not found — this guard is reading the wrong file').toBeGreaterThan(
    -1
  )
  const end = source.indexOf('private resolvePluginTempNamespace(')
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('host-only transport handlers', () => {
  const HOST_ONLY_EVENTS = [
    'window.close',
    'window.hide',
    'window.minimize',
    'system.getCwd',
    'system.getPackage',
    'system.getPath'
  ]

  it('is reading the real source', () => {
    // Positive control for the file read itself, which is what silently failed the first
    // time this suite was written.
    expect(source.length).toBeGreaterThan(1000)
    expect(source).toContain('registerTransportHandlers')
  })

  it.each(HOST_ONLY_EVENTS)('%s refuses a plugin caller', (eventName) => {
    expect(source).toContain(`this.assertHostOnly(context, '${eventName}')`)
  })

  it('refuses rather than returning a value', () => {
    expect(guardBody()).toContain('throw new Error')
    expect(guardBody()).toContain('if (!context?.plugin) return')
  })

  it('logs which handler and which plugin', () => {
    // A refusal whose reason a plugin author cannot see reads as a broken host.
    expect(guardBody()).toContain('eventName')
    expect(guardBody()).toContain('context.plugin.name')
  })
})
