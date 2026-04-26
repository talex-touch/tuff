/**
 * DivisionBox Command Provider
 *
 * Integrates DivisionBox with CoreBox command panel.
 * Allows users to search and open DivisionBox instances through the command palette.
 */

import type { ISearchProvider, TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import type { ProviderContext } from '../box-tool/search-engine/types'
import { TuffInputType } from '@talex-touch/utils'
import { divisionBoxCommandProviderLog } from './logger'
import { DivisionBoxManager } from './manager'
import { shortcutTriggerManager } from './shortcut-trigger'

type DivisionBoxCommandMeta = NonNullable<TuffItem['meta']> & {
  mappingId?: string
  config?: import('./shortcut-trigger').ShortcutMapping['config']
}

/**
 * DivisionBoxCommandProvider
 *
 * Provides DivisionBox commands in the CoreBox search interface.
 * Shows available DivisionBox shortcuts and allows opening them via command palette.
 */
export class DivisionBoxCommandProvider implements ISearchProvider<ProviderContext> {
  public readonly id = 'division-box-commands'
  public readonly type = 'plugin' as const
  public readonly name = 'DivisionBox Commands'
  public readonly icon = 'ri:window-line'
  public readonly supportedInputTypes = [TuffInputType.Text]

  private manager: DivisionBoxManager

  constructor() {
    this.manager = DivisionBoxManager.getInstance()
  }

  async onLoad(_context: ProviderContext): Promise<void> {
    divisionBoxCommandProviderLog.info('Provider loaded')
  }

  async onSearch(query: TuffQuery, _signal: AbortSignal): Promise<TuffSearchResult> {
    const startTime = Date.now()
    const keyword = query.text.toLowerCase()

    // Get all registered shortcut mappings
    const mappings = shortcutTriggerManager.getAllMappings()

    // Filter mappings based on search query
    const filteredMappings = mappings.filter((mapping) => {
      // Match against title, plugin ID, or shortcut ID
      const searchableText = [mapping.config.title, mapping.config.pluginId, mapping.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchableText.includes(keyword)
    })

    // Transform mappings to TuffItems
    const items: TuffItem[] = filteredMappings.map((mapping) =>
      this.transformMappingToItem(mapping)
    )

    const duration = Date.now() - startTime

    return {
      items,
      query,
      duration,
      sources: [
        {
          providerId: this.id,
          providerName: this.name,
          duration,
          resultCount: items.length,
          status: 'success'
        }
      ]
    }
  }

  /**
   * Transforms a shortcut mapping to a TuffItem
   */
  private transformMappingToItem(mapping: import('./shortcut-trigger').ShortcutMapping): TuffItem {
    const { config, defaultAccelerator } = mapping

    return {
      id: `division-box:${mapping.id}`,
      source: {
        id: this.id,
        type: this.type,
        name: this.name
      },
      kind: 'command',
      render: {
        mode: 'default',
        basic: {
          title: config.title,
          subtitle: `Open DivisionBox · ${defaultAccelerator}`,
          icon: config.icon
            ? {
                type: 'class',
                value: config.icon
              }
            : {
                type: 'emoji',
                value: '📦'
              }
        }
      },
      actions: [
        {
          id: 'open',
          type: 'execute',
          label: 'Open',
          shortcut: 'Enter'
        }
      ],
      meta: {
        mappingId: mapping.id,
        config
      } as DivisionBoxCommandMeta
    }
  }

  /**
   * Handles command execution
   *
   * Called when a user selects a DivisionBox command from the search results.
   *
   * @param item - The selected TuffItem
   */
  async onExecute(
    args: import('@talex-touch/utils').IExecuteArgs
  ): Promise<import('@talex-touch/utils').IProviderActivate | null> {
    const item = args.item
    try {
      // Handle opening a DivisionBox via shortcut mapping
      const mappingId =
        item.meta && 'mappingId' in item.meta ? (item.meta.mappingId as string) : undefined
      if (!mappingId) {
        divisionBoxCommandProviderLog.error('Missing mapping ID in command metadata', {
          meta: { itemId: item.id }
        })
        return null
      }

      const mapping = shortcutTriggerManager.getMapping(mappingId)
      if (!mapping) {
        divisionBoxCommandProviderLog.error('Shortcut mapping not found', {
          meta: { itemId: item.id, mappingId }
        })
        return null
      }

      // Execute beforeOpen callback if provided
      if (mapping.beforeOpen) {
        await mapping.beforeOpen()
      }

      // Create DivisionBox session
      const session = await this.manager.createSession(mapping.config)

      divisionBoxCommandProviderLog.info('DivisionBox opened from command provider', {
        meta: { mappingId, sessionId: session.sessionId }
      })

      // Execute afterOpen callback if provided
      if (mapping.afterOpen) {
        await mapping.afterOpen(session.sessionId)
      }

      return null
    } catch (error) {
      divisionBoxCommandProviderLog.error('Failed to execute command', {
        meta: { itemId: item.id },
        error
      })
      return null
    }
  }
}

/**
 * Creates and returns a DivisionBoxCommandProvider instance
 */
export function createDivisionBoxCommandProvider(): DivisionBoxCommandProvider {
  return new DivisionBoxCommandProvider()
}
