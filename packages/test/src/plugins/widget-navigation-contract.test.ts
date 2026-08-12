import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createPluginGlobals, loadPluginModuleWithSourceTransform } from './plugin-loader'

/**
 * `FIXED_WIDGET_NAVIGATION` in the host is a whitelist the host compares byte-for-byte
 * against the path a plugin sends -- it is not a value the host rewrites. The same literals
 * therefore exist in two packages that ship on different cadences: plugins load from userData
 * and do not update with the app, so changing one side alone breaks widget navigation for
 * every copy of the plugin already installed.
 *
 * Nothing enforced that the two copies stay identical. This suite is that enforcement (#1027).
 * It deliberately does not assert *which* path is used -- that is a migration decision -- only
 * that host and plugin still agree.
 */

const intelligencePluginUrl = new URL('../../../../plugins/touch-intelligence/index.js', import.meta.url)
const hostCapabilitiesPath = fileURLToPath(
  new URL('../../../../apps/core-app/src/main/modules/plugin/host/plugin-business-capabilities.ts', import.meta.url),
)
const assistantModulePath = fileURLToPath(
  new URL('../../../../apps/core-app/src/main/modules/assistant/module.ts', import.meta.url),
)

const PLUGIN_CONTRACT_CONSTANTS = [
  'PLUGIN_NAME',
  'OPEN_INTELLIGENCE_SETTINGS_ACTION_ID',
  'INTELLIGENCE_SETTINGS_PATH',
  'OPEN_PLUGIN_PERMISSIONS_ACTION_ID',
  'PLUGIN_PERMISSIONS_PATH',
]

interface PluginContract {
  PLUGIN_NAME: string
  OPEN_INTELLIGENCE_SETTINGS_ACTION_ID: string
  INTELLIGENCE_SETTINGS_PATH: string
  OPEN_PLUGIN_PERMISSIONS_ACTION_ID: string
  PLUGIN_PERMISSIONS_PATH: string
}

function loadPluginContract(): PluginContract {
  const pluginModule = loadPluginModuleWithSourceTransform<{ __contract: PluginContract }>(
    intelligencePluginUrl,
    source => `${source}\nmodule.exports.__contract={${PLUGIN_CONTRACT_CONSTANTS.join(',')}}`,
    createPluginGlobals(),
  )

  return pluginModule.__contract
}

interface HostNavigationEntry {
  pluginName: string
  path: string
}

/**
 * Reads the entry out of the host source rather than importing it: `FIXED_WIDGET_NAVIGATION`
 * is a module-local const in a main-process file, and exporting it purely for this guard would
 * widen the host's surface. A shape change makes the match fail, which throws here rather than
 * silently passing -- if you restructured the whitelist, update this reader deliberately.
 */
function readHostNavigationEntry(actionId: string): HostNavigationEntry {
  const source = readFileSync(hostCapabilitiesPath, 'utf8')
  const block = new RegExp(`'${actionId}':\\s*Object\\.freeze\\(\\{([^}]*)\\}`).exec(source)

  if (!block) {
    throw new Error(
      `FIXED_WIDGET_NAVIGATION['${actionId}'] not found in ${hostCapabilitiesPath}. `
      + 'If the whitelist was restructured, update this guard to match the new shape.',
    )
  }

  const pluginName = /pluginName:\s*'([^']+)'/.exec(block[1])
  const path = /path:\s*'([^']+)'/.exec(block[1])

  if (!pluginName || !path) {
    throw new Error(
      `FIXED_WIDGET_NAVIGATION['${actionId}'] no longer declares a literal pluginName and path.`,
    )
  }

  return { pluginName: pluginName[1], path: path[1] }
}

describe('intelligence widget navigation contract', () => {
  const contract = loadPluginContract()

  // Positive control: every assertion below compares against these, so a loader that silently
  // returned undefined would make the whole suite vacuous rather than red.
  it('exposes the plugin-side constants it is about to compare', () => {
    for (const name of PLUGIN_CONTRACT_CONSTANTS) {
      expect(contract[name as keyof PluginContract], `${name} must be readable from the plugin`)
        .toEqual(expect.any(String))
      expect(contract[name as keyof PluginContract].length).toBeGreaterThan(0)
    }
  })

  it('keeps the settings path identical on both sides of the host boundary', () => {
    const hostEntry = readHostNavigationEntry(contract.OPEN_INTELLIGENCE_SETTINGS_ACTION_ID)

    expect(hostEntry.path).toBe(contract.INTELLIGENCE_SETTINGS_PATH)
    expect(hostEntry.pluginName).toBe(contract.PLUGIN_NAME)
  })

  it('keeps the permissions path identical on both sides of the host boundary', () => {
    const hostEntry = readHostNavigationEntry(contract.OPEN_PLUGIN_PERMISSIONS_ACTION_ID)

    expect(hostEntry.path).toBe(contract.PLUGIN_PERMISSIONS_PATH)
    expect(hostEntry.pluginName).toBe(contract.PLUGIN_NAME)
  })

  // The assistant opens the same surface without going through the plugin, so it carries a
  // third copy of the literal. It is not validated against the whitelist, which means a partial
  // migration would leave the voice panel navigating somewhere the widget no longer goes.
  it('keeps the assistant deep link on the same path as the widget', () => {
    const source = readFileSync(assistantModulePath, 'utf8')
    const navigatePaths = [...source.matchAll(/AppEvents\.window\.navigate,\s*\{\s*path:\s*'([^']+)'/g)]
      .map(match => match[1])

    expect(navigatePaths.length, 'assistant no longer navigates by literal path; update this guard')
      .toBeGreaterThan(0)
    expect(navigatePaths).toContain(contract.INTELLIGENCE_SETTINGS_PATH)
  })
})
