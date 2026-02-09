import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const toolboxPlugin = loadPluginModule(new URL('../../../../plugins/touch-dev-toolbox/index.js', import.meta.url))
const { __test: toolboxTest } = toolboxPlugin

describe('dev toolbox config', () => {
  it('uses defaults when empty', () => {
    const config = toolboxTest.parseToolboxConfig(null)
    expect(Array.isArray(config.links)).toBe(true)
    expect(config.links.length).toBe(0)
  })

  it('normalizes links only', () => {
    const config = toolboxTest.parseToolboxConfig({
      workspacePath: '/tmp/project',
      commands: [{ id: 'lint', command: 'pnpm lint' }],
      links: [{ title: 'Docs', url: 'https://example.com' }],
    })

    expect(config.links.length).toBe(1)
    expect(config.workspacePath).toBeUndefined()
    expect(config.commands).toBeUndefined()
  })
})
