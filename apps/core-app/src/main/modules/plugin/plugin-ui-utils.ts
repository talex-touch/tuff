/**
 * Plugin UI utilities for checking active UI views and managing upgrade flow
 */

import { DivisionBoxManager } from '../division-box/manager'

/**
 * Result of checking plugin active UI status
 */
export interface PluginActiveUIStatus {
  /** Whether the plugin has any active UI */
  hasActiveUI: boolean
  /** Active in CoreBox */
  coreBox: boolean
  /** Active DivisionBox session IDs */
  divisionBoxSessions: string[]
  /** Human-readable description */
  description?: string
}

/**
 * Check if a plugin has active UI views in CoreBox or DivisionBox
 *
 * @param pluginName - Name of the plugin to check
 * @returns Status object with active UI information
 */
export async function checkPluginActiveUI(pluginName: string): Promise<PluginActiveUIStatus> {
  const status: PluginActiveUIStatus = {
    hasActiveUI: false,
    coreBox: false,
    divisionBoxSessions: []
  }

  // Check CoreBox
  try {
    const { windowManager } = await import('../box-tool/core-box/window')
    const attachedPlugin = windowManager.getAttachedPlugin()

    if (attachedPlugin?.name === pluginName) {
      status.coreBox = true
      status.hasActiveUI = true
    }
  } catch (error) {
    console.warn('[PluginUIUtils] Failed to check CoreBox:', error)
  }

  // Check DivisionBox sessions
  try {
    const divisionBoxManager = DivisionBoxManager.getInstance()
    const activeSessions = divisionBoxManager.getActiveSessions()

    for (const session of activeSessions) {
      const attachedPlugin = session.getAttachedPlugin()
      if (attachedPlugin?.name === pluginName) {
        status.divisionBoxSessions.push(session.sessionId)
        status.hasActiveUI = true
      }
    }
  } catch (error) {
    console.warn('[PluginUIUtils] Failed to check DivisionBox:', error)
  }

  // Generate description
  if (status.hasActiveUI) {
    const parts: string[] = []
    if (status.coreBox) {
      parts.push('CoreBox')
    }
    if (status.divisionBoxSessions.length > 0) {
      parts.push(
        `DivisionBox (${status.divisionBoxSessions.length} session${status.divisionBoxSessions.length > 1 ? 's' : ''})`
      )
    }
    status.description = parts.join(', ')
  }

  return status
}

/**
 * Close all active UI views for a plugin
 *
 * @param pluginName - Name of the plugin
 * @returns Whether all views were successfully closed
 */
export async function closePluginActiveUI(pluginName: string): Promise<boolean> {
  let allClosed = true

  // Close CoreBox UI
  try {
    const { windowManager } = await import('../box-tool/core-box/window')
    const { CoreBoxManager } = await import('../box-tool/core-box/manager')
    const attachedPlugin = windowManager.getAttachedPlugin()

    if (attachedPlugin?.name === pluginName) {
      CoreBoxManager.getInstance().exitUIMode()
    }
  } catch (error) {
    console.error('[PluginUIUtils] Failed to close CoreBox UI:', error)
    allClosed = false
  }

  // Close DivisionBox sessions
  try {
    const divisionBoxManager = DivisionBoxManager.getInstance()
    const activeSessions = divisionBoxManager.getActiveSessions()

    for (const session of activeSessions) {
      const attachedPlugin = session.getAttachedPlugin()
      if (attachedPlugin?.name === pluginName) {
        try {
          await divisionBoxManager.destroySession(session.sessionId)
        } catch (error) {
          console.error(
            `[PluginUIUtils] Failed to destroy DivisionBox session ${session.sessionId}:`,
            error
          )
          allClosed = false
        }
      }
    }
  } catch (error) {
    console.error('[PluginUIUtils] Failed to close DivisionBox sessions:', error)
    allClosed = false
  }

  return allClosed
}
