// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import TxTerminal from '../src/TxTerminal.vue'

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    constructor() { throw new Error('A server renderer cannot create a browser terminal') }
  }
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    constructor() { throw new Error('A server renderer cannot measure browser geometry') }
  }
}))

describe('TxTerminal server rendering', () => {
  it('renders an accessible display region without browser globals or engine initialization', async () => {
    const html = await renderToString(createSSRApp(TxTerminal, {
      readOnly: true,
      lines: ['a client-only log'],
      labels: { ariaLabel: 'Build & deployment log' }
    }))
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="Build &amp; deployment log"')
  })
})
