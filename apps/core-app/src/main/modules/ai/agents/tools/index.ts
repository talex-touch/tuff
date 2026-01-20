/**
 * Agent Tools
 *
 * Built-in tools for agents to use.
 */

import { registerFileTools } from './file-tools'

export { registerFileTools }

/**
 * Register all built-in tools
 */
export function registerBuiltinTools(): void {
  // Import and register all tool categories
  registerFileTools()
}
