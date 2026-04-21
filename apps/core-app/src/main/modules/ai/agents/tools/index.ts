/**
 * Agent Tools
 *
 * Built-in tools for agents to use.
 */

import { registerFileTools } from './file-tools'
import { registerWorkflowTools } from './workflow-tools'

export { registerFileTools }
export { registerWorkflowTools }

/**
 * Register all built-in tools
 */
export function registerBuiltinTools(): void {
  // Import and register all tool categories
  registerFileTools()
  registerWorkflowTools()
}
