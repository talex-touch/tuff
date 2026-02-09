import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const scriptsPlugin = loadPluginModule(new URL('../../../../plugins/touch-workspace-scripts/index.js', import.meta.url))
const { __test: scriptsTest } = scriptsPlugin

describe('workspace scripts plugin', () => {
  it('uses defaults when config is empty', () => {
    const config = scriptsTest.parseScriptsConfig(null)
    expect(config.workspacePath).toBe('')
    expect(Array.isArray(config.commands)).toBe(true)
    expect(config.commands.length).toBe(0)
  })

  it('parses package scripts map', () => {
    const scripts = scriptsTest.parsePackageScriptsMap({
      lint: 'pnpm lint',
      test: 'pnpm test',
      empty: '',
      bad: null,
    })

    expect(scripts.length).toBe(2)
    expect(scripts[0].id).toBe('script:lint')
    expect(scripts[0].command).toBe('pnpm lint')
    expect(scripts[1].id).toBe('script:test')
  })

  it('resolves command cwd', () => {
    expect(scriptsTest.resolveCommandCwd('.', '/tmp/project')).toBe('/tmp/project')
    expect(scriptsTest.resolveCommandCwd('apps/core', '/tmp/project')).toBe('/tmp/project/apps/core')
    expect(scriptsTest.resolveCommandCwd('/opt/repo', '/tmp/project')).toBe('/opt/repo')
  })
})
