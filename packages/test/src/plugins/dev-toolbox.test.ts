import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const toolboxPlugin = require('../../../../plugins/touch-dev-toolbox/index.js')
const { __test: toolboxTest } = toolboxPlugin

describe('dev toolbox config', () => {
  it('uses defaults when empty', () => {
    const config = toolboxTest.parseToolboxConfig(null)
    expect(config.workspacePath).toBe('')
    expect(Array.isArray(config.commands)).toBe(true)
    expect(Array.isArray(config.links)).toBe(true)
  })

  it('normalizes config fields', () => {
    const config = toolboxTest.parseToolboxConfig({
      workspacePath: '/tmp/project',
      commands: [{ id: 'lint', command: 'pnpm lint' }],
      links: [{ title: 'Docs', url: 'https://example.com' }],
    })

    expect(config.workspacePath).toBe('/tmp/project')
    expect(config.commands.length).toBe(1)
    expect(config.links.length).toBe(1)
  })
})
