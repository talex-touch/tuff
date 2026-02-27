/**
 * @deprecated Use QuickActionsSDK from `quick-actions-sdk`.
 *
 * MetaSDK is kept as a compatibility alias to avoid breaking existing plugins.
 */

import type { QuickActionExecuteHandler, QuickActionsSDK } from './quick-actions-sdk'
import { createQuickActionsSDK } from './quick-actions-sdk'

/**
 * @deprecated Use QuickActionExecuteHandler.
 */
export type ActionExecuteHandler = QuickActionExecuteHandler

/**
 * @deprecated Use QuickActionsSDK.
 */
export interface MetaSDK extends QuickActionsSDK {}

/**
 * @deprecated Use createQuickActionsSDK.
 */
export function createMetaSDK(channel: any, pluginId: string): MetaSDK {
  return createQuickActionsSDK(channel, pluginId)
}
