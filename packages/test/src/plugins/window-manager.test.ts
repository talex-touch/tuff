import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const windowPlugin = require('../../../../plugins/touch-window-manager/index.js')
const { __test: windowTest } = windowPlugin

describe('window manager', () => {
  it('builds applescript commands', () => {
    const activate = windowTest.buildAppleScript('activate', 'Safari')
    const hide = windowTest.buildAppleScript('hide', 'Safari')
    const quit = windowTest.buildAppleScript('quit', 'Safari')

    expect(activate[0]).toContain('activate')
    expect(hide[0]).toContain('hide')
    expect(quit[0]).toContain('quit')
  })
})
