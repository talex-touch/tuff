import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { TuffQuery } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { coreBoxManager } from '../../box-tool/core-box/manager'
import { pluginModule } from '../plugin-module'
import { PluginViewLoader } from '../view/plugin-view-loader'
import type { TouchPlugin } from '../plugin'
import { parseFeatureShortcutId } from './feature-shortcut-id'

const featureShortcutLog = getLogger('plugin-system')

/**
 * Run one plugin feature because the user pressed its global accelerator.
 *
 * The presentation is the feature's own declaration, not a choice made here, so a shortcut lands
 * a feature in exactly the state selecting it in CoreBox would:
 *
 * - a `webcontent` feature gets its view loaded, which needs the box on screen to host it;
 * - a feature that takes input (`acceptedInputTypes`, `allowInput`, an explicit `showInput`) opens
 *   the box so there is somewhere to type;
 * - a `push` feature opens the box too, because its whole output is the list it pushes there;
 * - anything else — the one-shot actions — runs silently, with no window at all.
 *
 * The alternatives were both worse: always opening the box puts a window in front of someone who
 * bound "toggle dark mode" to a key, and never opening it makes every input-taking feature a dead
 * binding.
 */
export async function triggerFeatureShortcut(id: string): Promise<boolean> {
  const target = parseFeatureShortcutId(id)
  if (!target) {
    featureShortcutLog.warn(`Feature shortcut id is not addressable: ${id}`)
    return false
  }

  const plugin = pluginModule.pluginManager?.plugins.get(target.pluginName)
  // The same verdict `PluginFeaturesAdapter.isPluginActive` uses, so a feature reachable by
  // shortcut is exactly one reachable from CoreBox.
  const active = plugin?.status === PluginStatus.ENABLED || plugin?.status === PluginStatus.ACTIVE
  if (!plugin || !active) {
    featureShortcutLog.warn(
      `Feature shortcut ignored, plugin is not active: ${target.pluginName} (${plugin?.status})`
    )
    return false
  }

  const feature = plugin.getFeature(target.featureId)
  if (!feature) {
    featureShortcutLog.warn(
      `Feature shortcut ignored, no such feature: ${target.featureId} in ${target.pluginName}`
    )
    return false
  }

  const query: TuffQuery = { text: '', inputs: [] }

  if (feature.interaction?.type === 'webcontent') {
    if (!feature.interaction.path) {
      featureShortcutLog.error(
        `Feature shortcut aborted, webcontent feature declares no path: ${target.featureId}`
      )
      return false
    }
    coreBoxManager.trigger(true, { triggeredByShortcut: true })
    try {
      await PluginViewLoader.loadPluginView(plugin as TouchPlugin, feature, query)
      return true
    } catch (error) {
      featureShortcutLog.error('Feature shortcut failed to load the plugin view', { error })
      return false
    }
  }

  if (needsBox(feature)) {
    coreBoxManager.trigger(true, { triggeredByShortcut: true })
  }

  try {
    // Same cast the tool gateway uses (`plugin-feature-source.ts`): the interface declares
    // `Promise<void>`, but `TouchPlugin.triggerFeature` resolves the lifecycle's own return,
    // where `false` is a refusal and silence is not.
    const verdict = (await plugin.triggerFeature(feature, query)) as boolean | void
    return verdict !== false
  } catch (error) {
    featureShortcutLog.error('Feature shortcut failed to run the feature', { error })
    return false
  }
}

/**
 * Whether running this feature needs CoreBox on screen.
 *
 * Mirrors `resolveFeatureShowInput` in the features adapter plus the push case: those are the two
 * reasons the adapter activates a provider, and a shortcut has to reach the same presentation.
 */
function needsBox(feature: IPluginFeature): boolean {
  if (feature.push) return true
  if (feature.interaction?.showInput === false) return false
  if (feature.interaction?.showInput === true) return true
  if (feature.interaction?.allowInput === true) return true
  return Boolean(feature.acceptedInputTypes?.length)
}
